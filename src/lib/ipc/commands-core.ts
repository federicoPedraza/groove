import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  WorkspaceContextResponse,
  WorkspaceEventsPayload,
  WorkspaceEventsResponse,
  WorkspaceTermSanityResponse,
  WorkspaceGitignoreSanityResponse,
  GrooveBinStatusResponse,
  GrooveBinRepairResponse,
  ExternalUrlOpenResponse,
  WorkspaceTerminalSettingsPayload,
  WorkspaceTerminalSettingsResponse,
  WorkspaceCommandSettingsPayload,
  WorkspaceCommandSettingsResponse,
  WorkspaceWorktreeSymlinkPathsPayload,
  WorkspaceBrowseEntriesPayload,
  WorkspaceBrowseEntriesResponse,
  CommandIntent,
} from "./types-core";
import type {
  GrooveListPayload,
  GrooveListResponse,
  GrooveRestorePayload,
  GrooveRestoreResponse,
  GrooveNewPayload,
  GrooveNewResponse,
  GrooveRmPayload,
  GrooveRmResponse,
  GrooveStopPayload,
  GrooveStopResponse,
  GrooveSummaryPayload,
  GrooveSummaryResponse,
  WorkspaceOpenTerminalPayload,
  WorkspaceOpenWorkspaceTerminalPayload,
  DiagnosticsOpencodeInstancesResponse,
  DiagnosticsStopResponse,
  DiagnosticsStopAllResponse,
  DiagnosticsNodeAppsResponse,
  DiagnosticsMostConsumingProgramsResponse,
  DiagnosticsSystemOverviewResponse,
} from "./types-commands";
import type { GrooveNotificationEvent } from "./types-terminal";
import { invokeCommand } from "./invoke";

type WorkspaceEvent = {
  index?: number;
  source?: string;
  kind?: string;
};

export function grooveList(payload: GrooveListPayload, options?: { intent?: CommandIntent }): Promise<GrooveListResponse> {
  return invokeCommand<GrooveListResponse>("groove_list", { payload }, options);
}

export function grooveRestore(payload: GrooveRestorePayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("groove_restore", { payload });
}

export function grooveNew(payload: GrooveNewPayload): Promise<GrooveNewResponse> {
  return invokeCommand<GrooveNewResponse>("groove_new", { payload });
}

export function grooveRm(payload: GrooveRmPayload): Promise<GrooveRmResponse> {
  return invokeCommand<GrooveRmResponse>("groove_rm", { payload });
}

export function grooveStop(payload: GrooveStopPayload): Promise<GrooveStopResponse> {
  return invokeCommand<GrooveStopResponse>("groove_stop", { payload });
}

export function grooveSummary(payload: GrooveSummaryPayload): Promise<GrooveSummaryResponse> {
  return invokeCommand<GrooveSummaryResponse>("groove_summary", { payload });
}

export function workspaceEvents(payload: WorkspaceEventsPayload): Promise<WorkspaceEventsResponse> {
  return invokeCommand<WorkspaceEventsResponse>("workspace_events", { payload });
}

export function openExternalUrl(url: string): Promise<ExternalUrlOpenResponse> {
  return invokeCommand<ExternalUrlOpenResponse>("open_external_url", { url });
}

export function diagnosticsListOpencodeInstances(): Promise<DiagnosticsOpencodeInstancesResponse> {
  return invokeCommand<DiagnosticsOpencodeInstancesResponse>("diagnostics_list_opencode_instances");
}

export function diagnosticsStopProcess(pid: number): Promise<DiagnosticsStopResponse> {
  return invokeCommand<DiagnosticsStopResponse>("diagnostics_stop_process", { pid });
}

export function diagnosticsStopAllOpencodeInstances(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_stop_all_opencode_instances");
}

export function diagnosticsKillAllNodeAndOpencodeInstances(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_kill_all_node_and_opencode_instances");
}

export function diagnosticsListWorktreeNodeApps(): Promise<DiagnosticsNodeAppsResponse> {
  return invokeCommand<DiagnosticsNodeAppsResponse>("diagnostics_list_worktree_node_apps");
}

export function diagnosticsCleanAllDevServers(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_clean_all_dev_servers");
}

export function diagnosticsGetMsotConsumingPrograms(): Promise<DiagnosticsMostConsumingProgramsResponse> {
  return invokeCommand<DiagnosticsMostConsumingProgramsResponse>("diagnostics_get_msot_consuming_programs");
}

export function diagnosticsGetSystemOverview(): Promise<DiagnosticsSystemOverviewResponse> {
  return invokeCommand<DiagnosticsSystemOverviewResponse>("diagnostics_get_system_overview", undefined, {
    intent: "background",
  });
}

export function listenWorkspaceChange(
  callback: (event: WorkspaceEvent) => void,
): Promise<UnlistenFn> {
  return listen<WorkspaceEvent>("workspace-change", (event) => {
    callback(event.payload);
  });
}

export function listenWorkspaceReady(callback: (event: Record<string, unknown>) => void): Promise<UnlistenFn> {
  return listen<Record<string, unknown>>("workspace-ready", (event) => {
    callback(event.payload);
  });
}

export function listenGrooveNotification(
  callback: (event: GrooveNotificationEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveNotificationEvent>("groove-notification", (event) => {
    callback(event.payload);
  });
}

export function workspacePickAndOpen(): Promise<WorkspaceContextResponse> {
  invalidateWorkspaceGetActiveCache();
  return invokeCommand<WorkspaceContextResponse>("workspace_pick_and_open");
}

export function workspaceOpen(workspaceRoot: string): Promise<WorkspaceContextResponse> {
  invalidateWorkspaceGetActiveCache();
  return invokeCommand<WorkspaceContextResponse>("workspace_open", { workspaceRoot });
}

let workspaceGetActiveCachedResult: WorkspaceContextResponse | null = null;
let workspaceGetActiveCachedAt = 0;
const WORKSPACE_GET_ACTIVE_CACHE_TTL_MS = 400;

export function workspaceGetActive(): Promise<WorkspaceContextResponse> {
  const now = Date.now();
  if (workspaceGetActiveCachedResult && now - workspaceGetActiveCachedAt < WORKSPACE_GET_ACTIVE_CACHE_TTL_MS) {
    return Promise.resolve(workspaceGetActiveCachedResult);
  }
  return invokeCommand<WorkspaceContextResponse>("workspace_get_active", undefined, {
    intent: "background",
  }).then((result) => {
    workspaceGetActiveCachedResult = result;
    workspaceGetActiveCachedAt = Date.now();
    return result;
  });
}

export function invalidateWorkspaceGetActiveCache(): void {
  workspaceGetActiveCachedResult = null;
  workspaceGetActiveCachedAt = 0;
}

export function workspaceTermSanityCheck(): Promise<WorkspaceTermSanityResponse> {
  return invokeCommand<WorkspaceTermSanityResponse>("workspace_term_sanity_check", undefined, {
    intent: "background",
  });
}

export function workspaceTermSanityApply(): Promise<WorkspaceTermSanityResponse> {
  return invokeCommand<WorkspaceTermSanityResponse>("workspace_term_sanity_apply");
}

export function workspaceGitignoreSanityCheck(): Promise<WorkspaceGitignoreSanityResponse> {
  return invokeCommand<WorkspaceGitignoreSanityResponse>("workspace_gitignore_sanity_check", undefined, {
    intent: "background",
  });
}

export function workspaceGitignoreSanityApply(): Promise<WorkspaceGitignoreSanityResponse> {
  return invokeCommand<WorkspaceGitignoreSanityResponse>("workspace_gitignore_sanity_apply");
}

export function grooveBinStatus(): Promise<GrooveBinStatusResponse> {
  return invokeCommand<GrooveBinStatusResponse>("groove_bin_status", undefined, {
    intent: "background",
  });
}

export function grooveBinRepair(): Promise<GrooveBinRepairResponse> {
  return invokeCommand<GrooveBinRepairResponse>("groove_bin_repair");
}

export function workspaceClearActive(): Promise<WorkspaceContextResponse> {
  invalidateWorkspaceGetActiveCache();
  return invokeCommand<WorkspaceContextResponse>("workspace_clear_active");
}

export function workspaceUpdateTerminalSettings(
  payload: WorkspaceTerminalSettingsPayload,
): Promise<WorkspaceTerminalSettingsResponse> {
  return invokeCommand<WorkspaceTerminalSettingsResponse>("workspace_update_terminal_settings", { payload });
}

export function workspaceUpdateCommandsSettings(
  payload: WorkspaceCommandSettingsPayload,
): Promise<WorkspaceCommandSettingsResponse> {
  return invokeCommand<WorkspaceCommandSettingsResponse>("workspace_update_commands_settings", { payload });
}

export function workspaceUpdateWorktreeSymlinkPaths(
  payload: WorkspaceWorktreeSymlinkPathsPayload,
): Promise<WorkspaceCommandSettingsResponse> {
  return invokeCommand<WorkspaceCommandSettingsResponse>("workspace_update_worktree_symlink_paths", { payload });
}

export function workspaceListSymlinkEntries(
  payload: WorkspaceBrowseEntriesPayload = {},
): Promise<WorkspaceBrowseEntriesResponse> {
  return invokeCommand<WorkspaceBrowseEntriesResponse>("workspace_list_symlink_entries", { payload }, {
    intent: "background",
  });
}

export function workspaceOpenTerminal(payload: WorkspaceOpenTerminalPayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("workspace_open_terminal", { payload });
}

export function workspaceOpenWorkspaceTerminal(payload: WorkspaceOpenWorkspaceTerminalPayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("workspace_open_workspace_terminal", { payload });
}
