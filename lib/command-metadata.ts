import type { LucideIcon } from "lucide-react";
import {
  Activity,
  FolderOpen,
  FolderSearch,
  GitBranchPlus,
  ListChecks,
  MonitorPlay,
  MonitorStop,
  Play,
  Settings,
  Square,
  Terminal,
  Trash2,
  Wrench,
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
    icon: Play,
  },
  groove_new: {
    title: "Create Worktree",
    description: "Creates a new worktree from a branch and optional base.",
    icon: GitBranchPlus,
  },
  groove_rm: {
    title: "Cut Groove",
    description: "Removes a worktree and cleans related session state.",
    icon: Trash2,
  },
  groove_stop: {
    title: "Stop Opencode",
    description: "Stops the running Opencode process for a worktree.",
    icon: Square,
  },
  testing_environment_set_target: {
    title: "Set Testing Target",
    description: "Changes the worktree used by the testing environment.",
    icon: ListChecks,
  },
  testing_environment_start: {
    title: "Start Local Testing",
    description: "Starts the local testing environment in the app terminal.",
    icon: MonitorPlay,
  },
  testing_environment_start_separate_terminal: {
    title: "Start Testing (External)",
    description: "Starts local testing in a separate terminal window.",
    icon: MonitorPlay,
  },
  testing_environment_stop: {
    title: "Stop Local Testing",
    description: "Stops the current local testing environment instance.",
    icon: MonitorStop,
  },
  diagnostics_list_opencode_instances: {
    title: "Diagnostics: Opencode Instances",
    description: "Lists running Opencode processes detected by diagnostics.",
    icon: Activity,
  },
  diagnostics_stop_process: {
    title: "Diagnostics: Stop Process",
    description: "Stops one process selected from diagnostics output.",
    icon: Square,
  },
  diagnostics_stop_all_opencode_instances: {
    title: "Diagnostics: Stop All",
    description: "Stops all running Opencode instances for cleanup.",
    icon: Square,
  },
  diagnostics_list_worktree_node_apps: {
    title: "Diagnostics: Node Apps",
    description: "Lists Node.js apps found under workspace worktrees.",
    icon: Activity,
  },
  diagnostics_clean_all_dev_servers: {
    title: "Diagnostics: Clean Dev Servers",
    description: "Stops detected local dev servers across worktrees.",
    icon: Wrench,
  },
  diagnostics_get_msot_consuming_programs: {
    title: "Diagnostics: Heavy Processes",
    description: "Collects the most resource-consuming local processes.",
    icon: Activity,
  },
  workspace_pick_and_open: {
    title: "Open Workspace",
    description: "Opens a workspace selected from the local file picker.",
    icon: FolderSearch,
  },
  workspace_open: {
    title: "Rescan Workspace",
    description: "Refreshes workspace context and current worktree rows.",
    icon: FolderOpen,
  },
  workspace_clear_active: {
    title: "Close Workspace",
    description: "Clears the active workspace from the current session.",
    icon: FolderOpen,
  },
  workspace_update_terminal_settings: {
    title: "Update Terminal Settings",
    description: "Saves default terminal and custom command preferences.",
    icon: Settings,
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
    icon: Terminal,
  };
}
