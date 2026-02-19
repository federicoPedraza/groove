import { randomUUID } from "node:crypto";

const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

type LogLevel = "debug" | "info" | "warn" | "error";

type LogDetails = Record<string, unknown>;

const DEBUG_LOGS_ENABLED =
  process.env.GROOVE_DEBUG_LOGS === "true" ||
  process.env.NEXT_PUBLIC_GROOVE_DEBUG_LOGS === "true";

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

type TextSummary = {
  length: number;
  firstLine: string;
  truncated: boolean;
};

export type CommandOutputSummary = {
  stdout: TextSummary;
  stderr: TextSummary;
};

function summarizeTextOutput(value: string, maxFirstLineLength = 220): TextSummary {
  const trimmedStart = value.trimStart();
  const firstLineRaw = trimmedStart.split("\n").find((line) => line.trim().length > 0) ?? "";
  const truncated = firstLineRaw.length > maxFirstLineLength;
  const firstLine = truncated
    ? `${firstLineRaw.slice(0, maxFirstLineLength - 3)}...`
    : firstLineRaw;

  return {
    length: value.length,
    firstLine,
    truncated,
  };
}

function normalizeDetails(details: LogDetails | undefined): LogDetails {
  if (!details) {
    return {};
  }

  return details;
}

function writeLog(
  level: LogLevel,
  route: string,
  requestId: string,
  event: string,
  details?: LogDetails,
): void {
  if (level === "debug" && !DEBUG_LOGS_ENABLED) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    route,
    requestId,
    event,
    ...normalizeDetails(details),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  if (level === "debug") {
    console.debug(payload);
    return;
  }

  console.info(payload);
}

export function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (
    incoming &&
    incoming.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(incoming)
  ) {
    return incoming;
  }

  return randomUUID();
}

export function responseHeadersWithRequestId(requestId: string): Record<string, string> {
  return {
    "X-Request-Id": requestId,
  };
}

export function logInfo(
  route: string,
  requestId: string,
  event: string,
  details?: LogDetails,
): void {
  writeLog("info", route, requestId, event, details);
}

export function logDebug(
  route: string,
  requestId: string,
  event: string,
  details?: LogDetails,
): void {
  writeLog("debug", route, requestId, event, details);
}

export function logWarn(
  route: string,
  requestId: string,
  event: string,
  details?: LogDetails,
): void {
  writeLog("warn", route, requestId, event, details);
}

export function logError(
  route: string,
  requestId: string,
  event: string,
  details?: LogDetails,
): void {
  writeLog("error", route, requestId, event, details);
}

export function summarizeCommandOutput(stdout: string, stderr: string): CommandOutputSummary {
  return {
    stdout: summarizeTextOutput(stdout),
    stderr: summarizeTextOutput(stderr),
  };
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Unknown error",
  };
}
