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

type NewRequestBody = {
  workspaceRoot?: unknown;
  rootName?: unknown;
  knownWorktrees?: unknown;
  workspaceMeta?: unknown;
  branch?: unknown;
  base?: unknown;
  dir?: unknown;
};

type WorkspaceMetaContext = {
  version?: number;
  rootName?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RootResolutionResult =
  | { ok: true; workspaceRoot: string }
  | { ok: false; message: string };

type CandidateRoot = {
  rootPath: string;
  hasWorkspaceMeta: boolean;
  matchesWorkspaceMeta: boolean;
};

type NewResponse = {
  requestId: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  command?: {
    binary: string;
    args: string[];
    cwd: string;
  };
};

type CommandRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type NewStatusContext = {
  status: number;
  error?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  value: unknown,
  label: string,
): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, message: `${label} must be a non-empty string when provided.` };
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

  return { ok: true, value: trimmed };
}

function parseWorkspaceMetaContext(value: unknown): WorkspaceMetaContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const parsed: WorkspaceMetaContext = {};

  if (typeof candidate.version === "number" && Number.isFinite(candidate.version)) {
    parsed.version = candidate.version;
  }

  if (typeof candidate.rootName === "string" && candidate.rootName.trim().length > 0) {
    parsed.rootName = candidate.rootName.trim();
  }

  if (typeof candidate.createdAt === "string" && candidate.createdAt.trim().length > 0) {
    parsed.createdAt = candidate.createdAt.trim();
  }

  if (typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0) {
    parsed.updatedAt = candidate.updatedAt.trim();
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
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

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch {
    return false;
  }
}

async function checkGitWorkTreeContext(workspaceRoot: string): Promise<boolean> {
  const gitPath = path.join(workspaceRoot, ".git");
  if (await pathExists(gitPath)) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    const child = spawn("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: workspaceRoot,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      resolve(false);
    });

    child.on("close", (exitCode) => {
      resolve(exitCode === 0 && stdout.trim() === "true");
    });
  });
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
    const parsed = JSON.parse(raw) as unknown;
    return parseWorkspaceMetaContext(parsed);
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

  const bases = buildLikelySearchBases();
  for (const base of bases) {
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
        `workspaceRoot override \"${normalizedWorkspaceRoot}\" is not an existing, accessible directory for the app server. Verify the path and permissions, then retry create worktree.`,
    };
  }

  return {
    ok: true,
    workspaceRoot: normalizedWorkspaceRoot,
  };
}

async function resolveWorkspaceRoot(parsedBody: NewRequestBody): Promise<RootResolutionResult> {
  if (parsedBody.workspaceRoot !== undefined) {
    if (
      typeof parsedBody.workspaceRoot !== "string" ||
      parsedBody.workspaceRoot.trim().length === 0
    ) {
      return {
        ok: false,
        message:
          "workspaceRoot override must be a non-empty absolute path string when provided.",
      };
    }

    return validateWorkspaceRootPath(parsedBody.workspaceRoot);
  }

  if (!isValidRootName(parsedBody.rootName)) {
    return {
      ok: false,
      message:
        "Could not auto-resolve workspace root: rootName is required when workspaceRoot is omitted.",
    };
  }

  const rootName = parsedBody.rootName.trim();

  const knownWorktreesValidation = parseKnownWorktrees(parsedBody.knownWorktrees);
  if (!knownWorktreesValidation.ok) {
    return {
      ok: false,
      message: knownWorktreesValidation.message,
    };
  }

  const expectedWorkspaceMeta = parseWorkspaceMetaContext(parsedBody.workspaceMeta);
  const candidates = await discoverWorkspaceRootCandidates(
    rootName,
    knownWorktreesValidation.value,
    expectedWorkspaceMeta,
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
        `Could not auto-resolve workspace root for rootName "${rootName}". Re-open the workspace in the browser and rescan worktrees, then retry create worktree. If this remains ambiguous, provide workspaceRoot override in the create request.`,
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
      `Could not auto-resolve workspace root: found ${String(candidates.length)} matches for rootName "${rootName}" (${preview}). Narrow the context by reopening the intended workspace and retrying create worktree, or provide workspaceRoot override to choose the exact root path.`,
  };
}

async function runCommand(binary: string, args: string[], cwd: string): Promise<CommandRunResult> {
  return await new Promise<CommandRunResult>((resolve) => {
    const child = spawn(binary, args, {
      cwd,
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
        error: `Failed to execute ${binary}: ${error.message}`,
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
}

function inferFailureStatusAndError(result: NewResponse): NewStatusContext {
  const combined = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();

  if (/already exists|already checked out/.test(combined)) {
    return { status: 409 };
  }

  if (/invalid|unknown|usage:|not a valid object name/.test(combined)) {
    return { status: 400 };
  }

  if (result.exitCode === null) {
    return {
      status: 500,
      error: result.error ?? "Failed to execute groove create.",
    };
  }

  return { status: 422 };
}

export async function POST(request: Request): Promise<Response> {
  const route = "api.groove.new";
  const requestId = getRequestId(request);
  const requestStartedAt = Date.now();

  const respond = (status: number, body: Omit<NewResponse, "requestId">): Response => {
    return NextResponse.json<NewResponse>(
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
    path: new URL(request.url).pathname,
  });

  try {
    let parsedBody: NewRequestBody;
    try {
      parsedBody = (await request.json()) as NewRequestBody;
    } catch {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-json",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "Request body must be valid JSON.",
      });
    }

    logDebug(route, requestId, "input.summary", {
      rootName: typeof parsedBody.rootName === "string" ? parsedBody.rootName.trim() : undefined,
      workspaceRootProvided: typeof parsedBody.workspaceRoot === "string",
      knownWorktreesCount: Array.isArray(parsedBody.knownWorktrees)
        ? parsedBody.knownWorktrees.length
        : 0,
      hasWorkspaceMeta: typeof parsedBody.workspaceMeta === "object" && parsedBody.workspaceMeta !== null,
      branch: typeof parsedBody.branch === "string" ? parsedBody.branch.trim() : undefined,
      hasBase: typeof parsedBody.base === "string" && parsedBody.base.trim().length > 0,
      hasDirOverride: typeof parsedBody.dir === "string" && parsedBody.dir.trim().length > 0,
    });

    if (typeof parsedBody.branch !== "string" || parsedBody.branch.trim().length === 0) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-branch",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "branch is required and must be a non-empty string.",
      });
    }

    const branch = parsedBody.branch.trim();
    if (!isSafePathToken(branch)) {
      logWarn(route, requestId, "validation.failed", {
        reason: "unsafe-branch-token",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "branch contains unsafe characters or path segments.",
      });
    }

    let base: string | undefined;
    if (parsedBody.base !== undefined) {
      if (typeof parsedBody.base !== "string" || parsedBody.base.trim().length === 0) {
        logWarn(route, requestId, "validation.failed", {
          reason: "invalid-base",
          status: 400,
        });
        return respond(400, {
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "base must be a non-empty string when provided.",
        });
      }

      base = parsedBody.base.trim();
      if (!isSafePathToken(base)) {
        logWarn(route, requestId, "validation.failed", {
          reason: "unsafe-base-token",
          status: 400,
        });
        return respond(400, {
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "base contains unsafe characters or path segments.",
        });
      }
    }

    const dirValidation = validateOptionalFlagPath(parsedBody.dir, "dir");
    if (!dirValidation.ok) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-dir-flag",
        status: 400,
        message: dirValidation.message,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: dirValidation.message,
      });
    }

    logDebug(route, requestId, "workspace.resolve.attempt", {
      mode: parsedBody.workspaceRoot === undefined ? "auto" : "override",
      branch,
    });
    const rootResolution = await resolveWorkspaceRoot(parsedBody);
    if (!rootResolution.ok) {
      logWarn(route, requestId, "workspace.resolve.failed", {
        status: 400,
        message: rootResolution.message,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: rootResolution.message,
      });
    }

    const workspaceRoot = rootResolution.workspaceRoot;
    logDebug(route, requestId, "workspace.resolve.succeeded", {
      workspaceRoot,
    });

    const hasGitContext = await checkGitWorkTreeContext(workspaceRoot);
    if (!hasGitContext) {
      logWarn(route, requestId, "validation.failed", {
        reason: "workspace-not-git-context",
        status: 400,
        workspaceRoot,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error:
          `Resolved workspace root "${workspaceRoot}" is not a Git work tree context (.git is missing and git rev-parse failed). Set the workspaceRoot override field to the repository root and retry create worktree.`,
      });
    }

    const args = ["create", branch];
    if (base) {
      args.push("--base", base);
    }
    if (dirValidation.value) {
      args.push("--dir", dirValidation.value);
    }

    logInfo(route, requestId, "command.invoke", {
      binary: GROOVE_BIN,
      args,
      cwd: workspaceRoot,
    });

    const commandStartedAt = Date.now();
    const commandResult = await runCommand(GROOVE_BIN, args, workspaceRoot);
    if (commandResult.error) {
      logError(route, requestId, "command.error", {
        message: commandResult.error,
      });
    }

    const result: NewResponse = {
      requestId,
      ok: commandResult.exitCode === 0,
      exitCode: commandResult.exitCode,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      ...(commandResult.error ? { error: commandResult.error } : {}),
      command: {
        binary: GROOVE_BIN,
        args,
        cwd: workspaceRoot,
      },
    };

    logInfo(route, requestId, "command.completed", {
      exitCode: result.exitCode,
      ok: result.ok,
      durationMs: Date.now() - commandStartedAt,
      ...summarizeCommandOutput(result.stdout, result.stderr),
    });

    if (result.ok) {
      logInfo(route, requestId, "request.completed", {
        status: 200,
        durationMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json<NewResponse>(result, {
        status: 200,
        headers: responseHeadersWithRequestId(requestId),
      });
    }

    const failureContext = inferFailureStatusAndError(result);
    logWarn(route, requestId, "command.failed.status-mapped", {
      mappedStatus: failureContext.status,
      mappedError: failureContext.error,
      exitCode: result.exitCode,
    });

    logInfo(route, requestId, "request.completed", {
      status: failureContext.status,
      durationMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json<NewResponse>(
      {
        ...result,
        ...(failureContext.error ? { error: failureContext.error } : {}),
      },
      {
        status: failureContext.status,
        headers: responseHeadersWithRequestId(requestId),
      },
    );
  } catch (error) {
    logError(route, requestId, "request.exception", {
      ...serializeError(error),
      status: 500,
      durationMs: Date.now() - requestStartedAt,
    });

    return respond(500, {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: "Unexpected error while processing groove create request.",
    });
  }
}
