import {
  Activity,
  Bug,
  Castle,
  Database,
  FlameKindling,
  Folder,
  Folders,
  HeartPlus,
  LandPlot,
  LayoutDashboard,
  PawPrint,
  PencilRuler,
  Settings,
  Swords,
  type LucideIcon,
} from "lucide-react";

import type { WorktreeState } from "@/src/lib/ipc/types-core";

export type GrooveBusinessMode = "groove" | "business";

export type GrooveBusinessLabelKey =
  | "barracks"
  | "stronghold"
  | "wilderness"
  | "situationRoom"
  | "bestiary"
  | "intelligence"
  | "home"
  | "land";

type LabelEntry = {
  groove: string;
  business: string;
};

type IconEntry = {
  groove: LucideIcon;
  business: LucideIcon;
};

export const GROOVE_BUSINESS_LABELS: Record<GrooveBusinessLabelKey, LabelEntry> =
  {
    barracks: { groove: "Barracks", business: "Dashboard" },
    stronghold: { groove: "Stronghold", business: "Settings" },
    wilderness: { groove: "Wilderness", business: "Worktrees" },
    situationRoom: { groove: "Situation Room", business: "Diagnostics" },
    bestiary: { groove: "Bestiary", business: "Bugs" },
    intelligence: { groove: "Intelligence", business: "Database" },
    home: { groove: "Home", business: "Home" },
    land: { groove: "Land", business: "Workspace" },
  };

export const GROOVE_BUSINESS_ICONS: Record<GrooveBusinessLabelKey, IconEntry> =
  {
    barracks: { groove: Swords, business: LayoutDashboard },
    stronghold: { groove: Castle, business: Settings },
    wilderness: { groove: FlameKindling, business: Folders },
    situationRoom: { groove: HeartPlus, business: Activity },
    bestiary: { groove: PawPrint, business: Bug },
    intelligence: { groove: PencilRuler, business: Database },
    home: { groove: Swords, business: LayoutDashboard },
    land: { groove: LandPlot, business: Folder },
  };

const WORKTREE_STATE_BUSINESS_LABELS: Record<WorktreeState, string> = {
  pending: "pending",
  fighting: "working",
  wounded: "waiting",
  defeated: "done",
  blocked: "blocked",
  forgotten: "archived",
};

export function resolveWorktreeStateLabel(
  state: WorktreeState,
  mode: GrooveBusinessMode,
): string {
  return mode === "business" ? WORKTREE_STATE_BUSINESS_LABELS[state] : state;
}

export function resolveGrooveBusinessLabel(
  key: GrooveBusinessLabelKey,
  mode: GrooveBusinessMode,
): string {
  return GROOVE_BUSINESS_LABELS[key][mode];
}

export function resolveGrooveBusinessIcon(
  key: GrooveBusinessLabelKey,
  mode: GrooveBusinessMode,
): LucideIcon {
  return GROOVE_BUSINESS_ICONS[key][mode];
}
