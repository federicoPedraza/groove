import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDrive, Loader2, RefreshCw, Scissors } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import {
  grooveRm,
  workspaceUpdateMaxWorktreeCount,
  worktreeStorageStats,
  type WorkspaceMeta,
  type WorktreeStorageRow,
  type WorktreeStorageStatsResponse,
} from "@/src/lib/ipc";
import { formatBytes } from "@/src/lib/format-bytes";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import { toast } from "@/src/lib/toast";
import { cn } from "@/src/lib/utils";
import { shouldPromptForceCutRetry } from "@/src/lib/utils/worktree/status";

type WorktreeStorageCardProps = {
  workspaceMeta: WorkspaceMeta | null;
};

export function WorktreeStorageCard({
  workspaceMeta,
}: WorktreeStorageCardProps) {
  const [stats, setStats] = useState<WorktreeStorageStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSizing, setIsSizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [maxInput, setMaxInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCut, setPendingCut] = useState<string[]>([]);

  const worktrees = useMemo(() => stats?.worktrees ?? [], [stats]);
  const sizesIncluded = stats?.sizesIncluded ?? false;
  const showCountPlaceholder = isLoading && !stats;

  const loadStats = useCallback(
    async (includeSizes: boolean) => {
      if (includeSizes) {
        setIsSizing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const result = await worktreeStorageStats({ includeSizes });
        if (!result.ok) {
          setErrorMessage(result.error ?? "Failed to read worktree storage.");
          setStats(null);
          return;
        }
        setStats(result);
        setMaxInput(
          result.maxWorktreeCount && result.maxWorktreeCount > 0
            ? String(result.maxWorktreeCount)
            : "",
        );
      } catch {
        setErrorMessage("Failed to read worktree storage.");
        setStats(null);
      } finally {
        setIsLoading(false);
        setIsSizing(false);
      }
    },
    [],
  );

  // Initial load counts only — sizing is opt-in (see "Calculate sizes").
  useEffect(() => {
    void loadStats(false);
  }, [loadStats]);

  const handleSave = useCallback(async () => {
    const trimmed = maxInput.trim();
    let parsed: number | null = null;
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!Number.isInteger(value) || value < 0) {
        toast.error("Enter a whole number (0 or empty means unlimited).");
        return;
      }
      parsed = value > 0 ? value : null;
    }

    setIsSaving(true);
    try {
      const result = await workspaceUpdateMaxWorktreeCount({
        maxWorktreeCount: parsed,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to save the worktree limit.");
        return;
      }
      toast.success(
        parsed === null
          ? "Worktree limit cleared (unlimited)."
          : `Worktree limit set to ${String(parsed)}.`,
      );

      const evicted = result.evictedWorktrees ?? [];
      if (evicted.length > 0) {
        playGrooveHookSound("remove");
        const label =
          evicted.length === 1
            ? evicted[0]
            : `${String(evicted.length)} worktrees (${evicted.join(", ")})`;
        toast.info(`Removed ${label} to enforce the new limit.`);
        await loadStats(sizesIncluded);
      }
    } catch {
      toast.error("Failed to save the worktree limit.");
    } finally {
      setIsSaving(false);
    }
  }, [maxInput, loadStats, sizesIncluded]);

  const cutWorktree = useCallback(
    async (row: WorktreeStorageRow) => {
      if (!workspaceMeta) {
        toast.error("No active workspace.");
        return;
      }
      if (
        !window.confirm(
          `Cut worktree "${row.worktree}"? This permanently removes its folder.`,
        )
      ) {
        return;
      }

      setPendingCut((prev) =>
        prev.includes(row.worktree) ? prev : [...prev, row.worktree],
      );
      const base = {
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktrees.map((entry) => entry.worktree),
        workspaceMeta,
        target: row.worktree,
        worktree: row.worktree,
      };
      try {
        let result = await grooveRm(base);
        if (!result.ok && shouldPromptForceCutRetry(result)) {
          if (
            window.confirm(
              `"${row.worktree}" has uncommitted changes or is locked. Force-delete it anyway?`,
            )
          ) {
            result = await grooveRm({ ...base, force: true });
          } else {
            return;
          }
        }

        if (result.ok) {
          playGrooveHookSound("remove");
          toast.success(`Cut ${row.worktree}.`, { command: "groove_rm" });
          await loadStats(true);
        } else {
          toast.error("Cut failed.", { command: "groove_rm" });
        }
      } catch {
        toast.error("Cut request failed.", { command: "groove_rm" });
      } finally {
        setPendingCut((prev) =>
          prev.filter((name) => name !== row.worktree),
        );
      }
    },
    [workspaceMeta, worktrees, loadStats],
  );

  const MAX_VISIBLE_WORKTREES = 5;
  const visibleWorktrees = worktrees.slice(0, MAX_VISIBLE_WORKTREES);
  const hiddenWorktrees = worktrees.slice(MAX_VISIBLE_WORKTREES);
  const hiddenBytes = hiddenWorktrees.reduce((sum, row) => sum + row.bytes, 0);

  const trimmedMax = maxInput.trim();
  const maxInputError =
    trimmedMax !== "" && !/^\d+$/.test(trimmedMax)
      ? "Enter a whole number, or leave empty for unlimited."
      : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <HardDrive aria-hidden="true" className="size-4" />
              Worktree storage
            </CardTitle>
            <CardDescription>
              Worktrees in this workspace. Set a maximum count to auto-remove the
              least-recently-used worktree whenever a new one is created.
              Worktrees that are running or have uncommitted changes are never
              removed.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void loadStats(false);
            }}
            disabled={isLoading}
            aria-label="Refresh worktree count"
          >
            {isLoading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            <span>Refresh</span>
          </Button>
        </div>

        {errorMessage ? (
          <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-sm border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Worktrees
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {showCountPlaceholder ? "—" : String(stats?.totalCount ?? 0)}
                </p>
              </div>
              <div className="rounded-sm border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total size
                </p>
                {sizesIncluded ? (
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBytes(stats?.totalBytes ?? 0)}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-0.5"
                    onClick={() => {
                      void loadStats(true);
                    }}
                    disabled={isSizing || showCountPlaceholder}
                  >
                    {isSizing ? (
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : null}
                    <span>{isSizing ? "Calculating" : "Calculate sizes"}</span>
                  </Button>
                )}
              </div>
            </div>

            {sizesIncluded && worktrees.length > 0 && (
              <div className="overflow-hidden rounded-sm border">
                {visibleWorktrees.map((row, index) => {
                  const isCutting = pendingCut.includes(row.worktree);
                  return (
                    <div
                      key={row.path}
                      className={cn(
                        "group flex items-center justify-between gap-3 px-3 py-1.5 text-sm",
                        index > 0 && "border-t",
                      )}
                    >
                      <span className="truncate font-medium">
                        {row.worktree}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-muted-foreground">
                          {formatBytes(row.bytes)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void cutWorktree(row);
                          }}
                          disabled={isCutting}
                          aria-label={`Cut ${row.worktree}`}
                          title="Cut worktree"
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-xs text-muted-foreground transition-[color,background-color,opacity] hover:bg-accent hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none",
                            isCutting
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          {isCutting ? (
                            <Loader2
                              aria-hidden="true"
                              className="size-3.5 animate-spin"
                            />
                          ) : (
                            <Scissors aria-hidden="true" className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {hiddenWorktrees.length > 0 && (
                  <div className="border-t px-3 py-1.5 text-sm text-muted-foreground">
                    …and {formatBytes(hiddenBytes)} across {hiddenWorktrees.length}{" "}
                    more {hiddenWorktrees.length === 1 ? "worktree" : "worktrees"}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Maximum worktree count
                </span>
                <Input
                  type="text"
                  placeholder="Unlimited"
                  className="w-40"
                  value={maxInput}
                  aria-invalid={maxInputError !== null}
                  onChange={(event) => {
                    setMaxInput(event.target.value);
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving || maxInputError !== null}
              >
                {isSaving ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                <span>Save</span>
              </Button>
            </div>
            {maxInputError ? (
              <p className="text-xs text-destructive">{maxInputError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave empty or set <code>0</code> for no limit.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
