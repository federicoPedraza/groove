import { spawn } from "node:child_process";
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
  summarizeCommandOutput,
} from "../_shared/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROOVE_BIN = "/home/ionaline/.local/bin/groove";
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const MAX_DISCOVERY_DEPTH = 4;
const MAX_DISCOVERY_DIRECTORIES = 2500;
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

type ListQueryContext = {
  workspaceRoot?: string;
  rootName?: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMetaContext;
  dir?: string;
};

type RootResolutionResult =
  | { ok: true; workspaceRoot: string }
  | { ok: false; message: string };

type CandidateRoot = {
  rootPath: string;
  hasWorkspaceMeta: boolean;
  matchesWorkspaceMeta: boolean;
};

type OpencodeState = "running" | "not-running" | "unknown";
type LogState = "latest" | "broken-latest" | "none" | "unknown";

type GrooveListRow = {
  branch: string;
  worktree: string;
  opencodeState: OpencodeState;
  opencodeInstanceId?: string;
  logState: LogState;
  logTarget?: string;
};

type ListResponse = {
  requestId: string;
  ok: boolean;
  workspaceRoot?: string;
  rows: Record<string, GrooveListRow>;
  stdout: string;
  stderr: string;
  error?: string;
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

function validateOptionalFlagPath(
  value: string | undefined,
  label: string,
): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (value.trim().length === 0) {
    return {
      ok: false,
      message: `${label} must be a non-empty string when provided.`,
    };
  }

  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return { ok: false, message: `${label} must be a relative path.` };
  }

  if (!isSafePathToken(trimmed)) {
    return {
      ok: false,
      message: `${label} contains unsafe characters or path segments.`,
    };
  }

  return {
    ok: true,
    value: trimmed,
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
    matchesWorkspaceMeta: workspaceMetaMatchesContext(observedWorkspaceMeta, expectedWorkspaceMeta),
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
      entries = await readdir(normalizedDirectoryPath, { withFileTypes: true });
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

async function resolveWorkspaceRoot(context: ListQueryContext): Promise<RootResolutionResult> {
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

function parseListQuery(requestUrl: URL): { ok: true; value: ListQueryContext } | { ok: false; message: string } {
  const workspaceRootRaw = requestUrl.searchParams.get("workspaceRoot");
  const rootNameRaw = requestUrl.searchParams.get("rootName");
  const knownWorktreesRaw = requestUrl.searchParams.getAll("knownWorktree");
  const dirRaw = requestUrl.searchParams.get("dir");

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

  const dirValidation = validateOptionalFlagPath(dirRaw?.trim(), "dir");
  if (!dirValidation.ok) {
    return {
      ok: false,
      message: dirValidation.message,
    };
  }

  return {
    ok: true,
    value: {
      workspaceRoot: workspaceRootRaw?.trim(),
      rootName: rootNameRaw?.trim(),
      knownWorktrees: knownWorktreesValidation.value,
      workspaceMeta: Object.keys(workspaceMeta).length > 0 ? workspaceMeta : undefined,
      dir: dirValidation.value,
    },
  };
}

function parseOpencodeSegment(value: string): Pick<GrooveListRow, "opencodeState" | "opencodeInstanceId"> {
  const normalized = value.trim();
  const instanceMatch = normalized.match(/\binstance=([^\s|]+)/u);

  if (/^running\b/u.test(normalized)) {
    return {
      opencodeState: "running",
      ...(instanceMatch ? { opencodeInstanceId: instanceMatch[1] } : {}),
    };
  }

  if (/\bnot[-\s]?running\b/u.test(normalized) || /^stopped\b/u.test(normalized)) {
    return {
      opencodeState: "not-running",
      ...(instanceMatch ? { opencodeInstanceId: instanceMatch[1] } : {}),
    };
  }

  return {
    opencodeState: "unknown",
    ...(instanceMatch ? { opencodeInstanceId: instanceMatch[1] } : {}),
  };
}

function parseLogSegment(value: string): Pick<GrooveListRow, "logState" | "logTarget"> {
  const normalized = value.trim();

  const latestMatch = normalized.match(/^latest->(.+)$/u);
  if (latestMatch) {
    const target = latestMatch[1].trim();
    return {
      logState: "latest",
      ...(target.length > 0 ? { logTarget: path.basename(target) } : {}),
    };
  }

  const brokenLatestMatch = normalized.match(/^broken-?latest->(.+)$/u);
  if (brokenLatestMatch) {
    const target = brokenLatestMatch[1].trim();
    return {
      logState: "broken-latest",
      ...(target.length > 0 ? { logTarget: path.basename(target) } : {}),
    };
  }

  if (/^none\b/u.test(normalized)) {
    return { logState: "none" };
  }

  return { logState: "unknown" };
}

function looksLikeBranchName(value: string): boolean {
  return value.includes("/");
}

function looksLikeWorktreeName(value: string): boolean {
  return !value.includes("/");
}

function parseWorktreeHeader(
  value: string,
  knownWorktrees: Set<string>,
): Pick<GrooveListRow, "worktree" | "branch"> | null {
  const headerMatch = value.match(/^-\s+(.+?)\s+\((.+)\)$/u);
  if (!headerMatch) {
    return null;
  }

  const firstToken = headerMatch[1].trim();
  const secondToken = headerMatch[2].trim();
  if (firstToken.length === 0 || secondToken.length === 0) {
    return null;
  }

  // Preferred/new format: "- branch (worktree)"
  // Older/alternate format: "- worktree (branch)"
  // Use known worktrees first, then lightweight token heuristics, then default to new format.
  if (knownWorktrees.has(firstToken) && !knownWorktrees.has(secondToken)) {
    return {
      worktree: firstToken,
      branch: secondToken,
    };
  }

  if (knownWorktrees.has(secondToken) && !knownWorktrees.has(firstToken)) {
    return {
      worktree: secondToken,
      branch: firstToken,
    };
  }

  const firstLooksLikeBranch = looksLikeBranchName(firstToken);
  const secondLooksLikeBranch = looksLikeBranchName(secondToken);

  if (firstLooksLikeBranch && looksLikeWorktreeName(secondToken) && !secondLooksLikeBranch) {
    return {
      worktree: secondToken,
      branch: firstToken,
    };
  }

  if (secondLooksLikeBranch && looksLikeWorktreeName(firstToken) && !firstLooksLikeBranch) {
    return {
      worktree: firstToken,
      branch: secondToken,
    };
  }

  return {
    worktree: secondToken,
    branch: firstToken,
  };
}

function parseGrooveListOutput(stdout: string, knownWorktrees: readonly string[] = []): {
  rowsByWorktree: Record<string, GrooveListRow>;
  malformedLineCount: number;
} {
  const rowsByWorktree: Record<string, GrooveListRow> = {};
  const knownWorktreeSet = new Set(knownWorktrees);
  let malformedLineCount = 0;

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    if (!line.startsWith("- ")) {
      continue;
    }

    const segments = line.split("|").map((segment) => segment.trim());
    if (segments.length === 0) {
      malformedLineCount += 1;
      continue;
    }

    const header = parseWorktreeHeader(segments[0], knownWorktreeSet);
    if (!header) {
      malformedLineCount += 1;
      continue;
    }

    const { worktree, branch } = header;

    let opencodeState: OpencodeState = "unknown";
    let opencodeInstanceId: string | undefined;
    let logState: LogState = "unknown";
    let logTarget: string | undefined;

    for (const segment of segments.slice(1)) {
      const separatorIndex = segment.indexOf(":");
      if (separatorIndex < 0) {
        continue;
      }

      const key = segment.slice(0, separatorIndex).trim().toLowerCase();
      const value = segment.slice(separatorIndex + 1).trim();

      if (key === "opencode") {
        const parsed = parseOpencodeSegment(value);
        opencodeState = parsed.opencodeState;
        opencodeInstanceId = parsed.opencodeInstanceId;
      }

      if (key === "log") {
        const parsed = parseLogSegment(value);
        logState = parsed.logState;
        logTarget = parsed.logTarget;
      }
    }

    rowsByWorktree[worktree] = {
      worktree,
      branch,
      opencodeState,
      ...(opencodeInstanceId ? { opencodeInstanceId } : {}),
      logState,
      ...(logTarget ? { logTarget } : {}),
    };
  }

  return {
    rowsByWorktree,
    malformedLineCount,
  };
}

export async function GET(request: Request): Promise<Response> {
  const route = "api.groove.list";
  const requestId = getRequestId(request);
  const requestStartedAt = Date.now();
  const requestUrl = new URL(request.url);

  const respond = (status: number, body: Omit<ListResponse, "requestId">): Response => {
    return NextResponse.json<ListResponse>(
      {
        requestId,
        ...body,
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
    const parsedQuery = parseListQuery(requestUrl);
    if (!parsedQuery.ok) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-query",
        status: 400,
        message: parsedQuery.message,
      });
      return respond(400, {
        ok: false,
        rows: {},
        stdout: "",
        stderr: "",
        error: parsedQuery.message,
      });
    }

    logDebug(route, requestId, "input.summary", {
      rootName: parsedQuery.value.rootName,
      workspaceRootProvided: parsedQuery.value.workspaceRoot !== undefined,
      knownWorktreesCount: parsedQuery.value.knownWorktrees.length,
      hasWorkspaceMeta: parsedQuery.value.workspaceMeta !== undefined,
      hasDirOverride: parsedQuery.value.dir !== undefined,
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
      return respond(400, {
        ok: false,
        rows: {},
        stdout: "",
        stderr: "",
        error: rootResolution.message,
      });
    }

    const workspaceRoot = rootResolution.workspaceRoot;
    logDebug(route, requestId, "workspace.resolve.succeeded", {
      workspaceRoot,
    });

    const args = ["list"];
    if (parsedQuery.value.dir) {
      args.push("--dir", parsedQuery.value.dir);
    }

    logInfo(route, requestId, "command.invoke", {
      binary: GROOVE_BIN,
      args,
      cwd: workspaceRoot,
    });

    const commandStartedAt = Date.now();
    const commandResult = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      error?: string;
    }>((resolve) => {
      const child = spawn(GROOVE_BIN, args, {
        cwd: workspaceRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error: Error) => {
        resolve({
          exitCode: null,
          stdout,
          stderr,
          error: `Failed to execute groove list: ${error.message}`,
        });
      });

      child.on("close", (exitCode) => {
        resolve({
          exitCode,
          stdout,
          stderr,
        });
      });
    });

    if (commandResult.error) {
      logError(route, requestId, "command.error", {
        message: commandResult.error,
      });
    }

    logInfo(route, requestId, "command.completed", {
      exitCode: commandResult.exitCode,
      ok: commandResult.exitCode === 0,
      durationMs: Date.now() - commandStartedAt,
      ...summarizeCommandOutput(commandResult.stdout, commandResult.stderr),
    });

    if (commandResult.exitCode !== 0 || commandResult.error) {
      const errorMessage = commandResult.error ?? "groove list failed.";
      logWarn(route, requestId, "command.failed", {
        status: 500,
        exitCode: commandResult.exitCode,
        errorMessage,
      });

      logInfo(route, requestId, "request.completed", {
        status: 500,
        durationMs: Date.now() - requestStartedAt,
      });

      return respond(500, {
        ok: false,
        workspaceRoot,
        rows: {},
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        error: errorMessage,
      });
    }

    const parsedOutput = parseGrooveListOutput(commandResult.stdout, parsedQuery.value.knownWorktrees);
    const rowCount = Object.keys(parsedOutput.rowsByWorktree).length;
    logDebug(route, requestId, "parse.completed", {
      rowCount,
      malformedLineCount: parsedOutput.malformedLineCount,
    });

    logInfo(route, requestId, "request.completed", {
      status: 200,
      durationMs: Date.now() - requestStartedAt,
    });

    return respond(200, {
      ok: true,
      workspaceRoot,
      rows: parsedOutput.rowsByWorktree,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
    });
  } catch (error) {
    logError(route, requestId, "request.exception", {
      ...serializeError(error),
      status: 500,
      durationMs: Date.now() - requestStartedAt,
    });

    return respond(500, {
      ok: false,
      rows: {},
      stdout: "",
      stderr: "",
      error: "Unexpected error while processing groove list request.",
    });
  }
}
