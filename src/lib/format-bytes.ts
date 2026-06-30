/**
 * Formats a byte count into a human-readable string (e.g. `1.5 GB`).
 * Returns `"Unavailable"` for non-finite or negative input.
 */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "Unavailable";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}
