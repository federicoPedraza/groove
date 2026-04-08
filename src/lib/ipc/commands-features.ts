import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  GlobalSettingsUpdatePayload,
  GlobalSettingsResponse,
  OpencodeUpdateWorkspaceSettingsPayload,
  OpencodeUpdateGlobalSettingsPayload,
} from "./types-core";
import type {
  OpencodeIntegrationStatusResponse,
  OpencodeWorkspaceSettingsResponse,
  OpencodeGlobalSettingsResponse,
  OpencodeSettingsDirectoryValidationResponse,
  OpencodeSkillsListResponse,
  OpencodeCopySkillsPayload,
  OpencodeCopySkillsResponse,
  OpenCodeStatusResponse,
  OpenCodeProfileResponse,
  OpenCodeSetProfilePayload,
  OpenCodeSyncResponse,
  OpenCodeRepairResponse,
  OpenCodeRunFlowPayload,
  OpenCodeRunResponse,
  OpenCodeCancelResponse,
} from "./types-opencode";
import type {
  GitAuthStatusPayload,
  GitAuthStatusResponse,
  GitStatusPayload,
  GitStatusResponse,
  GitCurrentBranchPayload,
  GitCurrentBranchResponse,
  GitListBranchesPayload,
  GitListBranchesResponse,
  GitAheadBehindPayload,
  GitAheadBehindResponse,
  GitPullPayload,
  GitPushPayload,
  GitMergePayload,
  GitMergeAbortPayload,
  GitCommitPayload,
  GitFilesPayload,
  GitFileStatesResponse,
  GitCommandResponse,
  GitBooleanResponse,
} from "./types-git";
import type {
  GrooveTerminalOpenPayload,
  GrooveTerminalWritePayload,
  GrooveTerminalResizePayload,
  GrooveTerminalClosePayload,
  GrooveTerminalSessionPayload,
  GrooveTerminalCommandResponse,
  GrooveTerminalSessionResponse,
  GrooveTerminalSessionsResponse,
  GrooveTerminalOutputEvent,
  GrooveTerminalLifecycleEvent,
} from "./types-terminal";
import { invokeCommand } from "./invoke";

export function gitAuthStatus(payload: GitAuthStatusPayload): Promise<GitAuthStatusResponse> {
  return invokeCommand<GitAuthStatusResponse>("git_auth_status", { payload });
}

export function gitStatus(payload: GitStatusPayload): Promise<GitStatusResponse> {
  return invokeCommand<GitStatusResponse>("git_status", { payload });
}

export function gitCurrentBranch(payload: GitCurrentBranchPayload): Promise<GitCurrentBranchResponse> {
  return invokeCommand<GitCurrentBranchResponse>("git_current_branch", { payload });
}

export function gitListBranches(payload: GitListBranchesPayload): Promise<GitListBranchesResponse> {
  return invokeCommand<GitListBranchesResponse>("git_list_branches", { payload });
}

export function gitAheadBehind(payload: GitAheadBehindPayload): Promise<GitAheadBehindResponse> {
  return invokeCommand<GitAheadBehindResponse>("git_ahead_behind", { payload });
}

export function gitPull(payload: GitPullPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_pull", { payload });
}

export function gitPush(payload: GitPushPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_push", { payload });
}

export function gitMerge(payload: GitMergePayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_merge", { payload });
}

export function gitMergeAbort(payload: GitMergeAbortPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_merge_abort", { payload });
}

export function gitHasStagedChanges(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_has_staged_changes", { payload });
}

export function gitMergeInProgress(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_merge_in_progress", { payload });
}

export function gitHasUpstream(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_has_upstream", { payload });
}

export function gitAdd(payload: GitStatusPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_add", { payload });
}

export function gitListFileStates(payload: GitStatusPayload): Promise<GitFileStatesResponse> {
  return invokeCommand<GitFileStatesResponse>("git_list_file_states", { payload });
}

export function gitStageFiles(payload: GitFilesPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_stage_files", { payload });
}

export function gitUnstageFiles(payload: GitFilesPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_unstage_files", { payload });
}

export function gitCommit(payload: GitCommitPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_commit", { payload });
}

export function globalSettingsGet(): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("global_settings_get", undefined, {
    intent: "background",
  });
}

export function globalSettingsUpdate(payload: GlobalSettingsUpdatePayload): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("global_settings_update", { payload });
}

export function opencodeIntegrationStatus(): Promise<OpencodeIntegrationStatusResponse> {
  return invokeCommand<OpencodeIntegrationStatusResponse>("opencode_integration_status", undefined, {
    intent: "background",
  });
}

export function opencodeUpdateWorkspaceSettings(
  payload: OpencodeUpdateWorkspaceSettingsPayload,
): Promise<OpencodeWorkspaceSettingsResponse> {
  return invokeCommand<OpencodeWorkspaceSettingsResponse>("opencode_update_workspace_settings", { payload });
}

export function opencodeUpdateGlobalSettings(
  payload: OpencodeUpdateGlobalSettingsPayload,
): Promise<OpencodeGlobalSettingsResponse> {
  return invokeCommand<OpencodeGlobalSettingsResponse>("opencode_update_global_settings", { payload });
}

export function checkOpencodeStatus(worktreePath: string): Promise<OpenCodeStatusResponse> {
  return invokeCommand<OpenCodeStatusResponse>("check_opencode_status", { worktreePath }, {
    intent: "background",
  });
}

export function validateOpencodeSettingsDirectory(
  settingsDirectory: string,
  workspaceRoot?: string | null,
): Promise<OpencodeSettingsDirectoryValidationResponse> {
  return invokeCommand<OpencodeSettingsDirectoryValidationResponse>("validate_opencode_settings_directory", {
    settingsDirectory,
    workspaceRoot: workspaceRoot ?? null,
  });
}

export function opencodeListSkills(
  workspaceRoot?: string | null,
  globalSkillsPath?: string | null,
  workspaceSkillsPath?: string | null,
): Promise<OpencodeSkillsListResponse> {
  return invokeCommand<OpencodeSkillsListResponse>("opencode_list_skills", {
    workspaceRoot: workspaceRoot ?? null,
    globalSkillsPath: globalSkillsPath ?? null,
    workspaceSkillsPath: workspaceSkillsPath ?? null,
  }, {
    intent: "background",
  });
}

export function opencodeCopySkills(payload: OpencodeCopySkillsPayload): Promise<OpencodeCopySkillsResponse> {
  return invokeCommand<OpencodeCopySkillsResponse>("opencode_copy_skills", { payload });
}

export function getOpencodeProfile(worktreePath: string): Promise<OpenCodeProfileResponse> {
  return invokeCommand<OpenCodeProfileResponse>("get_opencode_profile", { worktreePath }, {
    intent: "background",
  });
}

export function setOpencodeProfile(
  worktreePath: string,
  payload: OpenCodeSetProfilePayload,
): Promise<OpenCodeProfileResponse> {
  return invokeCommand<OpenCodeProfileResponse>("set_opencode_profile", { worktreePath, payload });
}

export function syncOpencodeConfig(worktreePath: string): Promise<OpenCodeSyncResponse> {
  return invokeCommand<OpenCodeSyncResponse>("sync_opencode_config", { worktreePath });
}

export function repairOpencodeIntegration(worktreePath: string): Promise<OpenCodeRepairResponse> {
  return invokeCommand<OpenCodeRepairResponse>("repair_opencode_integration", { worktreePath });
}

export function runOpencodeFlow(worktreePath: string, payload: OpenCodeRunFlowPayload): Promise<OpenCodeRunResponse> {
  return invokeCommand<OpenCodeRunResponse>("run_opencode_flow", { worktreePath, payload });
}

export function cancelOpencodeFlow(runId: string): Promise<OpenCodeCancelResponse> {
  return invokeCommand<OpenCodeCancelResponse>("cancel_opencode_flow", { runId });
}

export function listenGrooveTerminalOutput(
  callback: (event: GrooveTerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalOutputEvent>("groove-terminal-output", (event) => {
    callback(event.payload);
  });
}

export function listenGrooveTerminalLifecycle(
  callback: (event: GrooveTerminalLifecycleEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalLifecycleEvent>("groove-terminal-lifecycle", (event) => {
    callback(event.payload);
  });
}

export function grooveTerminalOpen(payload: GrooveTerminalOpenPayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_open", { payload });
}

export function grooveTerminalWrite(payload: GrooveTerminalWritePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_write", { payload }, { intent: "background" });
}

export function grooveTerminalResize(payload: GrooveTerminalResizePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_resize", { payload }, { intent: "background" });
}

export function grooveTerminalClose(payload: GrooveTerminalClosePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_close", { payload });
}

export function grooveTerminalGetSession(payload: GrooveTerminalSessionPayload): Promise<GrooveTerminalSessionResponse> {
  return invokeCommand<GrooveTerminalSessionResponse>("groove_terminal_get_session", { payload }, { intent: "background" });
}

export function grooveTerminalListSessions(payload: GrooveTerminalSessionPayload): Promise<GrooveTerminalSessionsResponse> {
  return invokeCommand<GrooveTerminalSessionsResponse>("groove_terminal_list_sessions", { payload }, { intent: "background" });
}
