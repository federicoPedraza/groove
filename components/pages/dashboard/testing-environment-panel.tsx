import { ChevronDown, CirclePause, ExternalLink, FlaskConical, Loader2, Pause, Play, Terminal, X } from "lucide-react";

import { ACTIVE_ORANGE_BUTTON_CLASSES, SOFT_ORANGE_BUTTON_CLASSES } from "@/components/pages/dashboard/constants";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TestingEnvironmentColor } from "@/components/pages/dashboard/types";
import { cn } from "@/lib/utils";
import { openExternalUrl, type TestingEnvironmentEntry } from "@/src/lib/ipc";

type TestingEnvironmentPanelProps = {
  environments: TestingEnvironmentEntry[];
  testingEnvironmentColorByWorktree: Record<string, TestingEnvironmentColor>;
  isTestingInstancePending: boolean;
  onStop: (worktree: string) => void;
  onRunLocal: (worktree: string) => void;
  onRunLocalSeparateTerminal: (worktree: string) => void;
  onOpenTerminal: (worktree: string) => void;
  onRequestUnset: (environment: TestingEnvironmentEntry) => void;
};

export function TestingEnvironmentPanel({
  environments,
  testingEnvironmentColorByWorktree,
  isTestingInstancePending,
  onStop,
  onRunLocal,
  onRunLocalSeparateTerminal,
  onOpenTerminal,
  onRequestUnset,
}: TestingEnvironmentPanelProps) {
  const handleBrowse = (browseUrl: string | null): void => {
    if (!browseUrl) {
      return;
    }

    void openExternalUrl(browseUrl)
      .then((response) => {
        if (!response.ok) {
          console.warn("Failed to open testing environment URL", { browseUrl, error: response.error });
        }
      })
      .catch((error: unknown) => {
        console.warn("Failed to open testing environment URL", { browseUrl, error });
      });
  };

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
          <h2 className="text-sm font-semibold tracking-tight">Testing Environments ({String(environments.length)})</h2>
        </div>

        <TooltipProvider>
          <div className="flex flex-col gap-3">
            {environments.map((environment) => {
              const isRunning = environment.status === "running";
              const isTarget = environment.isTarget ?? true;
              const hasPort = typeof environment.port === "number" && Number.isFinite(environment.port) && environment.port > 0;
              const environmentColor = testingEnvironmentColorByWorktree[environment.worktree];
              const canBrowse = isRunning && hasPort;
              const browseUrl = isRunning && hasPort ? `http://localhost:${String(environment.port)}` : null;

              return (
                <article
                  key={environment.worktree}
                  className={cn(
                    "rounded-md border p-3",
                    environmentColor?.cardBorderClassName ?? "border-border",
                    isRunning ? environmentColor?.cardBackgroundClassName ?? "bg-muted/10" : "",
                  )}
                >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium leading-tight">
                      <FlaskConical aria-hidden="true" className={cn("size-3.5", environmentColor?.iconClassName ?? "text-muted-foreground")} />
                      <span>{environment.worktree}</span>
                    </p>
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {isRunning ? <CirclePause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
                      <span>{isRunning ? (hasPort ? `Running on port ${String(environment.port)}` : "Running") : "Not running"}</span>
                    </p>
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

                <div className="flex flex-wrap items-center gap-2">
                  {isRunning ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(ACTIVE_ORANGE_BUTTON_CLASSES, SOFT_ORANGE_BUTTON_CLASSES)}
                      onClick={() => {
                        onStop(environment.worktree);
                      }}
                      disabled={isTestingInstancePending}
                    >
                      {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Pause aria-hidden="true" className="size-4" />}
                      <span>Stop local</span>
                    </Button>
                  ) : (
                    <div className="inline-flex rounded-md">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="rounded-r-none"
                        onClick={() => {
                          onRunLocal(environment.worktree);
                        }}
                        disabled={isTestingInstancePending}
                      >
                        {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
                        <span>Run local</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="rounded-l-none border-l border-primary/30 px-2"
                            disabled={isTestingInstancePending}
                            aria-label="More local run options"
                          >
                            {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={isTestingInstancePending}
                            onSelect={(event) => {
                              event.preventDefault();
                              onRunLocalSeparateTerminal(environment.worktree);
                            }}
                          >
                            Run local on a new terminal
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-9 w-9 border border-border/60 p-0 transition-colors hover:bg-secondary/70"
                        onClick={() => {
                          onOpenTerminal(environment.worktree);
                        }}
                        disabled={isTestingInstancePending}
                        aria-label={`Open terminal for ${environment.worktree}`}
                        title={`Open terminal for ${environment.worktree}`}
                      >
                        {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open terminal at this worktree</TooltipContent>
                  </Tooltip>
                  {isRunning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9 w-9 border border-border/60 p-0 transition-colors hover:bg-secondary/70"
                          onClick={() => {
                            handleBrowse(browseUrl);
                          }}
                          disabled={isTestingInstancePending || !canBrowse}
                          aria-label={browseUrl ? `Browse ${browseUrl}` : `Browse ${environment.worktree}`}
                          title={browseUrl ? `Browse ${browseUrl}` : `Browse ${environment.worktree}`}
                        >
                          <ExternalLink aria-hidden="true" className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{browseUrl ? `Open ${browseUrl}` : "No running localhost port available"}</TooltipContent>
                    </Tooltip>
                  ) : null}
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
