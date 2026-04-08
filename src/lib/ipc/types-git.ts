export type GitAuthStatusPayload = {
  workspaceRoot: string;
};

export type GitAuthStatusResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  profile: {
    userName?: string;
    userEmail?: string;
  };
  sshStatus: {
    state: string;
    message: string;
  };
  error?: string;
};

export type GitStatusPayload = {
  path: string;
};

export type GitStatusResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  dirty: boolean;
  outputSnippet?: string;
  error?: string;
};

export type GitCurrentBranchPayload = {
  path: string;
};

export type GitCurrentBranchResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  branch?: string;
  outputSnippet?: string;
  error?: string;
};

export type GitListBranchesPayload = {
  path: string;
};

export type GitListBranchesResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  branches: string[];
  outputSnippet?: string;
  error?: string;
};

export type GitAheadBehindPayload = {
  path: string;
};

export type GitAheadBehindResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  ahead: number;
  behind: number;
  outputSnippet?: string;
  error?: string;
};

export type GitPullPayload = {
  path: string;
  rebase?: boolean;
};

export type GitPushPayload = {
  path: string;
  setUpstream?: boolean;
  forceWithLease?: boolean;
  branch?: string;
};

export type GitMergePayload = {
  path: string;
  targetBranch: string;
  ffOnly?: boolean;
};

export type GitMergeAbortPayload = {
  path: string;
};

export type GitCommitPayload = {
  path: string;
  message?: string;
};

export type GitFilesPayload = {
  path: string;
  files: string[];
};

export type GitFileStatesResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  outputSnippet?: string;
  error?: string;
};

export type GitCommandResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  exitCode?: number | null;
  outputSnippet?: string;
  error?: string;
};

export type GitBooleanResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  value: boolean;
  outputSnippet?: string;
  error?: string;
};
