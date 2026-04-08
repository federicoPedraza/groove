export function appendRequestId(detail: string | undefined, requestId: string | undefined): string | undefined {
  if (!requestId || requestId.trim().length === 0) {
    return detail;
  }

  if (!detail || detail.trim().length === 0) {
    return `(requestId: ${requestId})`;
  }

  return `${detail} (requestId: ${requestId})`;
}
