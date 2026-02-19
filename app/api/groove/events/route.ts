import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  getRequestId,
  logDebug,
  logError,
  logInfo,
  logWarn,
  responseHeadersWithRequestId,
  serializeError,
} from "../_shared/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const MAX_DISCOVERY_DEPTH = 4;
const MAX_DISCOVERY_DIRECTORIES = 2500;
const POLL_INTERVAL_MS = 1800;
const KEEPALIVE_INTERVAL_MS = 25000;
const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  "dist",
  "node_modules",
]);

type WorkspaceMetaContext = {
  version?: number;
  rootName?: string;
  createdAt?: string;
  updatedAt?: string;
};

type EventQueryContext = {
  workspaceRoot?: string;
  rootName?: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMetaContext;
};

type RootResolutionResult =
  | { ok: true; workspaceRoot: string }
  | { ok: false; message: string };

type CandidateRoot = {
  rootPath: string;
  hasWorkspaceMeta: boolean;
  matchesWorkspaceMeta: boolean;
};

type SnapshotEntry = {
  exists: boolean;
  mtimeMs: number;
};

type EventRouteErrorResponse = {
  ok: false;
  requestId: string;
  error: string;
};

function isSafePathToken(value: string): boolean {
  if (!SAFE_TOKEN_PATTERN.test(value)) {
    return false;
  }

  const segments = value.split("/");
  return !segments.some((segment) => segment === "." || segment === "..");
}

function isValidRootName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return !trimmed.includes("/") && !trimmed.includes("\\") && trimmed !== "." && trimmed !== "..";
}

function parseKnownWorktrees(
  value: unknown,
): { ok: true; value: string[] } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: "knownWorktrees must be an array when provided." };
  }

  if (value.length > 128) {
    return { ok: false, message: "knownWorktrees is too large (max 128 entries)." };
  }

  const sanitized = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      return {
        ok: false,
        message: "knownWorktrees entries must be non-empty strings.",
      };
    }

    const trimmed = entry.trim();
    if (!isSafePathToken(trimmed)) {
      return {
        ok: false,
        message: "knownWorktrees contains unsafe characters or path segments.",
      };
    }

    sanitized.add(trimmed);
  }

  return {
    ok: true,
    value: [...sanitized],
  };
}

async function pathIsDirectory(pathValue: string): Promise<boolean> {
  try {
    const stats = await stat(pathValue);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function pathIsFile(pathValue: string): Promise<boolean> {
  try {
    const stats = await stat(pathValue);
    return stats.isFile();
  } catch {
    return false;
  }
}

function buildLikelySearchBases(): string[] {
  const bases = new Set<string>();

  let cursor = path.resolve(process.cwd());
  bases.add(cursor);

  for (let depth = 0; depth < 3; depth += 1) {
    const nextCursor = path.dirname(cursor);
    if (nextCursor === cursor) {
      break;
    }

    bases.add(nextCursor);
    cursor = nextCursor;
  }

  bases.add(path.resolve(os.homedir()));
  return [...bases];
}

async function readWorkspaceJson(
  workspaceRoot: string,
): Promise<WorkspaceMetaContext | undefined> {
  const workspaceJsonPath = path.join(workspaceRoot, ".groove", "workspace.json");
  if (!(await pathIsFile(workspaceJsonPath))) {
    return undefined;
  }

  try {
    const raw = await readFile(workspaceJsonPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const meta: WorkspaceMetaContext = {};
    if (typeof parsed.version === "number" && Number.isFinite(parsed.version)) {
      meta.version = parsed.version;
    }
    if (typeof parsed.rootName === "string" && parsed.rootName.trim().length > 0) {
      meta.rootName = parsed.rootName.trim();
    }
    if (typeof parsed.createdAt === "string" && parsed.createdAt.trim().length > 0) {
      meta.createdAt = parsed.createdAt.trim();
    }
    if (typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0) {
      meta.updatedAt = parsed.updatedAt.trim();
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
  } catch {
    return undefined;
  }
}

function workspaceMetaMatchesContext(
  observed: WorkspaceMetaContext | undefined,
  expected: WorkspaceMetaContext | undefined,
): boolean {
  if (!expected || !observed) {
    return false;
  }

  if (expected.rootName && observed.rootName !== expected.rootName) {
    return false;
  }

  if (expected.createdAt && observed.createdAt !== expected.createdAt) {
    return false;
  }

  if (typeof expected.version === "number" && observed.version !== expected.version) {
    return false;
  }

  return true;
}

async function inspectCandidateRoot(
  rootPath: string,
  knownWorktrees: string[],
  expectedWorkspaceMeta: WorkspaceMetaContext | undefined,
): Promise<CandidateRoot | null> {
  if (!(await pathIsDirectory(path.join(rootPath, ".worktrees")))) {
    return null;
  }

  for (const knownWorktree of knownWorktrees) {
    const knownWorktreePath = path.join(rootPath, ".worktrees", knownWorktree);
    if (!(await pathIsDirectory(knownWorktreePath))) {
      return null;
    }
  }

  const observedWorkspaceMeta = await readWorkspaceJson(rootPath);
  return {
    rootPath,
    hasWorkspaceMeta: observedWorkspaceMeta !== undefined,
    matchesWorkspaceMeta: workspaceMetaMatchesContext(
      observedWorkspaceMeta,
      expectedWorkspaceMeta,
    ),
  };
}

async function discoverWorkspaceRootCandidates(
  rootName: string,
  knownWorktrees: string[],
  expectedWorkspaceMeta: WorkspaceMetaContext | undefined,
): Promise<CandidateRoot[]> {
  const candidateMap = new Map<string, CandidateRoot>();
  const visitedDirectories = new Set<string>();
  let scannedDirectoryCount = 0;

  const walk = async (directoryPath: string, depth: number): Promise<void> => {
    const normalizedDirectoryPath = path.resolve(directoryPath);
    if (visitedDirectories.has(normalizedDirectoryPath)) {
      return;
    }

    visitedDirectories.add(normalizedDirectoryPath);
    if (scannedDirectoryCount >= MAX_DISCOVERY_DIRECTORIES) {
      return;
    }

    scannedDirectoryCount += 1;

    let entries;
    try {
      entries = await readdir(normalizedDirectoryPath, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      const childPath = path.join(normalizedDirectoryPath, entry.name);

      if (entry.name === rootName) {
        const candidate = await inspectCandidateRoot(
          childPath,
          knownWorktrees,
          expectedWorkspaceMeta,
        );

        if (candidate) {
          candidateMap.set(candidate.rootPath, candidate);
        }
      }

      if (depth >= MAX_DISCOVERY_DEPTH || SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      await walk(childPath, depth + 1);

      if (scannedDirectoryCount >= MAX_DISCOVERY_DIRECTORIES) {
        return;
      }
    }
  };

  for (const base of buildLikelySearchBases()) {
    await walk(base, 0);
    if (scannedDirectoryCount >= MAX_DISCOVERY_DIRECTORIES) {
      break;
    }
  }

  return [...candidateMap.values()].sort((left, right) => left.rootPath.localeCompare(right.rootPath));
}

async function validateWorkspaceRootPath(workspaceRoot: string): Promise<RootResolutionResult> {
  const normalizedWorkspaceRoot = path.normalize(workspaceRoot.trim());

  if (!path.isAbsolute(normalizedWorkspaceRoot)) {
    return {
      ok: false,
      message:
        "workspaceRoot override must be an absolute path starting with '/'. Example: /home/you/projects/next.",
    };
  }

  if (!(await pathIsDirectory(normalizedWorkspaceRoot))) {
    return {
      ok: false,
      message:
        `workspaceRoot override \"${normalizedWorkspaceRoot}\" is not an existing, accessible directory for the app server. Verify the path and permissions.`,
    };
  }

  return {
    ok: true,
    workspaceRoot: normalizedWorkspaceRoot,
  };
}

async function resolveWorkspaceRoot(context: EventQueryContext): Promise<RootResolutionResult> {
  if (context.workspaceRoot !== undefined) {
    return validateWorkspaceRootPath(context.workspaceRoot);
  }

  if (!isValidRootName(context.rootName)) {
    return {
      ok: false,
      message:
        "Could not auto-resolve workspace root: rootName is required when workspaceRoot is omitted.",
    };
  }

  const candidates = await discoverWorkspaceRootCandidates(
    context.rootName.trim(),
    context.knownWorktrees,
    context.workspaceMeta,
  );

  if (candidates.length === 1) {
    return {
      ok: true,
      workspaceRoot: candidates[0].rootPath,
    };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        `Could not auto-resolve workspace root for rootName \"${context.rootName.trim()}\". Re-open the workspace in the browser and rescan worktrees. If this remains ambiguous, provide workspaceRoot override in the request.`,
    };
  }

  const metadataMatches = candidates.filter((candidate) => candidate.matchesWorkspaceMeta);
  if (metadataMatches.length === 1) {
    return {
      ok: true,
      workspaceRoot: metadataMatches[0].rootPath,
    };
  }

  const candidatesWithWorkspaceMeta = candidates.filter((candidate) => candidate.hasWorkspaceMeta);
  const diagnosticCandidates =
    metadataMatches.length > 1
      ? metadataMatches
      : candidatesWithWorkspaceMeta.length > 0
        ? candidatesWithWorkspaceMeta
        : candidates;

  const preview = diagnosticCandidates
    .slice(0, 5)
    .map((candidate) => candidate.rootPath)
    .join(", ");

  return {
    ok: false,
    message:
      `Could not auto-resolve workspace root: found ${String(candidates.length)} matches (${preview}). Provide workspaceRoot override to choose the exact root path.`,
  };
}

function parseEventQuery(requestUrl: URL): { ok: true; value: EventQueryContext } | { ok: false; message: string } {
  const workspaceRootRaw = requestUrl.searchParams.get("workspaceRoot");
  const rootNameRaw = requestUrl.searchParams.get("rootName");
  const knownWorktreesRaw = requestUrl.searchParams.getAll("knownWorktree");

  const knownWorktreesValidation = parseKnownWorktrees(knownWorktreesRaw);
  if (!knownWorktreesValidation.ok) {
    return {
      ok: false,
      message: knownWorktreesValidation.message,
    };
  }

  const workspaceVersionRaw = requestUrl.searchParams.get("workspaceVersion");
  const workspaceCreatedAtRaw = requestUrl.searchParams.get("workspaceCreatedAt");
  const workspaceUpdatedAtRaw = requestUrl.searchParams.get("workspaceUpdatedAt");

  const workspaceMeta: WorkspaceMetaContext = {};
  if (workspaceVersionRaw !== null && workspaceVersionRaw.trim().length > 0) {
    const parsedVersion = Number(workspaceVersionRaw);
    if (!Number.isFinite(parsedVersion)) {
      return {
        ok: false,
        message: "workspaceVersion must be numeric when provided.",
      };
    }

    workspaceMeta.version = parsedVersion;
  }

  if (workspaceCreatedAtRaw !== null && workspaceCreatedAtRaw.trim().length > 0) {
    workspaceMeta.createdAt = workspaceCreatedAtRaw.trim();
  }

  if (workspaceUpdatedAtRaw !== null && workspaceUpdatedAtRaw.trim().length > 0) {
    workspaceMeta.updatedAt = workspaceUpdatedAtRaw.trim();
  }

  if (rootNameRaw !== null && rootNameRaw.trim().length > 0) {
    workspaceMeta.rootName = rootNameRaw.trim();
  }

  if (workspaceRootRaw !== null && workspaceRootRaw.trim().length === 0) {
    return {
      ok: false,
      message: "workspaceRoot must be a non-empty absolute path string when provided.",
    };
  }

  return {
    ok: true,
    value: {
      workspaceRoot: workspaceRootRaw?.trim(),
      rootName: rootNameRaw?.trim(),
      knownWorktrees: knownWorktreesValidation.value,
      workspaceMeta: Object.keys(workspaceMeta).length > 0 ? workspaceMeta : undefined,
    },
  };
}

function formatSseEvent(type: string, payload: Record<string, string | number | boolean>): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function getSnapshotEntry(pathValue: string): Promise<SnapshotEntry> {
  try {
    const stats = await stat(pathValue);
    return {
      exists: true,
      mtimeMs: stats.mtimeMs,
    };
  } catch {
    return {
      exists: false,
      mtimeMs: 0,
    };
  }
}

export async function GET(request: Request): Promise<Response> {
  const route = "api.groove.events";
  const requestId = getRequestId(request);
  const requestStartedAt = Date.now();
  const requestUrl = new URL(request.url);

  const respondError = (status: number, error: string): Response => {
    return NextResponse.json<EventRouteErrorResponse>(
      {
        ok: false,
        requestId,
        error,
      },
      {
        status,
        headers: responseHeadersWithRequestId(requestId),
      },
    );
  };

  logInfo(route, requestId, "request.received", {
    method: request.method,
    path: requestUrl.pathname,
  });

  try {
    const parsedQuery = parseEventQuery(requestUrl);
    if (!parsedQuery.ok) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-query",
        status: 400,
        message: parsedQuery.message,
      });
      return respondError(400, parsedQuery.message);
    }

    logDebug(route, requestId, "input.summary", {
      rootName: parsedQuery.value.rootName,
      workspaceRootProvided: parsedQuery.value.workspaceRoot !== undefined,
      knownWorktreesCount: parsedQuery.value.knownWorktrees.length,
      hasWorkspaceMeta: parsedQuery.value.workspaceMeta !== undefined,
    });

    logDebug(route, requestId, "workspace.resolve.attempt", {
      mode: parsedQuery.value.workspaceRoot === undefined ? "auto" : "override",
    });
    const rootResolution = await resolveWorkspaceRoot(parsedQuery.value);
    if (!rootResolution.ok) {
      logWarn(route, requestId, "workspace.resolve.failed", {
        status: 400,
        message: rootResolution.message,
      });
      return respondError(400, rootResolution.message);
    }

    const workspaceRoot = rootResolution.workspaceRoot;
    logDebug(route, requestId, "workspace.resolve.succeeded", {
      workspaceRoot,
    });

    const workspaceWatchTargets = [
      path.join(workspaceRoot, ".worktrees"),
      path.join(workspaceRoot, ".groove"),
    ];

    const knownWorktreeWatchTargets = parsedQuery.value.knownWorktrees.map((worktree) =>
      path.join(workspaceRoot, ".worktrees", worktree, ".groove"),
    );

    const pollTargets = [
      ...workspaceWatchTargets,
      path.join(workspaceRoot, ".groove", "workspace.json"),
      ...knownWorktreeWatchTargets,
      ...parsedQuery.value.knownWorktrees.map((worktree) =>
        path.join(workspaceRoot, ".worktrees", worktree, ".groove", "workspace.json"),
      ),
    ];

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller): Promise<void> {
        let streamClosed = false;
        let eventCounter = 0;
        let watcherSetupSuccessCount = 0;
        let watcherSetupFailureCount = 0;
        let watcherErrorCount = 0;
        let pollChangeCount = 0;
        let fallbackEventCount = 0;
        const teardownCallbacks: Array<() => void> = [];

        logInfo(route, requestId, "stream.open", {
          workspaceRoot,
          watchTargets: workspaceWatchTargets.length + knownWorktreeWatchTargets.length + 2,
          pollTargets: pollTargets.length,
          durationMsSinceRequest: Date.now() - requestStartedAt,
        });

        const closeStream = (reason: string): void => {
          if (streamClosed) {
            return;
          }

          streamClosed = true;

          for (const teardown of teardownCallbacks) {
            try {
              teardown();
            } catch {
              // Ignore teardown errors during stream shutdown.
            }
          }

          logInfo(route, requestId, "stream.close", {
            reason,
            emittedEvents: eventCounter,
            watcherSetupSuccessCount,
            watcherSetupFailureCount,
            watcherErrorCount,
            pollChangeCount,
            fallbackEventCount,
          });

          try {
            controller.close();
          } catch {
            // Stream might already be closed by the runtime.
          }
        };

        const emitWorkspaceEvent = (source: string): void => {
          if (streamClosed) {
            return;
          }

          eventCounter += 1;
          controller.enqueue(
            encoder.encode(
              formatSseEvent("workspace-change", {
                index: eventCounter,
                source,
                kind: "filesystem",
              }),
            ),
          );

          if (eventCounter <= 3 || eventCounter % 25 === 0) {
            logDebug(route, requestId, "stream.event.emitted", {
              source,
              eventCounter,
            });
          }
        };

        controller.enqueue(
          encoder.encode(
            formatSseEvent("ready", {
              requestId,
              workspaceRoot,
              kind: "filesystem",
            }),
          ),
        );

        const keepalive = setInterval(() => {
          if (!streamClosed) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        }, KEEPALIVE_INTERVAL_MS);

        teardownCallbacks.push(() => {
          clearInterval(keepalive);
        });

        const watchFileOrDirectory = (
          targetPath: string,
          label: string,
          filterName?: string,
        ): FSWatcher | null => {
          try {
            const watcher = watch(targetPath, { persistent: false }, (eventType, filename) => {
              if (filterName !== undefined) {
                const normalizedName = typeof filename === "string" ? filename : "";
                if (normalizedName !== filterName) {
                  return;
                }
              }

              emitWorkspaceEvent(`${label}:${eventType}`);
            });

            watcherSetupSuccessCount += 1;
            logDebug(route, requestId, "watcher.setup", {
              label,
              targetPath,
              filterName,
              mode: "fs.watch",
            });

            watcher.on("error", (error) => {
              watcherErrorCount += 1;
              fallbackEventCount += 1;
              logWarn(route, requestId, "watcher.error", {
                label,
                targetPath,
                error: serializeError(error),
              });
              emitWorkspaceEvent(`${label}:watch-error`);
            });

            teardownCallbacks.push(() => {
              watcher.close();
            });

            return watcher;
          } catch (error) {
            watcherSetupFailureCount += 1;
            logWarn(route, requestId, "watcher.setup.failed", {
              label,
              targetPath,
              filterName,
              mode: "fs.watch",
              error: serializeError(error),
            });
            return null;
          }
        };

        watchFileOrDirectory(workspaceRoot, "workspace-root", ".worktrees");
        watchFileOrDirectory(workspaceRoot, "workspace-root", ".groove");

        for (const target of workspaceWatchTargets) {
          watchFileOrDirectory(target, target.endsWith(".groove") ? ".groove" : ".worktrees");
        }

        for (const target of knownWorktreeWatchTargets) {
          watchFileOrDirectory(target, "worktree-.groove");
        }

        const snapshots = new Map<string, SnapshotEntry>();
        for (const target of pollTargets) {
          snapshots.set(target, await getSnapshotEntry(target));
        }

        const pollInterval = setInterval(() => {
          void (async () => {
            for (const target of pollTargets) {
              const previous = snapshots.get(target) ?? { exists: false, mtimeMs: 0 };
              const next = await getSnapshotEntry(target);

              if (previous.exists !== next.exists || previous.mtimeMs !== next.mtimeMs) {
                snapshots.set(target, next);
                pollChangeCount += 1;
                fallbackEventCount += 1;
                logDebug(route, requestId, "poll.change-detected", {
                  target: path.basename(target),
                  pollChangeCount,
                });
                emitWorkspaceEvent(`poll:${path.basename(target)}`);
              }
            }
          })().catch((error) => {
            logError(route, requestId, "poll.exception", {
              error: serializeError(error),
            });
          });
        }, POLL_INTERVAL_MS);

        teardownCallbacks.push(() => {
          clearInterval(pollInterval);
        });

        const abortSignal = request.signal;
        if (abortSignal.aborted) {
          closeStream("already-aborted");
          return;
        }

        const handleAbort = (): void => {
          closeStream("request-aborted");
        };

        abortSignal.addEventListener("abort", handleAbort);
        teardownCallbacks.push(() => {
          abortSignal.removeEventListener("abort", handleAbort);
        });

        // Groove's CLI script currently has no formal event bus endpoint.
        // This stream is intentionally filesystem-driven over workspace paths.
      },
      cancel(): void {
        logDebug(route, requestId, "stream.cancel", {
          note: "handled by request.signal abort callbacks",
        });
      },
    });

    logInfo(route, requestId, "request.completed", {
      status: 200,
      durationMs: Date.now() - requestStartedAt,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...responseHeadersWithRequestId(requestId),
      },
    });
  } catch (error) {
    logError(route, requestId, "request.exception", {
      ...serializeError(error),
      status: 500,
      durationMs: Date.now() - requestStartedAt,
    });
    return respondError(500, "Unexpected error while opening groove events stream.");
  }
}
