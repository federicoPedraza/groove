export type DoctrineWorktreeCase = {
  branch: string;
  prompts: string[];
  date: string;
  summary?: string;
};

export type DoctrineReportRequest = {
  maxCases?: number;
};

export type DoctrineReportResponse = {
  requestId?: string;
  ok: boolean;
  cases: DoctrineWorktreeCase[];
  reportText: string;
  inputTokens: number;
  worktreesScanned: number;
  worktreesQualified: number;
  error?: string;
};

export type DoctrineState = "ready" | "inactive";

export type DoctrineRecord = {
  id: string;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  result: string;
  state: DoctrineState;
  instructions?: string;
};

export type DoctrineResultRequest = {
  reportText: string;
  instructions?: string | null;
};

export type DoctrineResultResponse = {
  requestId?: string;
  ok: boolean;
  newDoctrineId?: string;
  doctrines: DoctrineRecord[];
  error?: string;
};

export type DoctrineListResponse = {
  requestId?: string;
  ok: boolean;
  doctrines: DoctrineRecord[];
  error?: string;
};

export type DoctrineSetActiveRequest = {
  id: string;
};

export type DoctrineSetActiveResponse = {
  requestId?: string;
  ok: boolean;
  doctrines: DoctrineRecord[];
  error?: string;
};
