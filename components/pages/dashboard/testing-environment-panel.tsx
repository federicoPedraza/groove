import { CirclePause, CircleStop, Loader2, Play, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";

type TestingEnvironmentPanelProps = {
  testingTargetWorktree: string | undefined;
  testingStatus: "none" | "stopped" | "running" | undefined;
  testingInstanceId: string | undefined;
  hasTestingTargetRow: boolean;
  isTestingInstancePending: boolean;
  onStop: () => void;
  onRunLocal: () => void;
  onRunSeparate: () => void;
};

export function TestingEnvironmentPanel({
  testingTargetWorktree,
  testingStatus,
  testingInstanceId,
  hasTestingTargetRow,
  isTestingInstancePending,
  onStop,
  onRunLocal,
  onRunSeparate,
}: TestingEnvironmentPanelProps) {
  const isRunning = testingStatus === "running";

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Current Testing Environment</h2>
          <p className="text-xs text-muted-foreground">
            {testingTargetWorktree ? `Target: ${testingTargetWorktree}` : "Target: none selected (pick one with Test in the table)."}
          </p>
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {isRunning ? <CirclePause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
            <span>{isRunning ? "Running" : "Not running"}</span>
            {testingInstanceId ? <span>{`(instance=${testingInstanceId})`}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button type="button" variant="secondary" size="sm" onClick={onStop} disabled={isTestingInstancePending}>
              {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
              <span>Stop local</span>
            </Button>
          ) : (
            <>
              <Button type="button" variant="default" size="sm" onClick={onRunLocal} disabled={isTestingInstancePending || !hasTestingTargetRow}>
                {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
                <span>Run locally</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 px-4 border border-border/60 transition-colors hover:bg-secondary/70"
                onClick={onRunSeparate}
                disabled={isTestingInstancePending || !hasTestingTargetRow}
              >
                {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
                <span>Run separately</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
