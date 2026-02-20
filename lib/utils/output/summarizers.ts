export function summarizeRestoreOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`.trim();
  const firstLine = combined
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return undefined;
  }
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
}
