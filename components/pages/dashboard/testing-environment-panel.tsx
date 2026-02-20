import { CirclePause, CircleStop, FlaskConical, Loader2, Play, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TestingEnvironmentColor } from "@/components/pages/dashboard/types";
import { cn } from "@/lib/utils";
import type { TestingEnvironmentEntry } from "@/src/lib/ipc";

type TestingEnvironmentPanelProps = {
  environments: TestingEnvironmentEntry[];
  testingEnvironmentColorByWorktree: Record<string, TestingEnvironmentColor>;
  isTestingInstancePending: boolean;
  onStop: (worktree: string) => void;
  onRunLocal: (worktree: string) => void;
  onRunSeparate: (worktree: string) => void;
};

export function TestingEnvironmentPanel({
  environments,
  testingEnvironmentColorByWorktree,
  isTestingInstancePending,
  onStop,
  onRunLocal,
  onRunSeparate,
}: TestingEnvironmentPanelProps) {
  if (environments.length === 0) {
    return (
      <section className="rounded-lg border bg-muted/20 p-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Testing Environments</h2>
          <p className="text-xs text-muted-foreground">No targets selected (pick one with Test in the table).</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Testing Environments</h2>
          <p className="text-xs text-muted-foreground">
            Targets selected: {String(environments.length)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {environments.map((environment) => {
            const isRunning = environment.status === "running";
            const hasInstanceId = typeof environment.instanceId === "string" && environment.instanceId.trim().length > 0;
            const hasPort = typeof environment.port === "number" && Number.isFinite(environment.port) && environment.port > 0;
            const environmentColor = testingEnvironmentColorByWorktree[environment.worktree];

            return (
              <article
                key={environment.worktree}
                className={cn(
                  "rounded-md border p-3",
                  environmentColor?.cardBorderClassName ?? "border-border",
                  environmentColor?.cardBackgroundClassName ?? "bg-muted/10",
                )}
              >
                <div className="space-y-1">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium leading-tight">
                    <FlaskConical aria-hidden="true" className={cn("size-3.5", environmentColor?.iconClassName ?? "text-muted-foreground")} />
                    <span>{environment.worktree}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Target: {environment.worktreePath}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {isRunning ? <CirclePause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
                    <span>{isRunning ? "Running" : "Not running"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Port: {isRunning && hasPort ? environment.port : "-"}</p>
                  <p className="text-xs text-muted-foreground">Instance ID: {hasInstanceId ? environment.instanceId : "-"}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isRunning ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onStop(environment.worktree);
                      }}
                      disabled={isTestingInstancePending}
                    >
                      {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
                      <span>Stop local</span>
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => {
                          onRunLocal(environment.worktree);
                        }}
                        disabled={isTestingInstancePending}
                      >
                        {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
                        <span>Run local</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-9 px-4 border border-border/60 transition-colors hover:bg-secondary/70"
                        onClick={() => {
                          onRunSeparate(environment.worktree);
                        }}
                        disabled={isTestingInstancePending}
                      >
                        {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
                        <span>Run separate</span>
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
