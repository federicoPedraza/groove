export type IntelligenceQueryRecord = {
  id: string;
  name: string;
  sql: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
};

export type IntelligenceQueryListResponse = {
  requestId?: string;
  ok: boolean;
  queries: IntelligenceQueryRecord[];
  error?: string;
};

export type IntelligenceQuerySaveRequest = {
  id?: string | null;
  name: string;
  sql: string;
  color: string;
  icon: string;
};

export type IntelligenceQuerySaveResponse = {
  requestId?: string;
  ok: boolean;
  savedId?: string;
  queries: IntelligenceQueryRecord[];
  error?: string;
};

export type IntelligenceQueryDeleteRequest = {
  id: string;
};

export type IntelligenceQueryDeleteResponse = {
  requestId?: string;
  ok: boolean;
  queries: IntelligenceQueryRecord[];
  error?: string;
};
