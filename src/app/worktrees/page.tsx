"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { GrooveWorktreeTerminal } from "@/src/components/pages/worktrees/groove-worktree-terminal";
import { Card, CardContent } from "@/src/components/ui/card";
import { getContrastColor } from "@/src/lib/utils/get-contrast-color";
import {
  getWorktreeMascotAssignment,
  getMascotBorderClassNames,
} from "@/src/lib/utils/mascots";
import { getActiveWorktreeRows } from "@/src/lib/utils/worktree/status";

const COMPACT_FONT_SIZE = 10;
const MIN_COLUMN_WIDTH_PX = 420;
const TERMINAL_HEIGHT_PX = 360;

export default function WorktreesPage() {
  const {
    activeWorkspace,
    worktreeRows,
    activeTerminalWorktrees,
    isBusy,
    isWorkspaceHydrating,
    statusMessage,
    errorMessage,
    pickDirectory,
    openRecentDirectory,
    workspaceRoot,
    workspaceMeta,
  } = useDashboardState();

  const runnableRows = getActiveWorktreeRows(
    worktreeRows,
    activeTerminalWorktrees,
  );

  const knownWorktrees = useMemo(
    () =>
      worktreeRows.filter((r) => r.status !== "deleted").map((r) => r.worktree),
    [worktreeRows],
  );

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
      {!activeWorkspace ? null : runnableRows.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              There are no worktrees running at the moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_COLUMN_WIDTH_PX}px, 1fr))`,
          }}
        >
          {runnableRows.map((row) => {
            const mascotAssignment = getWorktreeMascotAssignment(row.worktree);
            const borderClasses = getMascotBorderClassNames(
              mascotAssignment.color,
            );
            const hexColor = mascotAssignment.color.hex;
            const contrastColor = getContrastColor(hexColor);

            return (
              <div
                key={row.path}
                className={`flex flex-col overflow-hidden rounded-lg border ${borderClasses}`}
                style={{ height: `${TERMINAL_HEIGHT_PX}px` }}
              >
                <div
                  className="flex items-center justify-between px-2 py-1.5 text-xs"
                  style={{ backgroundColor: hexColor, color: contrastColor }}
                >
                  <span className="truncate">{row.branchGuess}</span>
                  <Link
                    to={`/worktrees/${encodeURIComponent(row.worktree)}`}
                    aria-label={`Open details for ${row.worktree}`}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md p-0 opacity-80 hover:opacity-100"
                    style={{ color: contrastColor }}
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>

                <div className="min-h-0 flex-1">
                  {workspaceRoot && workspaceMeta ? (
                    <GrooveWorktreeTerminal
                      workspaceRoot={workspaceRoot}
                      workspaceMeta={workspaceMeta}
                      knownWorktrees={knownWorktrees}
                      worktree={row.worktree}
                      runningSessionIds={[]}
                      colorBorderClass={borderClasses}
                      colorHex={hexColor}
                      terminalFontSize={COMPACT_FONT_SIZE}
                      compactMode
                    />
                  ) : (
                    <div className="border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      No workspace context available.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
