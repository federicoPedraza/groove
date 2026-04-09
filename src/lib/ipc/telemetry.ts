import type { IpcTelemetrySummaryRow } from "./types-core";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const MAX_ARGS_SUMMARY_LENGTH = 180;
const MAX_IPC_TELEMETRY_SAMPLES = 500;

type IpcTelemetryAggregate = {
  count: number;
  sumMs: number;
  maxMs: number;
  samples: number[];
};

const ipcTelemetryAggregates = new Map<string, IpcTelemetryAggregate>();

declare global {
  interface Window {
    __grooveTelemetrySummary?: () => IpcTelemetrySummaryRow[];
    __grooveTelemetrySummaryClear?: () => void;
  }
}

export { UI_TELEMETRY_PREFIX };

export function summarizeArgValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 40
      ? `string(len=${value.length})`
      : JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `array(len=${value.length})`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const preview = keys.slice(0, 4).join(",");
    const suffix = keys.length > 4 ? ",..." : "";
    return `object(keys=${preview}${suffix})`;
  }
  return typeof value;
}

export function summarizeInvokeArgs(
  args?: Record<string, unknown>,
): string | undefined {
  if (!args || Object.keys(args).length === 0) {
    return undefined;
  }

  const blockedKeyPattern =
    /(token|secret|password|credential|cookie|session|api.?key|auth)/i;
  const segments: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (blockedKeyPattern.test(key)) {
      continue;
    }
    if (
      key === "payload" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const payloadKeys = Object.keys(value as Record<string, unknown>)
        .filter((payloadKey) => !blockedKeyPattern.test(payloadKey))
        .slice(0, 5);
      const payloadSummary =
        payloadKeys.length > 0 ? payloadKeys.join(",") : "redacted-or-empty";
      segments.push(`payload{${payloadSummary}}`);
      continue;
    }
    segments.push(`${key}=${summarizeArgValue(value)}`);
    if (segments.length >= 6) {
      break;
    }
  }

  if (segments.length === 0) {
    return "redacted";
  }

  const summary = segments.join(" ");
  return summary.length > MAX_ARGS_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_ARGS_SUMMARY_LENGTH)}...`
    : summary;
}

export function resolveTelemetryOutcome(
  result: unknown,
): "ok" | "error" | "success" {
  if (result && typeof result === "object" && "ok" in result) {
    const maybeOk = (result as { ok?: unknown }).ok;
    if (typeof maybeOk === "boolean") {
      return maybeOk ? "ok" : "error";
    }
  }
  return "success";
}

function roundTelemetryMs(value: number): number {
  return Number(value.toFixed(2));
}

function getPercentileMs(samples: number[], percentile: number): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lowerIndex === upperIndex) {
    return lower;
  }

  const ratio = position - lowerIndex;
  return lower + (upper - lower) * ratio;
}

export function recordIpcTelemetryDuration(
  command: string,
  durationMs: number,
): void {
  const safeDurationMs = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : 0;
  const existing = ipcTelemetryAggregates.get(command);
  if (!existing) {
    ipcTelemetryAggregates.set(command, {
      count: 1,
      sumMs: safeDurationMs,
      maxMs: safeDurationMs,
      samples: [safeDurationMs],
    });
    return;
  }

  existing.count += 1;
  existing.sumMs += safeDurationMs;
  existing.maxMs = Math.max(existing.maxMs, safeDurationMs);

  if (existing.samples.length < MAX_IPC_TELEMETRY_SAMPLES) {
    existing.samples.push(safeDurationMs);
    return;
  }

  const replacementIndex = Math.floor(Math.random() * existing.count);
  if (replacementIndex < MAX_IPC_TELEMETRY_SAMPLES) {
    existing.samples[replacementIndex] = safeDurationMs;
  }
}

export function getIpcTelemetrySummary(): IpcTelemetrySummaryRow[] {
  return [...ipcTelemetryAggregates.entries()]
    .map(([command, aggregate]) => {
      const avgMs =
        aggregate.count === 0 ? 0 : aggregate.sumMs / aggregate.count;
      return {
        command,
        count: aggregate.count,
        avg_ms: roundTelemetryMs(avgMs),
        p50_ms: roundTelemetryMs(getPercentileMs(aggregate.samples, 0.5)),
        p95_ms: roundTelemetryMs(getPercentileMs(aggregate.samples, 0.95)),
        max_ms: roundTelemetryMs(aggregate.maxMs),
      };
    })
    .sort(
      (a, b) =>
        b.p95_ms - a.p95_ms ||
        b.count - a.count ||
        a.command.localeCompare(b.command),
    );
}

export function printIpcTelemetrySummary(): IpcTelemetrySummaryRow[] {
  const rows = getIpcTelemetrySummary();
  console.table(rows);
  return rows;
}

export function clearIpcTelemetrySummary(): void {
  ipcTelemetryAggregates.clear();
}

function attachIpcTelemetryWindowHelpers(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.__grooveTelemetrySummary = () => printIpcTelemetrySummary();
  window.__grooveTelemetrySummaryClear = () => {
    clearIpcTelemetrySummary();
  };
}

attachIpcTelemetryWindowHelpers();
