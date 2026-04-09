"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ActionLauncher,
  type ActionLauncherButtonItem,
  type ActionLauncherItem,
} from "@/src/components/shortcuts/action-launcher";
import {
  KeyboardShortcutsContext,
  type KeyboardShortcutsContextValue,
  type ShortcutCommand,
  type ShortcutRegistration,
  type ShortcutRegistryEntry,
} from "@/src/components/shortcuts/shortcut-registry-context";
import {
  getGlobalSettingsSnapshot,
  listenWorkspaceChange,
  listenWorkspaceReady,
  subscribeToGlobalSettings,
  workspaceGetActive,
  type WorkspaceRow,
} from "@/src/lib/ipc";
import {
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
  normalizeShortcutKey,
} from "@/src/lib/shortcuts";
const LEADER_SEQUENCE_TIMEOUT_MS = 1400;

function buildGlobalWorktreeDetailActionables(
  rows: WorkspaceRow[],
  navigate: (path: string) => void,
): ActionLauncherItem[] {
  return rows
    .filter((row) => row.status !== "deleted")
    .map((row) => ({
      id: `global.worktree-details.${row.worktree}`,
      type: "button",
      label: row.worktree,
      description: row.branchGuess,
      run: () => {
        navigate(`/worktrees/${encodeURIComponent(row.worktree)}`);
      },
    }));
}

function normalizeKeyboardEventKey(key: string): string | null {
  if (key === " ") {
    return "Space";
  }

  const normalized = key.trim().toLowerCase();
  if (/^[a-z0-9]$/.test(normalized)) {
    return normalized;
  }

  if (normalized === "space") {
    return "Space";
  }

  return null;
}

function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function getGlobalSettingsSnapshotForShortcuts() {
  return getGlobalSettingsSnapshot();
}

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const globalSettings = useSyncExternalStore(
    subscribeToGlobalSettings,
    getGlobalSettingsSnapshotForShortcuts,
    getGlobalSettingsSnapshotForShortcuts,
  );
  const [registry, setRegistry] = useState<
    Record<string, ShortcutRegistryEntry>
  >({});
  const [isActionLauncherOpen, setIsActionLauncherOpen] = useState(false);
  const [launcherMode, setLauncherMode] = useState<
    "actions" | "worktree-details"
  >("actions");
  const [
    dashboardWorktreeDetailActionables,
    setDashboardWorktreeDetailActionables,
  ] = useState<ActionLauncherItem[]>([]);
  const [
    fallbackWorktreeDetailActionables,
    setFallbackWorktreeDetailActionables,
  ] = useState<ActionLauncherItem[]>([]);
  const awaitingLeaderRef = useRef(false);
  const leaderTimeoutRef = useRef<number | null>(null);

  const register = useCallback(
    (
      registrationId: string,
      pathname: string,
      registration: ShortcutRegistration,
    ) => {
      if (pathname === "/") {
        setDashboardWorktreeDetailActionables(
          registration.worktreeDetailActionables ?? [],
        );
      }

      setRegistry((current) => ({
        ...current,
        [registrationId]: {
          registrationId,
          pathname,
          commands: registration.commands ?? [],
          actionables: registration.actionables ?? [],
          worktreeDetailActionables:
            registration.worktreeDetailActionables ?? [],
        },
      }));
    },
    [],
  );

  const unregister = useCallback((registrationId: string) => {
    setRegistry((current) => {
      if (!(registrationId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[registrationId];
      return next;
    });
  }, []);

  const currentEntries = useMemo(() => {
    return Object.values(registry).filter(
      (entry) => entry.pathname === location.pathname,
    );
  }, [location.pathname, registry]);

  const globalCommands = useMemo<ShortcutCommand[]>(() => {
    return [
      {
        id: OPEN_ACTION_LAUNCHER_COMMAND_ID,
        label: "Open actions",
        description: "Show page and global actions in a top-centered launcher.",
        run: () => {
          setLauncherMode("actions");
          setIsActionLauncherOpen(true);
        },
      },
      {
        id: OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
        label: "Open worktree details",
        description:
          "Show worktree-focused actions in a top-centered launcher.",
        run: () => {
          setLauncherMode("worktree-details");
          setIsActionLauncherOpen(true);
        },
      },
      {
        id: "goDashboard",
        label: "Go to Dashboard",
        description: "Navigate to dashboard.",
        run: () => {
          navigate("/");
        },
      },
      {
        id: "goSettings",
        label: "Go to Settings",
        description: "Open application settings.",
        run: () => {
          navigate("/settings");
        },
      },
    ];
  }, [navigate]);

  const globalCommandsById = useMemo(() => {
    return globalCommands.reduce<Record<string, ShortcutCommand>>(
      (map, command) => {
        map[command.id] = command;
        return map;
      },
      {},
    );
  }, [globalCommands]);

  const runCommand = useCallback(
    (commandId: string) => {
      const pageCommand = currentEntries
        .flatMap((entry) => entry.commands)
        .find((command) => command.id === commandId);
      const fallbackCommand = globalCommandsById[commandId];
      const command = pageCommand ?? fallbackCommand;
      if (!command) {
        return;
      }
      void Promise.resolve(command.run());
    },
    [currentEntries, globalCommandsById],
  );

  const launcherItems = useMemo<ActionLauncherItem[]>(() => {
    const pageActionables = currentEntries.flatMap(
      (entry) => entry.actionables,
    );
    const pageCommands = currentEntries
      .flatMap((entry) => entry.commands)
      .map<ActionLauncherButtonItem>((command) => ({
        id: `page-command:${command.id}`,
        type: "button",
        label: command.label,
        description: command.description,
        run: command.run,
      }));
    const globalActionables = globalCommands
      .filter((command) => command.id !== OPEN_ACTION_LAUNCHER_COMMAND_ID)
      .filter(
        (command) => command.id !== OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
      )
      .map<ActionLauncherButtonItem>((command) => ({
        id: `global-command:${command.id}`,
        type: "button",
        label: command.label,
        description: command.description,
        run: command.run,
      }));

    return [...pageActionables, ...pageCommands, ...globalActionables];
  }, [currentEntries, globalCommands]);

  const worktreeDetailsLauncherItems = useMemo<ActionLauncherItem[]>(() => {
    if (dashboardWorktreeDetailActionables.length > 0) {
      return dashboardWorktreeDetailActionables;
    }

    if (fallbackWorktreeDetailActionables.length > 0) {
      return fallbackWorktreeDetailActionables;
    }

    return currentEntries.flatMap((entry) => entry.worktreeDetailActionables);
  }, [
    currentEntries,
    dashboardWorktreeDetailActionables,
    fallbackWorktreeDetailActionables,
  ]);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const refreshFallbackWorktreeDetailActionables = useCallback(async () => {
    try {
      const workspaceResult = await workspaceGetActive();
      if (!workspaceResult.ok) {
        setFallbackWorktreeDetailActionables((prev) =>
          prev.length === 0 ? prev : [],
        );
        return;
      }

      setFallbackWorktreeDetailActionables(
        buildGlobalWorktreeDetailActionables(
          workspaceResult.rows,
          navigateRef.current,
        ),
      );
    } catch {
      setFallbackWorktreeDetailActionables((prev) =>
        prev.length === 0 ? prev : [],
      );
    }
  }, []);

  useEffect(() => {
    let isClosed = false;
    const unlistenHandlers: Array<() => void> = [];

    const cleanupListeners = (): void => {
      for (const unlisten of unlistenHandlers.splice(0)) {
        try {
          unlisten();
        } catch {
          // Ignore listener cleanup errors during unmount.
        }
      }
    };

    void refreshFallbackWorktreeDetailActionables();

    void (async () => {
      try {
        const [unlistenReady, unlistenChange] = await Promise.all([
          listenWorkspaceReady(() => {
            void refreshFallbackWorktreeDetailActionables();
          }),
          listenWorkspaceChange(() => {
            void refreshFallbackWorktreeDetailActionables();
          }),
        ]);

        if (isClosed) {
          unlistenReady();
          unlistenChange();
          return;
        }

        unlistenHandlers.push(unlistenReady, unlistenChange);
      } catch {
        cleanupListeners();
      }
    })();

    return () => {
      isClosed = true;
      cleanupListeners();
    };
  }, [refreshFallbackWorktreeDetailActionables]);

  useEffect(() => {
    function clearLeaderState(): void {
      awaitingLeaderRef.current = false;
      if (leaderTimeoutRef.current !== null) {
        window.clearTimeout(leaderTimeoutRef.current);
        leaderTimeoutRef.current = null;
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (!document.hasFocus()) {
        clearLeaderState();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        clearLeaderState();
        return;
      }

      const key = normalizeKeyboardEventKey(event.key);
      if (!key) {
        return;
      }

      if (shouldIgnoreShortcutTarget(event.target)) {
        return;
      }

      const leaderKey = normalizeShortcutKey(
        globalSettings.keyboardShortcutLeader,
        "Space",
      );
      const bindings = globalSettings.keyboardLeaderBindings;

      if (awaitingLeaderRef.current) {
        clearLeaderState();
        const commandId = Object.keys(bindings).find(
          (bindingCommandId) => bindings[bindingCommandId] === key,
        );
        if (!commandId) {
          return;
        }
        event.preventDefault();
        runCommand(commandId);
        return;
      }

      if (key === leaderKey) {
        event.preventDefault();
        awaitingLeaderRef.current = true;
        leaderTimeoutRef.current = window.setTimeout(() => {
          clearLeaderState();
        }, LEADER_SEQUENCE_TIMEOUT_MS);
      }
    }

    function onWindowBlur(): void {
      clearLeaderState();
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
      clearLeaderState();
    };
  }, [
    globalSettings.keyboardLeaderBindings,
    globalSettings.keyboardShortcutLeader,
    runCommand,
  ]);

  const contextValue = useMemo<KeyboardShortcutsContextValue>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
      <ActionLauncher
        open={isActionLauncherOpen}
        onOpenChange={setIsActionLauncherOpen}
        title={
          launcherMode === "worktree-details" ? "Worktree details" : "Actions"
        }
        items={
          launcherMode === "worktree-details"
            ? worktreeDetailsLauncherItems
            : launcherItems
        }
      />
    </KeyboardShortcutsContext.Provider>
  );
}
