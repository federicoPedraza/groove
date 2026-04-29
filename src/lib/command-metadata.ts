import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Banana,
  Bean,
  Beef,
  Candy,
  Carrot,
  Coffee,
  Cookie,
  Croissant,
  Grape,
  Hamburger,
  IceCreamCone,
  Pizza,
  Sandwich,
} from "lucide-react";

type CommandMetadata = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const COMMAND_METADATA: Record<string, CommandMetadata> = {
  groove_restore: {
    title: "Restore Groove",
    description: "Reopens a worktree session and restores its context.",
    icon: Pizza,
  },
  groove_new: {
    title: "Create Worktree",
    description: "Creates a new worktree from a branch and optional base.",
    icon: Croissant,
  },
  groove_rm: {
    title: "Cut Groove",
    description: "Removes a worktree and cleans related session state.",
    icon: Beef,
  },
  groove_stop: {
    title: "Stop Groove",
    description: "Stops the running process for a worktree.",
    icon: IceCreamCone,
  },
  diagnostics_stop_process: {
    title: "Diagnostics: Stop Process",
    description: "Stops one process selected from diagnostics output.",
    icon: Candy,
  },
  diagnostics_list_worktree_node_apps: {
    title: "Diagnostics: Node Apps",
    description: "Lists Node.js apps found under workspace worktrees.",
    icon: Grape,
  },
  diagnostics_clean_all_dev_servers: {
    title: "Diagnostics: Clean Dev Servers",
    description: "Stops detected local dev servers across worktrees.",
    icon: Carrot,
  },
  diagnostics_get_msot_consuming_programs: {
    title: "Diagnostics: Heavy Processes",
    description: "Collects the most resource-consuming local processes.",
    icon: Hamburger,
  },
  diagnostics_get_system_overview: {
    title: "Diagnostics: System Overview",
    description: "Collects CPU, RAM, disk, and host usage diagnostics.",
    icon: Bean,
  },
  workspace_pick_and_open: {
    title: "Open Workspace",
    description: "Opens a workspace selected from the local file picker.",
    icon: Apple,
  },
  workspace_open: {
    title: "Rescan Workspace",
    description: "Refreshes workspace context and current worktree rows.",
    icon: Banana,
  },
  workspace_clear_active: {
    title: "Close Workspace",
    description: "Clears the active workspace from the current session.",
    icon: Cookie,
  },
  workspace_update_terminal_settings: {
    title: "Update Terminal Settings",
    description: "Saves default terminal and custom command preferences.",
    icon: Coffee,
  },
};

function humanizeCommandId(command: string): string {
  return command
    .split("_")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getCommandMetadata(command: string): CommandMetadata {
  const mapped = COMMAND_METADATA[command];
  if (mapped) {
    return mapped;
  }

  return {
    title: humanizeCommandId(command),
    description: "Runs an application command through the IPC bridge.",
    icon: Sandwich,
  };
}
