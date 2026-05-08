import {
  Bookmark,
  Bug,
  Calendar,
  Database,
  Filter,
  Folder,
  Inbox,
  ListTodo,
  Star,
  Tag,
  Ticket,
  User,
  type LucideIcon,
} from "lucide-react";

export type IntelligenceQueryColorId =
  | "emerald"
  | "blue"
  | "amber"
  | "rose"
  | "violet"
  | "slate"
  | "cyan"
  | "orange";

type IntelligenceQueryColorOption = {
  id: IntelligenceQueryColorId;
  label: string;
  badgeClasses: string;
  swatchClasses: string;
};

export const INTELLIGENCE_QUERY_COLORS: IntelligenceQueryColorOption[] = [
  {
    id: "emerald",
    label: "Emerald",
    badgeClasses:
      "border-emerald-700/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/70 dark:text-white dark:[&>svg]:text-emerald-100",
    swatchClasses: "bg-emerald-500/40 border-emerald-700/55",
  },
  {
    id: "blue",
    label: "Blue",
    badgeClasses:
      "border-blue-700/35 bg-blue-500/15 text-blue-900 dark:border-blue-400/70 dark:text-white dark:[&>svg]:text-blue-100",
    swatchClasses: "bg-blue-500/40 border-blue-700/55",
  },
  {
    id: "amber",
    label: "Amber",
    badgeClasses:
      "border-amber-700/35 bg-amber-500/15 text-amber-900 dark:border-amber-400/70 dark:text-white dark:[&>svg]:text-amber-100",
    swatchClasses: "bg-amber-500/40 border-amber-700/55",
  },
  {
    id: "rose",
    label: "Rose",
    badgeClasses:
      "border-rose-700/35 bg-rose-500/15 text-rose-900 dark:border-rose-400/70 dark:text-white dark:[&>svg]:text-rose-100",
    swatchClasses: "bg-rose-500/40 border-rose-700/55",
  },
  {
    id: "violet",
    label: "Violet",
    badgeClasses:
      "border-violet-700/35 bg-violet-500/15 text-violet-900 dark:border-violet-400/70 dark:text-white dark:[&>svg]:text-violet-100",
    swatchClasses: "bg-violet-500/40 border-violet-700/55",
  },
  {
    id: "slate",
    label: "Slate",
    badgeClasses:
      "border-slate-700/35 bg-slate-500/15 text-slate-900 dark:border-slate-400/70 dark:text-white dark:[&>svg]:text-slate-100",
    swatchClasses: "bg-slate-500/40 border-slate-700/55",
  },
  {
    id: "cyan",
    label: "Cyan",
    badgeClasses:
      "border-cyan-700/35 bg-cyan-500/15 text-cyan-900 dark:border-cyan-400/70 dark:text-white dark:[&>svg]:text-cyan-100",
    swatchClasses: "bg-cyan-500/40 border-cyan-700/55",
  },
  {
    id: "orange",
    label: "Orange",
    badgeClasses:
      "border-orange-700/35 bg-orange-500/15 text-orange-900 dark:border-orange-400/70 dark:text-white dark:[&>svg]:text-orange-100",
    swatchClasses: "bg-orange-500/40 border-orange-700/55",
  },
];

export const DEFAULT_INTELLIGENCE_QUERY_COLOR: IntelligenceQueryColorId =
  "emerald";

export function getIntelligenceQueryColor(id: string): IntelligenceQueryColorOption {
  return (
    INTELLIGENCE_QUERY_COLORS.find((option) => option.id === id) ??
    INTELLIGENCE_QUERY_COLORS[0]
  );
}

export type IntelligenceQueryIconId =
  | "ticket"
  | "inbox"
  | "filter"
  | "tag"
  | "star"
  | "bookmark"
  | "bug"
  | "folder"
  | "database"
  | "calendar"
  | "user"
  | "list";

type IntelligenceQueryIconOption = {
  id: IntelligenceQueryIconId;
  label: string;
  Icon: LucideIcon;
};

export const INTELLIGENCE_QUERY_ICONS: IntelligenceQueryIconOption[] = [
  { id: "ticket", label: "Ticket", Icon: Ticket },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "filter", label: "Filter", Icon: Filter },
  { id: "tag", label: "Tag", Icon: Tag },
  { id: "star", label: "Star", Icon: Star },
  { id: "bookmark", label: "Bookmark", Icon: Bookmark },
  { id: "bug", label: "Bug", Icon: Bug },
  { id: "folder", label: "Folder", Icon: Folder },
  { id: "database", label: "Database", Icon: Database },
  { id: "calendar", label: "Calendar", Icon: Calendar },
  { id: "user", label: "User", Icon: User },
  { id: "list", label: "List", Icon: ListTodo },
];

export const DEFAULT_INTELLIGENCE_QUERY_ICON: IntelligenceQueryIconId = "ticket";

export function getIntelligenceQueryIcon(id: string): IntelligenceQueryIconOption {
  return (
    INTELLIGENCE_QUERY_ICONS.find((option) => option.id === id) ??
    INTELLIGENCE_QUERY_ICONS[0]
  );
}
