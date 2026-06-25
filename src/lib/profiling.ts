/**
 * Opt-in performance profiling for the terminal-heavy views.
 *
 * Disabled by default and a no-op when off, so instrumentation is safe to leave
 * in place. Enable it in development either way:
 *   - build/run with `VITE_PROFILE=true`, or
 *   - at runtime: `localStorage.setItem("groove:profile", "1")` then reload.
 *
 * The `mark`/`measure` calls emit User Timing entries that show up as labeled
 * spans in the WebKitGTK Web Inspector "Timelines" recording (Tauri's webview
 * on Linux) and in Chrome DevTools if you run the Vite dev server in a browser.
 * Per-phase durations are also aggregated; call `grooveProfile.print()` in the
 * console for a summary table, `grooveProfile.reset()` to clear between runs.
 *
 * The `<ProfiledRegion>` React wrapper lives in `./profiled-region`.
 */

const enabled: boolean = (() => {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (import.meta.env.VITE_PROFILE === "true") {
    return true;
  }
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("groove:profile") === "1"
    );
  } catch {
    return false;
  }
})();

export const profilingEnabled = enabled;

type Stat = { count: number; total: number; max: number; min: number };
const stats = new Map<string, Stat>();

export function record(name: string, duration: number): void {
  const existing = stats.get(name);
  if (existing) {
    existing.count += 1;
    existing.total += duration;
    existing.max = Math.max(existing.max, duration);
    existing.min = Math.min(existing.min, duration);
    return;
  }
  stats.set(name, { count: 1, total: duration, max: duration, min: duration });
}

export function mark(name: string): void {
  if (!enabled) {
    return;
  }
  try {
    performance.mark(name);
  } catch {
    // Ignore environments without the User Timing API.
  }
}

/** Emit a User Timing measure from `startMark` to now and aggregate it. */
export function measure(name: string, startMark: string): void {
  if (!enabled) {
    return;
  }
  try {
    const entry = performance.measure(name, startMark);
    record(name, entry.duration);
  } catch {
    // Start mark missing or API unavailable.
  }
}

/** Time a synchronous block and aggregate it under `name`. */
export function profileSync<T>(name: string, fn: () => T): T {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(name, performance.now() - start);
  }
}

/** Time an async block (e.g. an IPC round-trip) and aggregate it under `name`. */
export async function profileAsync<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  try {
    return await fn();
  } finally {
    record(name, performance.now() - start);
  }
}

/** Record a single precomputed sample (duration in ms, byte count, etc.). */
export function sample(name: string, value: number): void {
  if (!enabled) {
    return;
  }
  record(name, value);
}

export function printProfileSummary(): void {
  if (!enabled) {
    console.info(
      '[profile] disabled — enable with VITE_PROFILE=true or localStorage["groove:profile"]="1"',
    );
    return;
  }
  const rows = [...stats.entries()]
    .map(([name, s]) => ({
      phase: name,
      count: s.count,
      "avg ms": Number((s.total / s.count).toFixed(2)),
      "min ms": Number(s.min.toFixed(2)),
      "max ms": Number(s.max.toFixed(2)),
      "total ms": Number(s.total.toFixed(2)),
    }))
    .sort((a, b) => b["total ms"] - a["total ms"]);
  console.table(rows);
}

export function resetProfile(): void {
  stats.clear();
}

if (enabled && typeof window !== "undefined") {
  (
    window as unknown as {
      grooveProfile?: { print: () => void; reset: () => void };
    }
  ).grooveProfile = { print: printProfileSummary, reset: resetProfile };
}
