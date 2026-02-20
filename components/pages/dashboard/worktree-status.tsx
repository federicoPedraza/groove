import { AlertTriangle, Octagon, OctagonPause, OctagonX } from "lucide-react";

import {
  CLOSING_STATUS_CLASSES,
  CORRUPTED_STATUS_CLASSES,
  PAUSED_STATUS_CLASSES,
  READY_STATUS_CLASSES,
} from "@/components/pages/dashboard/constants";
import type { WorktreeStatus } from "@/components/pages/dashboard/types";

export function getWorktreeStatusBadgeClasses(status: WorktreeStatus): string {
  if (status === "ready") {
    return READY_STATUS_CLASSES;
  }
  if (status === "closing") {
    return CLOSING_STATUS_CLASSES;
  }
  if (status === "paused") {
    return PAUSED_STATUS_CLASSES;
  }
  return CORRUPTED_STATUS_CLASSES;
}

export function getWorktreeStatusTitle(status: WorktreeStatus): string {
  if (status === "ready") {
    return "Workspace is valid and opencode is running.";
  }
  if (status === "closing") {
    return "Workspace is currently closing.";
  }
  if (status === "paused") {
    return "Workspace is valid, but opencode is not running.";
  }
  return "Workspace is invalid or missing groove metadata.";
}

export function getWorktreeStatusIcon(status: WorktreeStatus) {
  if (status === "ready") {
    return <Octagon aria-hidden="true" />;
  }
  if (status === "closing") {
    return <OctagonX aria-hidden="true" />;
  }
  if (status === "paused") {
    return <OctagonPause aria-hidden="true" />;
  }
  return <AlertTriangle aria-hidden="true" />;
}
