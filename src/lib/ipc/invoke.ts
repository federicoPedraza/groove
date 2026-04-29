import { invoke } from "@tauri-apps/api/core";

import { trackCommandExecution } from "@/src/lib/command-history";

import type { CommandIntent } from "./types-core";
import {
  isTelemetryEnabled,
  syncGlobalSettingsFromResult,
  updateBlockingInvokeCount,
} from "./global-settings";
import {
  recordIpcTelemetryDuration,
  summarizeInvokeArgs,
  resolveTelemetryOutcome,
  UI_TELEMETRY_PREFIX,
} from "./telemetry";

type InvokeCommandOptions = {
  intent?: CommandIntent;
};

const UNTRACKED_COMMANDS = new Set<string>([
  "groove_terminal_active_worktrees",
  "workspace_events",
  "workspace_get_active",
  "workspace_term_sanity_check",
  "workspace_term_sanity_apply",
  "workspace_gitignore_sanity_check",
  "groove_bin_status",
  "groove_bin_repair",
  "git_auth_status",
  "git_status",
  "git_current_branch",
  "git_list_branches",
  "git_ahead_behind",
  "git_list_file_states",
  "gh_detect_repo",
  "gh_auth_status",
  "gh_check_branch_pr",
  "global_settings_get",
  "global_settings_update",
  "diagnostics_get_system_overview",
  "workspace_list_symlink_entries",
  "groove_terminal_open",
  "groove_terminal_write",
  "groove_terminal_resize",
  "groove_terminal_close",
  "groove_terminal_get_session",
  "groove_terminal_list_sessions",
  "opencode_integration_status",
  "opencode_update_workspace_settings",
  "opencode_update_global_settings",
  "check_opencode_status",
  "validate_opencode_settings_directory",
  "opencode_list_skills",
  "opencode_copy_skills",
  "get_opencode_profile",
  "set_opencode_profile",
  "sync_opencode_config",
  "repair_opencode_integration",
  "run_opencode_flow",
  "cancel_opencode_flow",
]);

const NON_DEDUPED_COMMANDS = new Set<string>(["groove_terminal_write"]);

let inflightInvokeCount = 0;
const inflightInvokes = new Map<
  string,
  { promise: Promise<unknown>; joinedCalls: number }
>();

function serializeInvokeArg(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeInvokeArg(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${serializeInvokeArg(entry)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function getInvokeDedupeKey(
  command: string,
  args?: Record<string, unknown>,
): string {
  return `${command}:${serializeInvokeArg(args ?? null)}`;
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: InvokeCommandOptions,
): Promise<T> {
  const startedAtMs = globalThis.performance?.now() ?? Date.now();
  const argsSummary = summarizeInvokeArgs(args);
  const shouldDedupe = !NON_DEDUPED_COMMANDS.has(command);
  const dedupeKey = shouldDedupe ? getInvokeDedupeKey(command, args) : null;
  const commandIntent: CommandIntent = options?.intent ?? "blocking";
  const isBlockingInvoke = commandIntent === "blocking";
  const existingInvoke = dedupeKey ? inflightInvokes.get(dedupeKey) : undefined;

  if (existingInvoke) {
    existingInvoke.joinedCalls += 1;
    if (isBlockingInvoke) {
      updateBlockingInvokeCount(1);
    }

    try {
      const result = (await existingInvoke.promise) as T;
      const durationMs = Math.max(
        0,
        (globalThis.performance?.now() ?? Date.now()) - startedAtMs,
      );
      const outcome = resolveTelemetryOutcome(result);
      syncGlobalSettingsFromResult(command, result);

      if (isTelemetryEnabled()) {
        recordIpcTelemetryDuration(command, durationMs);
        console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
          command,
          duration_ms: Number(durationMs.toFixed(2)),
          outcome,
          inflight: inflightInvokeCount,
          deduped_join: true,
          command_intent: commandIntent,
          ...(argsSummary ? { args_summary: argsSummary } : {}),
        });
      }

      return result;
    } catch (error: unknown) {
      const durationMs = Math.max(
        0,
        (globalThis.performance?.now() ?? Date.now()) - startedAtMs,
      );
      if (isTelemetryEnabled()) {
        recordIpcTelemetryDuration(command, durationMs);
        console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
          command,
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "throw",
          inflight: inflightInvokeCount,
          deduped_join: true,
          command_intent: commandIntent,
          ...(argsSummary ? { args_summary: argsSummary } : {}),
        });
      }
      throw error;
    } finally {
      if (isBlockingInvoke) {
        updateBlockingInvokeCount(-1);
      }
    }
  }

  inflightInvokeCount += 1;
  if (isBlockingInvoke) {
    updateBlockingInvokeCount(1);
  }
  const inflightAtStart = inflightInvokeCount;
  const trackedInvokePromise = (async () => {
    const invokeRunner = () => invoke<T>(command, args);
    return UNTRACKED_COMMANDS.has(command)
      ? await invokeRunner()
      : await trackCommandExecution(command, invokeRunner);
  })();
  if (dedupeKey) {
    inflightInvokes.set(dedupeKey, {
      promise: trackedInvokePromise as Promise<unknown>,
      joinedCalls: 0,
    });
  }

  try {
    const result = await trackedInvokePromise;

    const durationMs = Math.max(
      0,
      (globalThis.performance?.now() ?? Date.now()) - startedAtMs,
    );
    const outcome = resolveTelemetryOutcome(result);
    syncGlobalSettingsFromResult(command, result);

    if (isTelemetryEnabled()) {
      recordIpcTelemetryDuration(command, durationMs);
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome,
        inflight: inflightAtStart,
        deduped_joiners: dedupeKey
          ? (inflightInvokes.get(dedupeKey)?.joinedCalls ?? 0)
          : 0,
        command_intent: commandIntent,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }

    return result;
  } catch (error: unknown) {
    const durationMs = Math.max(
      0,
      (globalThis.performance?.now() ?? Date.now()) - startedAtMs,
    );
    if (isTelemetryEnabled()) {
      recordIpcTelemetryDuration(command, durationMs);
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "throw",
        inflight: inflightAtStart,
        deduped_joiners: dedupeKey
          ? (inflightInvokes.get(dedupeKey)?.joinedCalls ?? 0)
          : 0,
        command_intent: commandIntent,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }
    throw error;
  } finally {
    if (dedupeKey) {
      inflightInvokes.delete(dedupeKey);
    }
    inflightInvokeCount = Math.max(0, inflightInvokeCount - 1);
    if (isBlockingInvoke) {
      updateBlockingInvokeCount(-1);
    }
  }
}
