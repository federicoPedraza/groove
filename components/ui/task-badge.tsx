"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ExternalLink, GitPullRequest, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import type { WorkspaceTask, WorkspaceTaskPrEntry } from "@/src/lib/ipc";
import { cn } from "@/lib/utils";

type TaskBadgeProps = {
  worktree: string;
  tasks?: WorkspaceTask[] | null;
  selectedTaskId: string | null;
  onTaskChange: (taskId: string | null) => void;
  onAssignPr: (taskId: string, url: string) => Promise<void>;
  onCreateTask?: (prompt: string) => Promise<string | null>;
  disabled?: boolean;
  className?: string;
};

type MenuView = "actions" | "tasks" | "prs" | "assign-pr";

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatPrTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf())) {
    return timestamp;
  }

  return parsed.toLocaleString();
}

function getPrLabel(pr: WorkspaceTaskPrEntry): string {
  if (pr.title?.trim()) {
    return pr.title;
  }

  if (typeof pr.number === "number") {
    return `PR #${String(pr.number)}`;
  }

  return pr.url;
}

export function TaskBadge({
  worktree,
  tasks = [],
  selectedTaskId,
  onTaskChange,
  onAssignPr,
  onCreateTask,
  disabled = false,
  className,
}: TaskBadgeProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("actions");
  const [query, setQuery] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [isAssigningPr, setIsAssigningPr] = useState(false);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [newTaskPrompt, setNewTaskPrompt] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const searchInputId = useId();
  const prInputId = useId();
  const newTaskPromptId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prInputRef = useRef<HTMLInputElement | null>(null);
  const newTaskPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const availableTasks = useMemo(() => tasks ?? [], [tasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }

    return availableTasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [selectedTaskId, availableTasks]);

  const hasPullRequests = (selectedTask?.PR?.length ?? 0) > 0;
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPrUrl = prUrl.trim();
  const isPrUrlValid = isLikelyHttpUrl(normalizedPrUrl);

  const filteredTasks = useMemo(() => {
    const allTasks = [
      {
        id: null,
        title: "no task",
        description: "Unassigned",
      },
      ...availableTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
      })),
    ];

    if (!normalizedQuery) {
      return allTasks;
    }

    return allTasks.filter((task) => {
      return [task.title, task.id, task.description]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [normalizedQuery, availableTasks]);

  useEffect(() => {
    if (!open) {
      setView("actions");
      setQuery("");
      setPrUrl("");
      setIsAssigningPr(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || view !== "tasks") {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open || view !== "assign-pr") {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      prInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [open, view]);

  const saveAssignedPr = (): void => {
    if (!selectedTask || !isPrUrlValid || isAssigningPr) {
      return;
    }

    setIsAssigningPr(true);
    void onAssignPr(selectedTask.id, normalizedPrUrl)
      .then(() => {
        setPrUrl("");
        setView("prs");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to assign PR.");
      })
      .finally(() => {
        setIsAssigningPr(false);
      });
  };

  const createNewTask = (): void => {
    const normalizedPrompt = newTaskPrompt.trim();

    if (!normalizedPrompt || !onCreateTask || isCreatingTask) {
      return;
    }

    setIsCreatingTask(true);
    void onCreateTask(normalizedPrompt)
      .then((taskId) => {
        if (taskId) {
          onTaskChange(taskId);
        }

        setNewTaskPrompt("");
        setIsNewTaskDialogOpen(false);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to create task.");
      })
      .finally(() => {
        setIsCreatingTask(false);
      });
  };

  useEffect(() => {
    if (!isNewTaskDialogOpen) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      newTaskPromptRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isNewTaskDialogOpen]);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={selectedTask ? `Task assigned to ${selectedTask.title}` : `No task assigned for ${worktree}`}
            title={selectedTask?.title ?? "no task"}
            className={cn(
              "relative inline-flex h-6 min-w-[9rem] max-w-[16rem] items-center justify-center rounded-full border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              open ? "border-ring/70 bg-accent text-foreground" : null,
              selectedTask
                ? "border-border/70 bg-muted/50 text-foreground hover:bg-muted"
                : "border-border/70 border-dashed bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
              className,
            )}
          >
            {hasPullRequests ? <GitPullRequest aria-hidden="true" className="pointer-events-none absolute left-2 size-3.5" /> : null}
            <span className={cn("min-w-0 flex-1 truncate text-center", hasPullRequests ? "px-4" : null)}>{selectedTask?.title ?? "no task"}</span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
          {view === "actions" ? (
            <>
              {!selectedTask ? (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setOpen(false);
                      setIsNewTaskDialogOpen(true);
                    }}
                  >
                    New task
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("tasks");
                    }}
                  >
                    Set Task
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("tasks");
                    }}
                  >
                    Change task
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("assign-pr");
                    }}
                  >
                    Assign PR
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setView("prs");
                    }}
                  >
                    Go to PR
                  </DropdownMenuItem>
                </>
              )}
            </>
          ) : null}

        {view === "tasks" ? (
          <div className="space-y-2 py-1">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setView("actions");
              }}
            >
              <ChevronLeft aria-hidden="true" className="mr-2 size-4 shrink-0 text-muted-foreground" />
              Back
            </DropdownMenuItem>
            <div className="px-1">
              <label className="sr-only" htmlFor={searchInputId}>
                Search tasks for {worktree}
              </label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={searchInputId}
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                  placeholder="Search tasks"
                  className="h-8 pl-8"
                  aria-label={`Search tasks for ${worktree}`}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") {
                      event.stopPropagation();
                    }
                  }}
                />
              </div>
            </div>
            {filteredTasks.length === 0 ? (
              <DropdownMenuItem disabled className="mt-1">
                No matching results.
              </DropdownMenuItem>
            ) : (
              filteredTasks.map((task) => {
                const isSelected = selectedTaskId === task.id || (!selectedTaskId && task.id === null);

                return (
                  <DropdownMenuItem
                    key={task.id ?? "__no_task__"}
                    title={task.description}
                    className="min-w-0 first:mt-1"
                    onSelect={() => {
                      onTaskChange(task.id);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                    </div>
                    {isSelected ? <Check aria-hidden="true" className="ml-2 size-4 shrink-0 text-muted-foreground" /> : null}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>
        ) : null}

        {view === "prs" ? (
          <>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setView("actions");
              }}
            >
              <ChevronLeft aria-hidden="true" className="mr-2 size-4 shrink-0 text-muted-foreground" />
              Back
            </DropdownMenuItem>
            {(selectedTask?.PR ?? []).length === 0 ? (
              <DropdownMenuItem disabled>No pull requests linked to this task yet.</DropdownMenuItem>
            ) : (
              (selectedTask?.PR ?? []).map((pr, index) => (
                <DropdownMenuItem
                  key={`${selectedTask?.id ?? "task"}-pr-${String(index)}`}
                  className="min-w-0"
                  onSelect={(event) => {
                    event.preventDefault();
                    window.open(pr.url, "_blank", "noopener,noreferrer");
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{getPrLabel(pr)}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatPrTimestamp(pr.timestamp)}</p>
                  </div>
                  <ExternalLink aria-hidden="true" className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
                </DropdownMenuItem>
              ))
            )}
          </>
        ) : null}

        {view === "assign-pr" ? (
          <div className="space-y-2 py-1">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setView("actions");
              }}
            >
              <ChevronLeft aria-hidden="true" className="mr-2 size-4 shrink-0 text-muted-foreground" />
              Back
            </DropdownMenuItem>
            <div className="space-y-2 px-1">
              <label className="sr-only" htmlFor={prInputId}>
                Pull request URL
              </label>
              <Input
                id={prInputId}
                ref={prInputRef}
                value={prUrl}
                onChange={(event) => {
                  setPrUrl(event.target.value);
                }}
                placeholder="https://github.com/org/repo/pull/123"
                className="h-8"
                aria-label="Pull request URL"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveAssignedPr();
                  }

                  if (event.key !== "Escape") {
                    event.stopPropagation();
                  }
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              />
              {!isPrUrlValid && normalizedPrUrl.length > 0 ? (
                <p className="px-1 text-xs text-destructive">Enter a valid http(s) URL.</p>
              ) : null}
            </div>
            <DropdownMenuItem
              disabled={!selectedTask || !isPrUrlValid || isAssigningPr}
              onSelect={(event) => {
                event.preventDefault();
                saveAssignedPr();
              }}
            >
              Save
            </DropdownMenuItem>
          </div>
        ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isNewTaskDialogOpen}
        onOpenChange={(nextOpen) => {
          if (isCreatingTask) {
            return;
          }

          setIsNewTaskDialogOpen(nextOpen);
          if (!nextOpen) {
            setNewTaskPrompt("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Paste what you want to get done and Consellour will create the task fields.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={newTaskPromptId} className="sr-only">
              Task details
            </label>
            <textarea
              id={newTaskPromptId}
              ref={newTaskPromptRef}
              value={newTaskPrompt}
              onChange={(event) => {
                setNewTaskPrompt(event.target.value);
              }}
              rows={8}
              placeholder="Describe the task for Consellour"
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCreatingTask}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  createNewTask();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (isCreatingTask) {
                  return;
                }
                setIsNewTaskDialogOpen(false);
                setNewTaskPrompt("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={createNewTask} disabled={isCreatingTask || newTaskPrompt.trim().length === 0 || !onCreateTask}>
              {isCreatingTask ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
