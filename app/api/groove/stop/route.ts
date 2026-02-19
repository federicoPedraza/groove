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

type StopRequestBody = {
  workspaceRoot?: unknown;
  rootName?: unknown;
  knownWorktrees?: unknown;
  workspaceMeta?: unknown;
  worktree?: unknown;
  instanceId?: unknown;
  dir?: unknown;
};

type StopRequestContext = {
  workspaceRoot?: string;
  rootName?: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMetaContext;
  worktree: string;
  instancePid?: number;
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

type StopResponse = {
  requestId: string;
  ok: boolean;
  alreadyStopped?: boolean;
  pid?: number;
  source?: "request" | "runtime";
  error?: string;
};

type StopAttemptResult =
  | { ok: true; alreadyStopped: false; pid: number }
  | { ok: true; alreadyStopped: true; pid: number }
  | { ok: false; status: number; message: string; pid: number };

type RuntimeRow = {
  worktree: string;
  opencodeState: "running" | "not-running" | "unknown";
  opencodeInstanceId?: string;
};

function looksLikeBranchName(value: string): boolean {
  return value.includes("/");
}

function looksLikeWorktreeName(value: string): boolean {
  return !value.includes("/");
}

function parseWorktreeHeader(
  value: string,
  knownWorktrees: Set<string>,
): Pick<RuntimeRow, "worktree"> | null {
  const headerMatch = value.match(/^-\s+(.+?)\s+\((.+)\)$/u);
  if (!headerMatch) {
    return null;
  }

  const firstToken = headerMatch[1].trim();
  const secondToken = headerMatch[2].trim();
  if (firstToken.length === 0 || secondToken.length === 0) {
    return null;
  }

  if (knownWorktrees.has(firstToken) && !knownWorktrees.has(secondToken)) {
    return { worktree: firstToken };
  }

  if (knownWorktrees.has(secondToken) && !knownWorktrees.has(firstToken)) {
    return { worktree: secondToken };
  }

  const firstLooksLikeBranch = looksLikeBranchName(firstToken);
  const secondLooksLikeBranch = looksLikeBranchName(secondToken);

  if (firstLooksLikeBranch && looksLikeWorktreeName(secondToken) && !secondLooksLikeBranch) {
    return { worktree: secondToken };
  }

  if (secondLooksLikeBranch && looksLikeWorktreeName(firstToken) && !firstLooksLikeBranch) {
    return { worktree: firstToken };
  }

  return { worktree: secondToken };
}

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

function parsePid(
  value: unknown,
  label: string,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true };
  }

  let raw = "";
  if (typeof value === "number" && Number.isFinite(value)) {
    raw = String(value);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else {
    return { ok: false, message: `${label} must be a numeric PID when provided.` };
  }

  if (!/^\d+$/u.test(raw)) {
    return { ok: false, message: `${label} must contain only digits.` };
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { ok: false, message: `${label} must be a positive integer PID.` };
  }

  return { ok: true, value: parsed };
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
  worktree: string,
  knownWorktrees: string[],
  expectedWorkspaceMeta: WorkspaceMetaContext | undefined,
): Promise<CandidateRoot | null> {
  const selectedWorktreePath = path.join(rootPath, ".worktrees", worktree);
  if (!(await pathIsDirectory(selectedWorktreePath))) {
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
  worktree: string,
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
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }

      const childPath = path.join(normalizedDirectoryPath, entry.name);
      if (entry.name === rootName) {
        const candidate = await inspectCandidateRoot(
          childPath,
          worktree,
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

async function resolveWorkspaceRoot(context: StopRequestContext): Promise<RootResolutionResult> {
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
    context.worktree,
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
        `Could not auto-resolve workspace root for rootName \"${context.rootName.trim()}\" and worktree \"${context.worktree}\". Re-open the workspace in the browser and rescan worktrees. If this remains ambiguous, provide workspaceRoot override in the request.`,
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

function parseOpencodeSegment(value: string): Pick<RuntimeRow, "opencodeState" | "opencodeInstanceId"> {
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

function parseRuntimeRows(stdout: string, knownWorktrees: readonly string[]): Record<string, RuntimeRow> {
  const rowsByWorktree: Record<string, RuntimeRow> = {};
  const knownWorktreeSet = new Set(knownWorktrees);

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) {
      continue;
    }

    const segments = line.split("|").map((segment) => segment.trim());
    if (segments.length === 0) {
      continue;
    }

    const header = parseWorktreeHeader(segments[0], knownWorktreeSet);
    if (!header) {
      continue;
    }

    const worktree = header.worktree;
    if (worktree.length === 0) {
      continue;
    }

    let opencodeState: RuntimeRow["opencodeState"] = "unknown";
    let opencodeInstanceId: string | undefined;
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
    }

    rowsByWorktree[worktree] = {
      worktree,
      opencodeState,
      ...(opencodeInstanceId ? { opencodeInstanceId } : {}),
    };
  }

  return rowsByWorktree;
}

async function resolveRuntimePid(
  route: string,
  requestId: string,
  workspaceRoot: string,
  worktree: string,
  knownWorktrees: readonly string[],
  dirOverride: string | undefined,
): Promise<{
  ok: true;
  pid?: number;
} | {
  ok: false;
  status: number;
  message: string;
}> {
  const args = ["list"];
  if (dirOverride) {
    args.push("--dir", dirOverride);
  }

  logDebug(route, requestId, "runtime.resolve.invoke", {
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

  logDebug(route, requestId, "runtime.resolve.completed", {
    exitCode: commandResult.exitCode,
    ok: commandResult.exitCode === 0,
    durationMs: Date.now() - commandStartedAt,
    ...summarizeCommandOutput(commandResult.stdout, commandResult.stderr),
  });

  if (commandResult.error || commandResult.exitCode !== 0) {
    return {
      ok: false,
      status: 500,
      message: commandResult.error ?? "Unable to resolve opencode PID from groove list.",
    };
  }

  const runtimeRows = parseRuntimeRows(commandResult.stdout, knownWorktrees);
  const row = runtimeRows[worktree];
  if (!row || row.opencodeState !== "running" || !row.opencodeInstanceId) {
    return { ok: true };
  }

  const pidValidation = parsePid(row.opencodeInstanceId, "runtime instanceId");
  if (!pidValidation.ok) {
    logWarn(route, requestId, "runtime.resolve.invalid-instance-id", {
      worktree,
      instanceId: row.opencodeInstanceId,
      message: pidValidation.message,
    });
    return { ok: true };
  }

  return {
    ok: true,
    pid: pidValidation.value,
  };
}

function stopProcessByPid(pid: number): StopAttemptResult {
  try {
    process.kill(pid, "SIGTERM");
    return {
      ok: true,
      alreadyStopped: false,
      pid,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ESRCH") {
      return {
        ok: true,
        alreadyStopped: true,
        pid,
      };
    }

    if (err.code === "EPERM") {
      return {
        ok: false,
        status: 403,
        pid,
        message: `Permission denied while sending SIGTERM to PID ${String(pid)}.`,
      };
    }

    return {
      ok: false,
      status: 500,
      pid,
      message: `Failed to stop PID ${String(pid)}: ${err.message}`,
    };
  }
}

function parseStopRequestBody(
  parsedBody: StopRequestBody,
): { ok: true; value: StopRequestContext } | { ok: false; message: string } {
  if (typeof parsedBody.worktree !== "string" || parsedBody.worktree.trim().length === 0) {
    return {
      ok: false,
      message: "worktree is required and must be a non-empty string.",
    };
  }

  const worktree = parsedBody.worktree.trim();
  if (!isSafePathToken(worktree)) {
    return {
      ok: false,
      message: "worktree contains unsafe characters or path segments.",
    };
  }

  const knownWorktreesValidation = parseKnownWorktrees(parsedBody.knownWorktrees);
  if (!knownWorktreesValidation.ok) {
    return {
      ok: false,
      message: knownWorktreesValidation.message,
    };
  }

  const pidValidation = parsePid(parsedBody.instanceId, "instanceId");
  if (!pidValidation.ok) {
    return {
      ok: false,
      message: pidValidation.message,
    };
  }

  const dirValidation = validateOptionalFlagPath(parsedBody.dir, "dir");
  if (!dirValidation.ok) {
    return {
      ok: false,
      message: dirValidation.message,
    };
  }

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
  }

  return {
    ok: true,
    value: {
      workspaceRoot:
        typeof parsedBody.workspaceRoot === "string" ? parsedBody.workspaceRoot.trim() : undefined,
      rootName: typeof parsedBody.rootName === "string" ? parsedBody.rootName.trim() : undefined,
      knownWorktrees: knownWorktreesValidation.value,
      workspaceMeta: parseWorkspaceMetaContext(parsedBody.workspaceMeta),
      worktree,
      instancePid: pidValidation.value,
      dir: dirValidation.value,
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const route = "api.groove.stop";
  const requestId = getRequestId(request);
  const requestStartedAt = Date.now();

  const respond = (status: number, body: Omit<StopResponse, "requestId">): Response => {
    return NextResponse.json<StopResponse>(
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
    let parsedBody: StopRequestBody;
    try {
      parsedBody = (await request.json()) as StopRequestBody;
    } catch {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-json",
        status: 400,
      });
      return respond(400, {
        ok: false,
        error: "Request body must be valid JSON.",
      });
    }

    const parsedRequest = parseStopRequestBody(parsedBody);
    if (!parsedRequest.ok) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-payload",
        status: 400,
        message: parsedRequest.message,
      });
      return respond(400, {
        ok: false,
        error: parsedRequest.message,
      });
    }

    const stopContext = parsedRequest.value;
    logDebug(route, requestId, "input.summary", {
      rootName: stopContext.rootName,
      workspaceRootProvided: stopContext.workspaceRoot !== undefined,
      knownWorktreesCount: stopContext.knownWorktrees.length,
      hasWorkspaceMeta: stopContext.workspaceMeta !== undefined,
      hasInstancePid: stopContext.instancePid !== undefined,
      hasDirOverride: stopContext.dir !== undefined,
      worktree: stopContext.worktree,
    });

    logDebug(route, requestId, "workspace.resolve.attempt", {
      mode: stopContext.workspaceRoot === undefined ? "auto" : "override",
      worktree: stopContext.worktree,
    });

    const rootResolution = await resolveWorkspaceRoot(stopContext);
    if (!rootResolution.ok) {
      logWarn(route, requestId, "workspace.resolve.failed", {
        status: 400,
        message: rootResolution.message,
      });
      return respond(400, {
        ok: false,
        error: rootResolution.message,
      });
    }

    const workspaceRoot = rootResolution.workspaceRoot;
    logDebug(route, requestId, "workspace.resolve.succeeded", {
      workspaceRoot,
    });

    let pidToStop = stopContext.instancePid;
    let source: StopResponse["source"] = pidToStop !== undefined ? "request" : undefined;

    if (pidToStop === undefined) {
      const runtimeResolution = await resolveRuntimePid(
        route,
        requestId,
        workspaceRoot,
        stopContext.worktree,
        stopContext.knownWorktrees,
        stopContext.dir,
      );

      if (!runtimeResolution.ok) {
        logWarn(route, requestId, "runtime.resolve.failed", {
          status: runtimeResolution.status,
          message: runtimeResolution.message,
        });
        return respond(runtimeResolution.status, {
          ok: false,
          error: runtimeResolution.message,
        });
      }

      pidToStop = runtimeResolution.pid;
      source = pidToStop !== undefined ? "runtime" : undefined;
    }

    if (pidToStop === undefined) {
      logInfo(route, requestId, "stop.already-stopped", {
        reason: "pid-not-available",
        worktree: stopContext.worktree,
      });
      logInfo(route, requestId, "request.completed", {
        status: 200,
        durationMs: Date.now() - requestStartedAt,
      });
      return respond(200, {
        ok: true,
        alreadyStopped: true,
      });
    }

    logInfo(route, requestId, "stop.invoke", {
      pid: pidToStop,
      source,
      worktree: stopContext.worktree,
      signal: "SIGTERM",
    });

    const stopAttempt = stopProcessByPid(pidToStop);
    if (!stopAttempt.ok) {
      logWarn(route, requestId, "stop.failed", {
        pid: stopAttempt.pid,
        source,
        status: stopAttempt.status,
        message: stopAttempt.message,
      });
      return respond(stopAttempt.status, {
        ok: false,
        pid: stopAttempt.pid,
        source,
        error: stopAttempt.message,
      });
    }

    if (stopAttempt.alreadyStopped) {
      logInfo(route, requestId, "stop.already-stopped", {
        reason: "process-not-found",
        pid: stopAttempt.pid,
        source,
      });
    } else {
      logInfo(route, requestId, "stop.succeeded", {
        pid: stopAttempt.pid,
        source,
      });
    }

    logInfo(route, requestId, "request.completed", {
      status: 200,
      durationMs: Date.now() - requestStartedAt,
    });

    return respond(200, {
      ok: true,
      alreadyStopped: stopAttempt.alreadyStopped,
      pid: stopAttempt.pid,
      source,
    });
  } catch (error) {
    logError(route, requestId, "request.exception", {
      ...serializeError(error),
      status: 500,
      durationMs: Date.now() - requestStartedAt,
    });
    return respond(500, {
      ok: false,
      error: "Unexpected error while processing groove stop request.",
    });
  }
}
