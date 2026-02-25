import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { workspaceListSymlinkEntries, type WorkspaceBrowseEntry } from "@/src/lib/ipc";

type WorktreeSymlinkPathsModalProps = {
  open: boolean;
  workspaceRoot: string | null;
  selectedPaths: string[];
  savePending: boolean;
  onApply: (paths: string[]) => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

function parentPathOf(path: string): string {
  if (!path) {
    return "";
  }
  const index = path.lastIndexOf("/");
  if (index < 0) {
    return "";
  }
  return path.slice(0, index);
}

function sortSelectedPaths(paths: string[]): string[] {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function isRestrictedWorktreeSymlinkPath(path: string): boolean {
  return path === ".worktrees" || path.startsWith(".worktrees/");
}

export function WorktreeSymlinkPathsModal({
  open,
  workspaceRoot,
  selectedPaths,
  savePending,
  onApply,
  onOpenChange,
}: WorktreeSymlinkPathsModalProps) {
  const [draftPaths, setDraftPaths] = useState<string[]>(selectedPaths);
  const [browsePath, setBrowsePath] = useState("");
  const [entries, setEntries] = useState<WorkspaceBrowseEntry[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftPaths(sortSelectedPaths(selectedPaths));
    setSearchValue("");
    setDebouncedSearchValue("");
    setValidationError(null);
  }, [open, selectedPaths]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearchValue(searchValue.trim().toLocaleLowerCase());
    }, 220);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [open, searchValue]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsLoadingEntries(true);
    setLoadingError(null);

    void (async () => {
      try {
        const response = await workspaceListSymlinkEntries({
          relativePath: browsePath || null,
        });
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setEntries([]);
          setLoadingError(response.error ?? "Failed to browse workspace entries.");
          return;
        }

        setEntries(response.entries);
      } catch {
        if (cancelled) {
          return;
        }
        setEntries([]);
        setLoadingError("Failed to browse workspace entries.");
      } finally {
        if (!cancelled) {
          setIsLoadingEntries(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [browsePath, open]);

  const selectedSet = useMemo(() => new Set(draftPaths), [draftPaths]);
  const filteredEntries = useMemo(() => {
    if (!debouncedSearchValue) {
      return entries;
    }

    return entries.filter((entry) => entry.name.toLocaleLowerCase().includes(debouncedSearchValue));
  }, [debouncedSearchValue, entries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">Edit worktree symlink paths</DialogTitle>
          <DialogDescription>
            Browse repository entries and choose files or folders to symlink into worktrees.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[500px] grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-dashed p-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-xs text-muted-foreground">Browsing: {browsePath || "."}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!browsePath || isLoadingEntries}
                onClick={() => {
                  setBrowsePath((current) => parentPathOf(current));
                }}
              >
                <Undo2 className="size-4" />
                Up
              </Button>
            </div>

            <Input
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
              }}
              placeholder="Search files and folders"
              className="h-8"
              aria-label="Search entries"
            />

            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingEntries && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Loading entries...
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingEntries && loadingError && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-destructive">
                        {loadingError}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingEntries && !loadingError && filteredEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        {debouncedSearchValue ? "No matching entries." : "This directory is empty."}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoadingEntries && !loadingError && filteredEntries.map((entry) => {
                    const isSelected = selectedSet.has(entry.path);
                    const isRestricted = isRestrictedWorktreeSymlinkPath(entry.path);

                    return (
                      <TableRow
                        key={entry.path}
                        className={cn(
                          isSelected ? "bg-blue-500/10 hover:bg-blue-500/20" : "hover:bg-muted/50",
                        )}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-2 text-left text-sm text-foreground",
                              entry.isDir ? "hover:text-primary" : "cursor-default",
                            )}
                            onClick={() => {
                              if (entry.isDir) {
                                setBrowsePath(entry.path);
                              }
                            }}
                          >
                            {entry.isDir && <ChevronRight className="size-4 opacity-65" />}
                            <span>{entry.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "secondary" : "outline"}
                            disabled={isSelected || isRestricted}
                            className="h-8 w-8 p-0"
                            title={isRestricted ? "Restricted path cannot be symlinked." : undefined}
                            onClick={() => {
                              if (isRestricted) {
                                setValidationError("Restricted paths like .worktrees cannot be symlinked.");
                                return;
                              }
                              setValidationError(null);
                              setDraftPaths((current) => sortSelectedPaths([...current, entry.path]));
                            }}
                          >
                            <Plus className="size-4" />
                            <span className="sr-only">Add {entry.path}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-dashed p-2">
            <p className="px-1 text-xs text-muted-foreground">Selected paths</p>
            <div className="max-h-[420px] space-y-1 overflow-auto">
              {draftPaths.length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">No paths selected.</p>}
              {draftPaths.map((path) => (
                <div key={path} className="flex items-center justify-between gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1.5">
                  <code className="truncate text-xs">{path}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setDraftPaths((current) => current.filter((entry) => entry !== path));
                    }}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Remove {path}</span>
                  </Button>
                </div>
              ))}
            </div>
            {validationError && <p className="px-1 text-xs text-destructive">{validationError}</p>}
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-3">
          <div className="mr-auto text-xs text-muted-foreground">{workspaceRoot ? `Workspace: ${workspaceRoot}` : "No active workspace"}</div>
          <Button
            type="button"
            variant="outline"
            disabled={savePending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Discard
          </Button>
          <Button
            type="button"
            disabled={savePending}
            onClick={() => {
              const hasRestrictedPath = draftPaths.some((path) => isRestrictedWorktreeSymlinkPath(path));
              if (hasRestrictedPath) {
                setValidationError("Restricted paths like .worktrees cannot be saved.");
                return;
              }
              setValidationError(null);
              void onApply(draftPaths);
            }}
          >
            {savePending && <Loader2 className="size-4 animate-spin" />}
            Apply change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
