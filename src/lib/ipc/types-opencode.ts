import type { OpencodeSettings } from "./types-core";

export type OpencodeEffectiveScope = "workspace" | "global" | "none";

export type OpencodeIntegrationStatusResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  workspaceScopeAvailable: boolean;
  globalScopeAvailable: boolean;
  effectiveScope: OpencodeEffectiveScope;
  workspaceSettings?: OpencodeSettings;
  globalSettings?: OpencodeSettings;
  error?: string;
};

export type OpencodeSettingsDirectoryValidationResponse = {
  requestId?: string;
  ok: boolean;
  resolvedPath?: string;
  directoryExists: boolean;
  opencodeConfigExists: boolean;
  error?: string;
};

export type OpencodeSkillEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  hasSkillMarkdown: boolean;
};

export type OpencodeSkillScope = {
  scope: "global" | "workspace" | string;
  rootPath: string;
  skillsPath: string;
  skillsDirectoryExists: boolean;
  skills: OpencodeSkillEntry[];
};

export type OpencodeSkillsListResponse = {
  requestId?: string;
  ok: boolean;
  globalScope?: OpencodeSkillScope;
  workspaceScope?: OpencodeSkillScope;
  error?: string;
};

export type OpencodeCopySkillsPayload = {
  globalSkillsPath: string;
  workspaceSkillsPath: string;
  globalToWorkspace: string[];
  workspaceToGlobal: string[];
};

export type OpencodeCopySkillsResponse = {
  requestId?: string;
  ok: boolean;
  copiedToWorkspace: number;
  copiedToGlobal: number;
  error?: string;
};

export type OpencodeWorkspaceSettingsResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  settings?: OpencodeSettings;
  error?: string;
};

export type OpencodeGlobalSettingsResponse = {
  requestId?: string;
  ok: boolean;
  settings?: OpencodeSettings;
  error?: string;
};

export type OpenCodeProfileCommands = {
  init: string;
  newChange: string;
  continue: string;
  apply: string;
  verify: string;
  archive: string;
};

export type OpenCodeProfileTimeouts = {
  phaseSeconds: number;
};

export type OpenCodeProfileSafety = {
  requireUserApprovalBetweenPhases: boolean;
  allowParallelSpecDesign: boolean;
};

export type OpenCodeProfile = {
  version: string;
  enabled: boolean;
  artifactStore: "engram" | "openspec" | "none" | string;
  defaultFlow: string;
  commands: OpenCodeProfileCommands;
  timeouts: OpenCodeProfileTimeouts;
  safety: OpenCodeProfileSafety;
};

export type OpenCodeProfilePatch = {
  version?: string;
  enabled?: boolean;
  artifactStore?: "engram" | "openspec" | "none" | string;
  defaultFlow?: string;
  commands?: Partial<OpenCodeProfileCommands>;
  timeouts?: Partial<OpenCodeProfileTimeouts>;
  safety?: Partial<OpenCodeProfileSafety>;
};

export type OpenCodeErrorDetail = {
  code: string;
  message: string;
  hint: string;
  paths: string[];
};

export type OpenCodeStatus = {
  worktreePath: string;
  worktreeExists: boolean;
  gitRepo: boolean;
  opencodeAvailable: boolean;
  opencodeBinaryPath?: string;
  agentTeamsLiteAvailable: boolean;
  agentTeamsLiteDir?: string;
  requiredCommandsAvailable: boolean;
  missingCommands: string[];
  profilePresent: boolean;
  profilePath: string;
  syncTargetExists: boolean;
  syncTargetPath: string;
  artifactStore?: string;
  artifactStoreReady: boolean;
  engramBinaryAvailable?: boolean;
  engramOpencodeMcpConfigPresent?: boolean;
  engramOpencodePluginPresent?: boolean;
  engramOpencodeConfigPath?: string;
  engramOpencodePluginPath?: string;
  profileValid: boolean;
  warnings: string[];
  sanity: OpenCodeSanityStatus;
};

export type OpenCodeSanityChecks = {
  agentTeamsLiteAvailable: boolean;
  requiredRefsPresent: boolean;
  profileExistsAndValid: boolean;
  syncArtifactApplied: boolean;
  artifactStoreReady: boolean;
};

export type OpenCodeSanityStatus = {
  applied: boolean;
  checks: OpenCodeSanityChecks;
  hardBlockers: string[];
  recommendations: string[];
  diagnostics: string[];
};

export type OpenCodeStatusResponse = {
  requestId?: string;
  ok: boolean;
  status?: OpenCodeStatus;
  error?: string;
};

export type OpenCodeProfileResponse = {
  requestId?: string;
  ok: boolean;
  profile?: OpenCodeProfile;
  error?: string;
};

export type OpenCodeSyncResult = {
  ok: boolean;
  changed: boolean;
  profilePath: string;
  syncArtifactPath: string;
  warnings: string[];
  message: string;
};

export type OpenCodeSyncResponse = {
  requestId?: string;
  ok: boolean;
  result?: OpenCodeSyncResult;
  error?: string;
};

export type OpenCodeRepairResult = {
  repaired: boolean;
  backupPath?: string;
  actions: string[];
  postRepairStatus: OpenCodeStatus;
};

export type OpenCodeRepairResponse = {
  requestId?: string;
  ok: boolean;
  result?: OpenCodeRepairResult;
  error?: string;
};

export type OpenCodeRunResult = {
  runId: string;
  phase: string;
  status: "ok" | "warning" | "blocked" | "failed" | "timeout" | string;
  exitCode?: number | null;
  durationMs: number;
  summary?: string;
  stdout: string;
  stderr: string;
  error?: OpenCodeErrorDetail;
};

export type OpenCodeRunResponse = {
  requestId?: string;
  ok: boolean;
  result: OpenCodeRunResult;
};

export type OpenCodeCancelResult = {
  runId: string;
  supported: boolean;
  cancelled: boolean;
  status: string;
  message: string;
  error?: OpenCodeErrorDetail;
};

export type OpenCodeCancelResponse = {
  requestId?: string;
  ok: boolean;
  result: OpenCodeCancelResult;
};

export type OpenCodeSetProfilePayload = {
  patch: OpenCodeProfilePatch;
};

export type OpenCodeRunFlowPayload = {
  phase: "init" | "new_change" | "continue" | "apply" | "verify" | "archive" | string;
  args?: string[];
};
