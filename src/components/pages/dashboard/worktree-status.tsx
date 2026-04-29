import { AlertTriangle, Octagon, OctagonPause, Trash2 } from "lucide-react";

import {
  CORRUPTED_STATUS_CLASSES,
  DELETED_STATUS_CLASSES,
  PAUSED_STATUS_CLASSES,
  READY_STATUS_CLASSES,
} from "@/src/components/pages/dashboard/constants";
import type { WorktreeStatus } from "@/src/components/pages/dashboard/types";

export function getWorktreeStatusBadgeClasses(status: WorktreeStatus): string {
  if (status === "ready") {
    return READY_STATUS_CLASSES;
  }
  if (status === "paused") {
    return PAUSED_STATUS_CLASSES;
  }
  if (status === "deleted") {
    return DELETED_STATUS_CLASSES;
  }
  return CORRUPTED_STATUS_CLASSES;
}

export function getWorktreeStatusTitle(status: WorktreeStatus): string {
  if (status === "ready") {
    return "Worktree has active terminal sessions.";
  }
  if (status === "paused") {
    return "Worktree has no active terminal sessions.";
  }
  if (status === "deleted") {
    return "Worktree was deleted and can be restored.";
  }
  return "Workspace is invalid or missing groove metadata.";
}

export function getWorktreeStatusIcon(status: WorktreeStatus) {
  if (status === "ready") {
    return <Octagon aria-hidden="true" />;
  }
  if (status === "paused") {
    return <OctagonPause aria-hidden="true" />;
  }
  if (status === "deleted") {
    return <Trash2 aria-hidden="true" />;
  }
  return <AlertTriangle aria-hidden="true" />;
}
