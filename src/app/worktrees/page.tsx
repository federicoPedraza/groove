"use client";

import { Link } from "react-router-dom";

import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";
import { getWorktreeStatusBadgeClasses, getWorktreeStatusIcon, getWorktreeStatusTitle } from "@/src/components/pages/dashboard/worktree-status";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { deriveWorktreeStatus, getActiveWorktreeRows } from "@/src/lib/utils/worktree/status";

export default function WorktreesPage() {
  const {
    activeWorkspace,
    worktreeRows,
    runtimeStateByWorktree,
    isBusy,
    isWorkspaceHydrating,
    statusMessage,
    errorMessage,
    pickDirectory,
    openRecentDirectory,
  } = useDashboardState();

  const runnableRows = getActiveWorktreeRows(worktreeRows, runtimeStateByWorktree);

  useAppLayout({
    noDirectoryOpenState: {
      isVisible: !isWorkspaceHydrating && !activeWorkspace,
      isBusy,
      statusMessage,
      errorMessage,
      onSelectDirectory: pickDirectory,
      onOpenRecentDirectory: openRecentDirectory,
    },
  });

  return (
    <>
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Worktrees</h1>
              <p className="text-sm text-muted-foreground">Ready or running worktrees that currently have active runtime context.</p>
            </div>
          </header>

          {runnableRows.length === 0 ? (
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">There are no worktrees running at the moment.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {runnableRows.map((row) => {
                const status = deriveWorktreeStatus(row.status, runtimeStateByWorktree[row.worktree]);

                return (
                  <Card key={row.path}>
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{row.worktree}</CardTitle>
                        <Badge variant="outline" className={getWorktreeStatusBadgeClasses(status)} title={getWorktreeStatusTitle(status)}>
                          {getWorktreeStatusIcon(status)}
                          {status}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={row.branchGuess}>Branch: {row.branchGuess}</p>
                    </CardHeader>
                    <CardContent>
                      <Link
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                        to={`/worktrees/${encodeURIComponent(row.worktree)}`}
                      >
                        Open details
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
