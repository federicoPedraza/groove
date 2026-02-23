import { CirclePause, CircleStop, FlaskConical, Loader2, Play, Terminal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TestingEnvironmentColor } from "@/components/pages/dashboard/types";
import { cn } from "@/lib/utils";
import type { TestingEnvironmentEntry } from "@/src/lib/ipc";

type TestingEnvironmentPanelProps = {
  environments: TestingEnvironmentEntry[];
  testingEnvironmentColorByWorktree: Record<string, TestingEnvironmentColor>;
  isTestingInstancePending: boolean;
  onStop: (worktree: string) => void;
  onRunLocal: (worktree: string) => void;
  onOpenTerminal: (worktree: string) => void;
  onRequestUnset: (environment: TestingEnvironmentEntry) => void;
};

export function TestingEnvironmentPanel({
  environments,
  testingEnvironmentColorByWorktree,
  isTestingInstancePending,
  onStop,
  onRunLocal,
  onOpenTerminal,
  onRequestUnset,
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

        <TooltipProvider>
          <div className="flex flex-col gap-3">
            {environments.map((environment) => {
            const isRunning = environment.status === "running";
            const isTarget = environment.isTarget ?? true;
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
                <div className="flex items-start justify-between gap-2">
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

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          onRequestUnset(environment);
                        }}
                        disabled={isTestingInstancePending || !isTarget}
                        aria-label={`Unset testing target for ${environment.worktree}`}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isTarget ? "Unset testing target" : "Testing target already unset"}</TooltipContent>
                  </Tooltip>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-9 px-4 border border-border/60 transition-colors hover:bg-secondary/70"
                            onClick={() => {
                              onOpenTerminal(environment.worktree);
                            }}
                            disabled={isTestingInstancePending}
                          >
                            {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
                            <span>Open terminal</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open terminal at this worktree</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </article>
            );
            })}
          </div>
        </TooltipProvider>
      </div>
    </section>
  );
}
