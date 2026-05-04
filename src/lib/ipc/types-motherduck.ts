export type MotherduckStatusResponse = {
  requestId?: string;
  ok: boolean;
  tokenPresent: boolean;
  defaultDatabase?: string;
  workspaceRoot?: string;
  error?: string;
};

export type MotherduckSetTokenPayload = {
  token: string;
  defaultDatabase?: string | null;
};

export type MotherduckMutationResponse = {
  requestId?: string;
  ok: boolean;
  tokenPresent: boolean;
  defaultDatabase?: string;
  error?: string;
};

export type MotherduckTestResponse = {
  requestId?: string;
  ok: boolean;
  currentDatabase?: string;
  currentUser?: string;
  latencyMs?: number;
  error?: string;
};

export type MotherduckQueryPayload = {
  sql: string;
  rowLimit?: number | null;
  database?: string | null;
};

export type MotherduckQueryResponse = {
  requestId?: string;
  ok: boolean;
  columns: string[];
  rows: string[][];
  rowCount: number;
  truncated: boolean;
  latencyMs?: number;
  error?: string;
};
