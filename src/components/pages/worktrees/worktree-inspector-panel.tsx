"use client";

import {
  FileDiff,
  Github,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { GitChangesSection } from "@/src/components/pages/worktrees/git-changes-section";
import { GitHubSection } from "@/src/components/pages/worktrees/github-section";
import type { PullRequestRecord, WorkspaceMeta } from "@/src/lib/ipc";
import { cn } from "@/src/lib/utils";

export type InspectorSection = "changes" | "github";

type WorktreeInspectorPanelProps = {
  worktreePath: string;
  worktree: string;
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  pullRequests: PullRequestRecord[];
  expanded: boolean;
  activeSection: InspectorSection;
  onToggleExpanded: () => void;
  onSelectSection: (section: InspectorSection) => void;
  onDraftCommitComment: () => void;
  isDraftPending: boolean;
  onViewCommitComments: () => void;
  committedCommentCount: number;
  onOpenPrInspector: (record: PullRequestRecord) => void;
};

export function WorktreeInspectorPanel({
  worktreePath,
  worktree,
  rootName,
  knownWorktrees,
  workspaceMeta,
  pullRequests,
  expanded,
  activeSection,
  onToggleExpanded,
  onSelectSection,
  onDraftCommitComment,
  isDraftPending,
  onViewCommitComments,
  committedCommentCount,
  onOpenPrInspector,
}: WorktreeInspectorPanelProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 overflow-hidden rounded-lg border bg-card",
        expanded ? "w-full" : "w-9",
      )}
    >
      <nav
        className={cn(
          "flex w-9 shrink-0 flex-col items-center gap-1 py-1",
          expanded && "border-r",
        )}
        aria-label="Worktree inspector sections"
      >
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={onToggleExpanded}
          aria-label={expanded ? "Collapse panel" : "Expand panel"}
          title={expanded ? "Collapse panel" : "Expand panel"}
        >
          {expanded ? (
            <PanelRightClose
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          ) : (
            <PanelRightOpen
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          )}
        </Button>

        <RailButton
          icon={FileDiff}
          label="Changes"
          active={expanded && activeSection === "changes"}
          onClick={() => {
            onSelectSection("changes");
          }}
        />
        <RailButton
          icon={Github}
          label="GitHub"
          active={expanded && activeSection === "github"}
          onClick={() => {
            onSelectSection("github");
          }}
        />
      </nav>

      {expanded ? (
        <div className="min-w-0 flex-1">
          {activeSection === "changes" ? (
            <GitChangesSection
              worktreePath={worktreePath}
              active
              onDraftCommitComment={onDraftCommitComment}
              isDraftPending={isDraftPending}
              onViewCommitComments={onViewCommitComments}
              committedCommentCount={committedCommentCount}
            />
          ) : (
            <GitHubSection
              worktreePath={worktreePath}
              worktree={worktree}
              rootName={rootName}
              knownWorktrees={knownWorktrees}
              workspaceMeta={workspaceMeta}
              pullRequests={pullRequests}
              active
              onOpenPrInspector={onOpenPrInspector}
            />
          )}
        </div>
      ) : null}
    </aside>
  );
}

type RailButtonProps = {
  icon: typeof FileDiff;
  label: string;
  active: boolean;
  onClick: () => void;
};

function RailButton({ icon: Icon, label, active, onClick }: RailButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "size-7 p-0",
        active && "bg-muted text-foreground",
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
