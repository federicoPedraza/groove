import type { WorkspaceContextResponse } from "@/src/lib/ipc";

export function describeWorkspaceContextError(
  result: WorkspaceContextResponse,
  fallback = "Failed to load workspace context.",
): string {
  if (result.error && result.error.trim().length > 0) {
    return result.error;
  }
  return fallback;
}
