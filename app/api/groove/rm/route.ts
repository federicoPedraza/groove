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

type RmRequestBody = {
  workspaceRoot?: unknown;
  rootName?: unknown;
  knownWorktrees?: unknown;
  workspaceMeta?: unknown;
  target?: unknown;
  worktree?: unknown;
  dir?: unknown;
  force?: unknown;
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

type RmResponse = {
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

type RmStatusContext = {
  status: number;
  error?: string;
};

type CommandRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isSafePathToken(value: string): boolean {
  if (!SAFE_TOKEN_PATTERN.test(value)) {
    return false;
  }

  const segments = value.split("/");
  return !segments.some((segment) => segment === "." || segment === "..");
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

async function resolveBranchFromWorktree(worktreePath: string): Promise<string | undefined> {
  return await new Promise<string | undefined>((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: worktreePath,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      resolve(undefined);
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        resolve(undefined);
        return;
      }

      const branchName = stdout.trim();
      if (!branchName || branchName === "HEAD") {
        resolve(undefined);
        return;
      }

      resolve(branchName);
    });
  });
}

function inferFailureStatusAndError(result: RmResponse): RmStatusContext {
  const combined = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();

  if (/not found|no such/.test(combined)) {
    return { status: 404 };
  }

  if (/contains modified or untracked files|use --force to delete it/.test(combined)) {
    return { status: 409 };
  }

  if (/invalid|unknown|usage:/.test(combined)) {
    return { status: 400 };
  }

  if (result.exitCode === null) {
    return {
      status: 500,
      error: result.error ?? "Failed to execute groove rm.",
    };
  }

  return { status: 422 };
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

function isPathWithinDirectory(parentDirectory: string, candidatePath: string): boolean {
  const relative = path.relative(parentDirectory, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function parseRegisteredWorktreePaths(stdout: string): Set<string> {
  const registeredPaths = new Set<string>();
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.startsWith("worktree ")) {
      continue;
    }

    const worktreePath = line.slice("worktree ".length).trim();
    if (worktreePath.length === 0) {
      continue;
    }

    registeredPaths.add(path.resolve(worktreePath));
  }

  return registeredPaths;
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
  if (!expected) {
    return false;
  }

  if (!observed) {
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
    matchesWorkspaceMeta: workspaceMetaMatchesContext(
      observedWorkspaceMeta,
      expectedWorkspaceMeta,
    ),
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
        `workspaceRoot override \"${normalizedWorkspaceRoot}\" is not an existing, accessible directory for the app server. Verify the path and permissions, then retry cut groove.`,
    };
  }

  return {
    ok: true,
    workspaceRoot: normalizedWorkspaceRoot,
  };
}

async function resolveWorkspaceRoot(
  parsedBody: RmRequestBody,
  worktree: string,
): Promise<RootResolutionResult> {
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
    worktree,
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
        `Could not auto-resolve workspace root for rootName "${rootName}" and worktree "${worktree}". Re-open the workspace in the browser and rescan worktrees, then retry cut groove. If this remains ambiguous, provide workspaceRoot override in the request.`,
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
      `Could not auto-resolve workspace root: found ${String(candidates.length)} matches for rootName "${rootName}" and worktree "${worktree}" (${preview}). Narrow the context by reopening the intended workspace and retrying cut groove, or provide workspaceRoot override to choose the exact root path.`,
  };
}

export async function POST(request: Request): Promise<Response> {
  const route = "api.groove.rm";
  const requestId = getRequestId(request);
  const requestStartedAt = Date.now();

  const respond = (status: number, body: Omit<RmResponse, "requestId">): Response => {
    return NextResponse.json<RmResponse>(
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
    let parsedBody: RmRequestBody;
    try {
      parsedBody = (await request.json()) as RmRequestBody;
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
      hasDirOverride: typeof parsedBody.dir === "string" && parsedBody.dir.trim().length > 0,
      force: parsedBody.force === true,
    });

    if (typeof parsedBody.target !== "string" || parsedBody.target.trim().length === 0) {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-target",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "target is required and must be a non-empty string.",
      });
    }

    const target = parsedBody.target.trim();
    if (!isSafePathToken(target)) {
      logWarn(route, requestId, "validation.failed", {
        reason: "unsafe-target-token",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "target contains unsafe characters or path segments.",
      });
    }

    const resolutionWorktreeRaw =
      typeof parsedBody.worktree === "string" && parsedBody.worktree.trim().length > 0
        ? parsedBody.worktree.trim()
        : target;

    if (!isSafePathToken(resolutionWorktreeRaw)) {
      logWarn(route, requestId, "validation.failed", {
        reason: "unsafe-worktree-token",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "worktree contains unsafe characters or path segments.",
      });
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

    if (parsedBody.force !== undefined && typeof parsedBody.force !== "boolean") {
      logWarn(route, requestId, "validation.failed", {
        reason: "invalid-force-flag",
        status: 400,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "force must be a boolean when provided.",
      });
    }

    const force = parsedBody.force === true;

    logDebug(route, requestId, "workspace.resolve.attempt", {
      mode: parsedBody.workspaceRoot === undefined ? "auto" : "override",
      worktree: resolutionWorktreeRaw,
    });
    const rootResolution = await resolveWorkspaceRoot(parsedBody, resolutionWorktreeRaw);
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

    const workspaceDir = dirValidation.value ?? ".worktrees";
    const expectedWorktreesDirPath = path.resolve(workspaceRoot, workspaceDir);
    const targetWorktreePath = path.resolve(expectedWorktreesDirPath, resolutionWorktreeRaw);

    if (!isPathWithinDirectory(expectedWorktreesDirPath, targetWorktreePath)) {
      logWarn(route, requestId, "validation.failed", {
        reason: "target-worktree-outside-expected-dir",
        status: 400,
        expectedWorktreesDirPath,
        targetWorktreePath,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error:
          `Resolved worktree path "${targetWorktreePath}" is outside expected worktrees directory "${expectedWorktreesDirPath}".`,
      });
    }

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
          `Resolved workspace root "${workspaceRoot}" is not a Git work tree context (.git is missing and git rev-parse failed). Set the workspaceRoot override field to the repository root and retry cut groove.`,
      });
    }

    if (!(await pathIsDirectory(targetWorktreePath))) {
      logWarn(route, requestId, "validation.failed", {
        reason: "target-worktree-missing",
        status: 400,
        targetWorktreePath,
      });
      return respond(400, {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error:
          `Worktree directory not found at "${targetWorktreePath}". Confirm worktree "${resolutionWorktreeRaw}" exists under "${workspaceDir}" for workspace root "${workspaceRoot}", or set workspaceRoot override to the correct repository root.`,
      });
    }

    if (force) {
      const listCommandStartedAt = Date.now();
      const listCommandBinary = "git";
      const listCommandArgs = ["worktree", "list", "--porcelain"];

      logDebug(route, requestId, "force.validate-registered-worktree.invoke", {
        binary: listCommandBinary,
        args: listCommandArgs,
        cwd: workspaceRoot,
      });

      const listResult = await runCommand(listCommandBinary, listCommandArgs, workspaceRoot);

      logDebug(route, requestId, "force.validate-registered-worktree.completed", {
        exitCode: listResult.exitCode,
        ok: listResult.exitCode === 0,
        durationMs: Date.now() - listCommandStartedAt,
        ...summarizeCommandOutput(listResult.stdout, listResult.stderr),
      });

      if (listResult.exitCode !== 0 || listResult.error) {
        logWarn(route, requestId, "validation.failed", {
          reason: "git-worktree-list-failed",
          status: 500,
          exitCode: listResult.exitCode,
          error: listResult.error,
        });
        return respond(500, {
          ok: false,
          exitCode: listResult.exitCode,
          stdout: listResult.stdout,
          stderr: listResult.stderr,
          error: listResult.error ?? "Failed to inspect registered Git worktrees.",
          command: {
            binary: listCommandBinary,
            args: listCommandArgs,
            cwd: workspaceRoot,
          },
        });
      }

      const registeredWorktreePaths = parseRegisteredWorktreePaths(listResult.stdout);
      if (!registeredWorktreePaths.has(targetWorktreePath)) {
        logWarn(route, requestId, "validation.failed", {
          reason: "target-worktree-not-registered",
          status: 409,
          targetWorktreePath,
        });
        return respond(409, {
          ok: false,
          exitCode: null,
          stdout: listResult.stdout,
          stderr: listResult.stderr,
          error:
            `Worktree path "${targetWorktreePath}" is not registered with git worktree list for workspace root "${workspaceRoot}".`,
          command: {
            binary: listCommandBinary,
            args: listCommandArgs,
            cwd: workspaceRoot,
          },
        });
      }
    }

    let commandBinary = GROOVE_BIN;
    let args: string[];

    if (force) {
      args = ["worktree", "remove", "--force", targetWorktreePath];
      commandBinary = "git";
      logDebug(route, requestId, "target.resolve", {
        target,
        force,
        targetWorktreePath,
      });
    } else {
      const resolvedBranchTarget = await resolveBranchFromWorktree(targetWorktreePath);
      const grooveTarget = resolvedBranchTarget ?? target;
      logDebug(route, requestId, "target.resolve", {
        target,
        resolvedBranchTarget,
        grooveTarget,
        force,
      });

      args = ["rm", grooveTarget];
      if (dirValidation.value) {
        args.push("--dir", dirValidation.value);
      }
    }

    logInfo(route, requestId, "command.invoke", {
      binary: commandBinary,
      args,
      cwd: workspaceRoot,
    });

    const commandStartedAt = Date.now();
    const commandResult = await runCommand(commandBinary, args, workspaceRoot);
    if (commandResult.error) {
      logError(route, requestId, "command.error", {
        message: commandResult.error,
      });
    }

    const result: RmResponse = {
      requestId,
      ok: commandResult.exitCode === 0,
      exitCode: commandResult.exitCode,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      ...(commandResult.error ? { error: commandResult.error } : {}),
      command: {
        binary: commandBinary,
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
      return NextResponse.json<RmResponse>(result, {
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

    return NextResponse.json<RmResponse>(
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
      error: "Unexpected error while processing groove rm request.",
    });
  }
}
