import {
  Activity,
  Backpack,
  Bug,
  Castle,
  Database,
  Flag,
  FlameKindling,
  Folder,
  Folders,
  Hammer,
  HeartPlus,
  LandPlot,
  LayoutDashboard,
  Package,
  PawPrint,
  PencilRuler,
  Settings,
  Swords,
  Trophy,
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
  | "inventory"
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
    inventory: { groove: "Inventory", business: "Inventory" },
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
    inventory: { groove: Backpack, business: Package },
    intelligence: { groove: PencilRuler, business: Database },
    home: { groove: Swords, business: LayoutDashboard },
    land: { groove: LandPlot, business: Folder },
  };

const WORKTREE_STATE_BUSINESS_LABELS: Record<WorktreeState, string> = {
  pending: "pending",
  hunting: "on diagnosis",
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

// GitHub pull-request status, gamified in "groove" mode. Business mode keeps
// the plain GitHub wording and shows no icon.
export type PrStatusKey = "open" | "draft" | "merged" | "closed";

type PrStatusEntry = {
  groove: { label: string; icon: LucideIcon };
  business: { label: string };
};

const PR_STATUS: Record<PrStatusKey, PrStatusEntry> = {
  open: { groove: { label: "Engaged", icon: Swords }, business: { label: "Open" } },
  draft: {
    groove: { label: "Forging", icon: Hammer },
    business: { label: "Draft" },
  },
  merged: {
    groove: { label: "Conquered", icon: Trophy },
    business: { label: "Merged" },
  },
  closed: {
    groove: { label: "Retreated", icon: Flag },
    business: { label: "Closed" },
  },
};

export function resolvePrStatusLabel(
  key: PrStatusKey,
  mode: GrooveBusinessMode,
): string {
  return mode === "groove" ? PR_STATUS[key].groove.label : PR_STATUS[key].business.label;
}

export function resolvePrStatusIcon(
  key: PrStatusKey,
  mode: GrooveBusinessMode,
): LucideIcon | null {
  return mode === "groove" ? PR_STATUS[key].groove.icon : null;
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
