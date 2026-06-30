export type GhAccount = {
  login: string;
  active: boolean;
  scopes: string[];
  protocol?: string;
};

export type GhAuthStatusResponse = {
  requestId?: string;
  ok: boolean;
  installed: boolean;
  loggedIn: boolean;
  activeAccount?: string;
  accounts: GhAccount[];
  error?: string;
};

export type GhLoginPayload = {
  token: string;
};

export type GhSwitchPayload = {
  user: string;
};

export type GhLogoutPayload = {
  user: string;
};

export type GhCommandResponse = {
  requestId?: string;
  ok: boolean;
  error?: string;
};

export type GhSshAuthState =
  | "authenticated"
  | "unauthenticated"
  | "unreachable"
  | "unknown";

export type GhSshIdentity = {
  alias: string;
  hostname: string;
  identityFile?: string;
  username?: string;
  authState: GhSshAuthState;
};

export type GhRemoteOrigin = {
  url: string;
  host?: string;
  owner?: string;
  repo?: string;
  matchedAlias?: string;
};

export type GhSshOverviewResponse = {
  requestId?: string;
  ok: boolean;
  configFound: boolean;
  identities: GhSshIdentity[];
  origin?: GhRemoteOrigin;
  error?: string;
};

export type GhSshOverviewPayload = {
  workspaceRoot?: string;
};

export type GhSshSetIdentityPayload = {
  workspaceRoot: string;
  alias: string;
};

export type GhWorktreePayload = {
  worktreePath: string;
};

export type GhRepoDefaultBranchResponse = {
  requestId?: string;
  ok: boolean;
  defaultBranch?: string;
  error?: string;
};

export type GhPrSummary = {
  number: number;
  title: string;
  state: string;
  url: string;
  isDraft: boolean;
};

export type GhPrListResponse = {
  requestId?: string;
  ok: boolean;
  branch?: string;
  prs: GhPrSummary[];
  error?: string;
};

export type GhPrComment = {
  author?: string;
  body: string;
  createdAt?: string;
};

export type GhPrDetail = {
  number: number;
  title: string;
  state: string;
  url: string;
  isDraft: boolean;
  baseRefName?: string;
  headRefName?: string;
  reviewDecision?: string;
  body?: string;
  author?: string;
  labels: string[];
  additions?: number;
  deletions?: number;
  createdAt?: string;
  updatedAt?: string;
  comments: GhPrComment[];
};

export type GhPrViewPayload = {
  worktreePath: string;
  selector: string;
};

export type GhPrViewResponse = {
  requestId?: string;
  ok: boolean;
  pr?: GhPrDetail;
  error?: string;
};

export type GhPrCreateWebPayload = {
  worktreePath: string;
  base: string;
};
