export function summarizeRestoreOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`.trim();
  const lines = combined
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  const actionableLine = lines.find((line) =>
    /(?:fatal:|error:|\bcannot\b|already checked out|\bfailed\b|\bunable\b)/i.test(line),
  );
  const summaryLine = actionableLine ?? lines[0];

  return summaryLine.length > 160 ? `${summaryLine.slice(0, 157)}...` : summaryLine;
}
