import { createContext } from "react";

import type { ActionLauncherItem } from "@/components/shortcuts/action-launcher";

export type ShortcutCommand = {
  id: string;
  label: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type ShortcutRegistration = {
  commands?: ShortcutCommand[];
  actionables?: ActionLauncherItem[];
  worktreeDetailActionables?: ActionLauncherItem[];
};

export type ShortcutRegistryEntry = {
  registrationId: string;
  pathname: string;
  commands: ShortcutCommand[];
  actionables: ActionLauncherItem[];
  worktreeDetailActionables: ActionLauncherItem[];
};

export type KeyboardShortcutsContextValue = {
  register: (registrationId: string, pathname: string, registration: ShortcutRegistration) => void;
  unregister: (registrationId: string) => void;
};

export const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);
