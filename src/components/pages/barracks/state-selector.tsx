import type { ReactNode } from "react";
import { Check, Copy, FolderOpen, Pause } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/src/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  getWorktreeStateBadgeClasses,
  getWorktreeStateIcon,
  getWorktreeStateIconColorClass,
  getWorktreeStateTitle,
} from "@/src/components/pages/barracks/worktree-state";
import type { WorktreeState } from "@/src/components/pages/barracks/types";
import { WORKTREE_STATES, workspaceOpenDirectory } from "@/src/lib/ipc";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import { toast } from "@/src/lib/toast";
import { cn } from "@/src/lib/utils";

type StateSelectorCommonProps = {
  worktree: string;
  currentState: WorktreeState;
  onSelect: (state: WorktreeState) => void;
};

function StateRowContent({
  state,
  isSelected,
}: {
  state: WorktreeState;
  isSelected: boolean;
}) {
  const grooveBusiness = useGrooveBusiness();
  return (
    <>
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center [&>svg]:size-4",
          getWorktreeStateIconColorClass(state),
        )}
      >
        {getWorktreeStateIcon(state, grooveBusiness.mode)}
      </span>
      <span className="flex-1">{grooveBusiness.stateLabel(state)}</span>
      <Check
        aria-hidden="true"
        className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")}
      />
    </>
  );
}

export function WorktreeStateBadge({
  state,
  className,
}: {
  state: WorktreeState;
  className?: string;
}) {
  const grooveBusiness = useGrooveBusiness();
  return (
    <Badge
      variant="outline"
      className={cn(getWorktreeStateBadgeClasses(state), className)}
      title={getWorktreeStateTitle(state)}
    >
      {getWorktreeStateIcon(state, grooveBusiness.mode)}
      {grooveBusiness.stateLabel(state)}
    </Badge>
  );
}

const STATE_ITEM_HEIGHT_PX = 22;
const STATE_ITEM_GAP_PX = 4;

export function WorktreeStateDropdownMenu({
  worktree,
  currentState,
  onSelect,
}: StateSelectorCommonProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Set state for worktree ${worktree}`}
          style={{ height: `${STATE_ITEM_HEIGHT_PX}px` }}
        >
          <WorktreeStateBadge state={currentState} className="cursor-pointer" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={STATE_ITEM_GAP_PX}
        className="flex min-w-0 flex-col border-0 bg-transparent p-0 shadow-none"
        style={{ gap: `${STATE_ITEM_GAP_PX}px` }}
      >
        {WORKTREE_STATES.filter((state) => state !== currentState).map((state) => (
          <DropdownMenuItem
            key={state}
            onSelect={() => {
              onSelect(state);
            }}
            className="cursor-pointer rounded-sm p-0 focus:bg-transparent data-[highlighted]:bg-transparent"
            style={{ height: `${STATE_ITEM_HEIGHT_PX}px` }}
          >
            <WorktreeStateBadge
              state={state}
              className="cursor-pointer shadow-lg transition-none"
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorktreeStateContextMenu({
  worktree,
  worktreePath,
  currentState,
  onSelect,
  onPauseGroove,
  children,
}: StateSelectorCommonProps & {
  worktreePath: string;
  onPauseGroove: () => void;
  children: ReactNode;
}) {
  const grooveBusiness = useGrooveBusiness();

  const handleOpenDirectory = () => {
    void workspaceOpenDirectory(worktreePath)
      .then((response) => {
        if (!response.ok) {
          toast.error(response.error ?? "Failed to open worktree directory.");
        }
      })
      .catch(() => {
        toast.error("Failed to open worktree directory.");
      });
  };

  const handleCopyDirectory = () => {
    void navigator.clipboard
      .writeText(worktreePath)
      .then(() => {
        toast.success("Copied worktree directory to clipboard.");
      })
      .catch(() => {
        toast.error("Failed to copy worktree directory.");
      });
  };

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuLabel className="truncate">{worktree}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center [&>svg]:size-4",
                getWorktreeStateIconColorClass(currentState),
              )}
            >
              {getWorktreeStateIcon(currentState, grooveBusiness.mode)}
            </span>
            <span className="flex-1">State</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            {WORKTREE_STATES.map((state) => (
              <ContextMenuItem
                key={state}
                onSelect={() => {
                  onSelect(state);
                }}
                className="gap-2"
              >
                <StateRowContent
                  state={state}
                  isSelected={state === currentState}
                />
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem className="gap-2" onSelect={handleOpenDirectory}>
          <FolderOpen aria-hidden="true" className="size-4 text-sky-500" />
          <span className="flex-1">Open directory</span>
        </ContextMenuItem>
        <ContextMenuItem className="gap-2" onSelect={handleCopyDirectory}>
          <Copy aria-hidden="true" className="size-4 text-emerald-500" />
          <span className="flex-1">Copy directory path</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="gap-2" onSelect={onPauseGroove}>
          <Pause aria-hidden="true" className="size-4 text-amber-500" />
          <span className="flex-1">Pause Groove</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
