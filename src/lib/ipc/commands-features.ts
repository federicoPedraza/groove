import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  GlobalSettingsUpdatePayload,
  GlobalSettingsResponse,
  WorkspaceEventsPayload,
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
  DoctrineReportRequest,
  DoctrineReportResponse,
  DoctrineResultRequest,
  DoctrineResultResponse,
  DoctrineListResponse,
  DoctrineSetActiveRequest,
  DoctrineSetActiveResponse,
} from "./types-doctrine";
import type {
  GitAheadBehindPayload,
  GitAheadBehindResponse,
  GitBooleanResponse,
  GitCommandResponse,
  GitCommitPayload,
  GitCurrentBranchPayload,
  GitCurrentBranchResponse,
  GitDiffResponse,
  GitListBranchesPayload,
  GitListBranchesResponse,
  GitPushPayload,
} from "./types-git";
import type {
  GhAuthStatusResponse,
  GhCommandResponse,
  GhLoginPayload,
  GhLogoutPayload,
  GhPrCreateWebPayload,
  GhPrListResponse,
  GhPrViewPayload,
  GhPrViewResponse,
  GhRepoDefaultBranchResponse,
  GhSshOverviewPayload,
  GhSshOverviewResponse,
  GhSshSetIdentityPayload,
  GhSwitchPayload,
  GhWorktreePayload,
} from "./types-github";

type GitPathPayload = { path: string };
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
  GrooveTerminalActivityResponse,
  GrooveTerminalActiveWorktreesResponse,
} from "./types-terminal";
import type {
  AssistantConnectResponse,
  AssistantValidateResponse,
  AssistantRuleScope,
  AssistantRulesListResponse,
} from "./types-commands";
import { invokeCommand } from "./invoke";

export function gitCurrentBranch(
  payload: GitCurrentBranchPayload,
): Promise<GitCurrentBranchResponse> {
  return invokeCommand<GitCurrentBranchResponse>("git_current_branch", {
    payload,
  });
}

export function gitListBranches(
  payload: GitListBranchesPayload,
): Promise<GitListBranchesResponse> {
  return invokeCommand<GitListBranchesResponse>("git_list_branches", {
    payload,
  });
}

export function gitAheadBehind(
  payload: GitAheadBehindPayload,
): Promise<GitAheadBehindResponse> {
  return invokeCommand<GitAheadBehindResponse>(
    "git_ahead_behind",
    { payload },
    { intent: "background" },
  );
}

export function gitPush(payload: GitPushPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_push", { payload });
}

export function gitHasUpstream(
  payload: GitPathPayload,
): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>(
    "git_has_upstream",
    { payload },
    { intent: "background" },
  );
}

export function gitCommit(
  payload: GitCommitPayload,
): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_commit", { payload });
}

export function gitAdd(payload: GitPathPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_add", { payload });
}

export function ghAuthStatus(): Promise<GhAuthStatusResponse> {
  return invokeCommand<GhAuthStatusResponse>("gh_auth_status", undefined, {
    intent: "background",
  });
}

export function ghAuthLogin(
  payload: GhLoginPayload,
): Promise<GhCommandResponse> {
  return invokeCommand<GhCommandResponse>("gh_auth_login", { payload });
}

export function ghAuthSwitch(
  payload: GhSwitchPayload,
): Promise<GhCommandResponse> {
  return invokeCommand<GhCommandResponse>("gh_auth_switch", { payload });
}

export function ghAuthLogout(
  payload: GhLogoutPayload,
): Promise<GhCommandResponse> {
  return invokeCommand<GhCommandResponse>("gh_auth_logout", { payload });
}

export function ghSshOverview(
  payload: GhSshOverviewPayload,
): Promise<GhSshOverviewResponse> {
  return invokeCommand<GhSshOverviewResponse>(
    "gh_ssh_overview",
    { payload },
    { intent: "background" },
  );
}

export function ghSshSetIdentity(
  payload: GhSshSetIdentityPayload,
): Promise<GhCommandResponse> {
  return invokeCommand<GhCommandResponse>("gh_ssh_set_identity", { payload });
}

export function ghRepoDefaultBranch(
  payload: GhWorktreePayload,
): Promise<GhRepoDefaultBranchResponse> {
  return invokeCommand<GhRepoDefaultBranchResponse>(
    "gh_repo_default_branch",
    { payload },
    { intent: "background" },
  );
}

export function ghPrList(
  payload: GhWorktreePayload,
): Promise<GhPrListResponse> {
  return invokeCommand<GhPrListResponse>(
    "gh_pr_list",
    { payload },
    { intent: "background" },
  );
}

export function ghPrView(
  payload: GhPrViewPayload,
): Promise<GhPrViewResponse> {
  return invokeCommand<GhPrViewResponse>(
    "gh_pr_view",
    { payload },
    { intent: "background" },
  );
}

export function ghPrCreateWeb(
  payload: GhPrCreateWebPayload,
): Promise<GhCommandResponse> {
  return invokeCommand<GhCommandResponse>("gh_pr_create_web", { payload });
}

export function gitDiff(payload: GitPathPayload): Promise<GitDiffResponse> {
  return invokeCommand<GitDiffResponse>(
    "git_diff",
    { payload },
    { intent: "background" },
  );
}

export function globalSettingsGet(): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>(
    "global_settings_get",
    undefined,
    {
      intent: "background",
    },
  );
}

export function globalSettingsUpdate(
  payload: GlobalSettingsUpdatePayload,
): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("global_settings_update", {
    payload,
  });
}

export function soundLibraryRead(
  fileName: string,
): Promise<{ requestId?: string; ok: boolean; data?: string; error?: string }> {
  return invokeCommand<{
    requestId?: string;
    ok: boolean;
    data?: string;
    error?: string;
  }>("sound_library_read", { payload: { fileName } }, { intent: "background" });
}

export function soundLibraryImport(): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("sound_library_import");
}

export function soundLibraryRemove(
  soundId: string,
): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("sound_library_remove", {
    payload: { soundId },
  });
}

export function soundLibraryRename(
  soundId: string,
  newName: string,
): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("sound_library_rename", {
    payload: { soundId, newName },
  });
}

export function soundLibraryGetPath(
  soundId: string,
): Promise<{
  requestId?: string;
  ok: boolean;
  folderPath?: string;
  filePath?: string;
  error?: string;
}> {
  return invokeCommand<{
    requestId?: string;
    ok: boolean;
    folderPath?: string;
    filePath?: string;
    error?: string;
  }>("sound_library_get_path", { payload: { soundId } });
}

export function soundLibraryOpenDirectory(): Promise<{
  requestId?: string;
  ok: boolean;
  folderPath?: string;
  error?: string;
}> {
  return invokeCommand<{
    requestId?: string;
    ok: boolean;
    folderPath?: string;
    error?: string;
  }>("sound_library_open_directory");
}

export function opencodeIntegrationStatus(): Promise<OpencodeIntegrationStatusResponse> {
  return invokeCommand<OpencodeIntegrationStatusResponse>(
    "opencode_integration_status",
    undefined,
    {
      intent: "background",
    },
  );
}

export function opencodeUpdateWorkspaceSettings(
  payload: OpencodeUpdateWorkspaceSettingsPayload,
): Promise<OpencodeWorkspaceSettingsResponse> {
  return invokeCommand<OpencodeWorkspaceSettingsResponse>(
    "opencode_update_workspace_settings",
    { payload },
  );
}

export function opencodeUpdateGlobalSettings(
  payload: OpencodeUpdateGlobalSettingsPayload,
): Promise<OpencodeGlobalSettingsResponse> {
  return invokeCommand<OpencodeGlobalSettingsResponse>(
    "opencode_update_global_settings",
    { payload },
  );
}

export function checkOpencodeStatus(
  worktreePath: string,
): Promise<OpenCodeStatusResponse> {
  return invokeCommand<OpenCodeStatusResponse>(
    "check_opencode_status",
    { worktreePath },
    {
      intent: "background",
    },
  );
}

export function validateOpencodeSettingsDirectory(
  settingsDirectory: string,
  workspaceRoot?: string | null,
): Promise<OpencodeSettingsDirectoryValidationResponse> {
  return invokeCommand<OpencodeSettingsDirectoryValidationResponse>(
    "validate_opencode_settings_directory",
    {
      settingsDirectory,
      workspaceRoot: workspaceRoot ?? null,
    },
  );
}

export function opencodeListSkills(
  workspaceRoot?: string | null,
  globalSkillsPath?: string | null,
  workspaceSkillsPath?: string | null,
): Promise<OpencodeSkillsListResponse> {
  return invokeCommand<OpencodeSkillsListResponse>(
    "opencode_list_skills",
    {
      workspaceRoot: workspaceRoot ?? null,
      globalSkillsPath: globalSkillsPath ?? null,
      workspaceSkillsPath: workspaceSkillsPath ?? null,
    },
    {
      intent: "background",
    },
  );
}

export function opencodeCopySkills(
  payload: OpencodeCopySkillsPayload,
): Promise<OpencodeCopySkillsResponse> {
  return invokeCommand<OpencodeCopySkillsResponse>("opencode_copy_skills", {
    payload,
  });
}

export function getOpencodeProfile(
  worktreePath: string,
): Promise<OpenCodeProfileResponse> {
  return invokeCommand<OpenCodeProfileResponse>(
    "get_opencode_profile",
    { worktreePath },
    {
      intent: "background",
    },
  );
}

export function setOpencodeProfile(
  worktreePath: string,
  payload: OpenCodeSetProfilePayload,
): Promise<OpenCodeProfileResponse> {
  return invokeCommand<OpenCodeProfileResponse>("set_opencode_profile", {
    worktreePath,
    payload,
  });
}

export function syncOpencodeConfig(
  worktreePath: string,
): Promise<OpenCodeSyncResponse> {
  return invokeCommand<OpenCodeSyncResponse>("sync_opencode_config", {
    worktreePath,
  });
}

export function repairOpencodeIntegration(
  worktreePath: string,
): Promise<OpenCodeRepairResponse> {
  return invokeCommand<OpenCodeRepairResponse>("repair_opencode_integration", {
    worktreePath,
  });
}

export function runOpencodeFlow(
  worktreePath: string,
  payload: OpenCodeRunFlowPayload,
): Promise<OpenCodeRunResponse> {
  return invokeCommand<OpenCodeRunResponse>("run_opencode_flow", {
    worktreePath,
    payload,
  });
}

export function cancelOpencodeFlow(
  runId: string,
): Promise<OpenCodeCancelResponse> {
  return invokeCommand<OpenCodeCancelResponse>("cancel_opencode_flow", {
    runId,
  });
}

export function doctrineGenerateReport(
  payload: DoctrineReportRequest = {},
): Promise<DoctrineReportResponse> {
  return invokeCommand<DoctrineReportResponse>("doctrine_generate_report", {
    payload,
  });
}

export function doctrineGenerateResult(
  payload: DoctrineResultRequest,
): Promise<DoctrineResultResponse> {
  return invokeCommand<DoctrineResultResponse>("doctrine_generate_result", {
    payload,
  });
}

export function doctrineList(): Promise<DoctrineListResponse> {
  return invokeCommand<DoctrineListResponse>(
    "doctrine_list",
    undefined,
    { intent: "background" },
  );
}

export function doctrineSetActive(
  payload: DoctrineSetActiveRequest,
): Promise<DoctrineSetActiveResponse> {
  return invokeCommand<DoctrineSetActiveResponse>("doctrine_set_active", {
    payload,
  });
}

export function listenGrooveTerminalOutput(
  callback: (event: GrooveTerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalOutputEvent>(
    "groove-terminal-output",
    (event) => {
      callback(event.payload);
    },
  );
}

export function listenGrooveTerminalLifecycle(
  callback: (event: GrooveTerminalLifecycleEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalLifecycleEvent>(
    "groove-terminal-lifecycle",
    (event) => {
      callback(event.payload);
    },
  );
}

export function grooveTerminalOpen(
  payload: GrooveTerminalOpenPayload,
): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_open", {
    payload,
  });
}

export function grooveTerminalWrite(
  payload: GrooveTerminalWritePayload,
): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>(
    "groove_terminal_write",
    { payload },
    { intent: "background" },
  );
}

export function grooveTerminalResize(
  payload: GrooveTerminalResizePayload,
): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>(
    "groove_terminal_resize",
    { payload },
    { intent: "background" },
  );
}

export function grooveTerminalClose(
  payload: GrooveTerminalClosePayload,
): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_close", {
    payload,
  });
}

export function grooveTerminalGetSession(
  payload: GrooveTerminalSessionPayload,
): Promise<GrooveTerminalSessionResponse> {
  return invokeCommand<GrooveTerminalSessionResponse>(
    "groove_terminal_get_session",
    { payload },
    { intent: "background" },
  );
}

export function grooveTerminalListSessions(
  payload: GrooveTerminalSessionPayload,
): Promise<GrooveTerminalSessionsResponse> {
  return invokeCommand<GrooveTerminalSessionsResponse>(
    "groove_terminal_list_sessions",
    { payload },
    { intent: "background" },
  );
}

export function grooveTerminalCheckActivity(
  payload: GrooveTerminalSessionPayload,
): Promise<GrooveTerminalActivityResponse> {
  return invokeCommand<GrooveTerminalActivityResponse>(
    "groove_terminal_check_activity",
    { payload },
    { intent: "background" },
  );
}

export function grooveTerminalActiveWorktrees(
  payload: WorkspaceEventsPayload,
): Promise<GrooveTerminalActiveWorktreesResponse> {
  return invokeCommand<GrooveTerminalActiveWorktreesResponse>(
    "groove_terminal_active_worktrees",
    { payload },
    { intent: "background" },
  );
}

export function assistantConnectTransport(): Promise<AssistantConnectResponse> {
  return invokeCommand<AssistantConnectResponse>(
    "assistant_connect_transport",
    undefined,
    { intent: "blocking" },
  );
}

export function assistantValidateMcp(): Promise<AssistantValidateResponse> {
  return invokeCommand<AssistantValidateResponse>(
    "assistant_validate_mcp",
    undefined,
    { intent: "background" },
  );
}

export function assistantRulesList(): Promise<AssistantRulesListResponse> {
  return invokeCommand<AssistantRulesListResponse>(
    "assistant_rules_list",
    undefined,
    { intent: "background" },
  );
}

export function assistantRuleAdd(
  scope: AssistantRuleScope,
  text: string,
): Promise<AssistantRulesListResponse> {
  return invokeCommand<AssistantRulesListResponse>("assistant_rule_add", {
    scope,
    text,
  });
}

export function assistantRuleRemove(
  scope: AssistantRuleScope,
  id: string,
): Promise<AssistantRulesListResponse> {
  return invokeCommand<AssistantRulesListResponse>("assistant_rule_remove", {
    scope,
    id,
  });
}
