import { useSyncExternalStore } from "react";

import {
  isGrooveBusinessDisabled,
  subscribeToGlobalSettings,
} from "@/src/lib/ipc";
import type { WorktreeState } from "@/src/lib/ipc/types-core";

import {
  resolveGrooveBusinessIcon,
  resolveGrooveBusinessLabel,
  resolveWorktreeStateLabel,
  type GrooveBusinessLabelKey,
  type GrooveBusinessMode,
} from "./labels";
import type { LucideIcon } from "lucide-react";

function getGrooveBusinessModeSnapshot(): GrooveBusinessMode {
  return isGrooveBusinessDisabled() ? "business" : "groove";
}

export type UseGrooveBusinessResult = {
  mode: GrooveBusinessMode;
  isBusiness: boolean;
  label: (key: GrooveBusinessLabelKey) => string;
  Icon: (key: GrooveBusinessLabelKey) => LucideIcon;
  stateLabel: (state: WorktreeState) => string;
};

export function useGrooveBusiness(): UseGrooveBusinessResult {
  const mode = useSyncExternalStore(
    subscribeToGlobalSettings,
    getGrooveBusinessModeSnapshot,
    getGrooveBusinessModeSnapshot,
  );

  return {
    mode,
    isBusiness: mode === "business",
    label: (key) => resolveGrooveBusinessLabel(key, mode),
    Icon: (key) => resolveGrooveBusinessIcon(key, mode),
    stateLabel: (state) => resolveWorktreeStateLabel(state, mode),
  };
}
