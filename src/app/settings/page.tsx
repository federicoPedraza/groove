"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  FolderOpen,
  Info,
  MoreHorizontal,
  Palette,
  Pencil,
  Play,
  Settings2,
  X,
} from "lucide-react";

import { CommandsSettingsForm } from "@/src/components/pages/settings/commands-settings-form";
import { WorktreeSymlinkPathsModal } from "@/src/components/pages/settings/worktree-symlink-paths-modal";
import { OpencodeIntegrationPanel } from "@/src/components/opencode/opencode-integration-panel";
import { ClaudeCodeIntegrationPanel } from "@/src/components/claudecode/claudecode-integration-panel";
import { GrooveSoundSettingsPanel } from "@/src/components/groove-sound-settings-panel";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
} from "@/src/components/ui/sidebar";
import type {
  SaveState,
  WorkspaceMeta,
} from "@/src/components/pages/settings/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { SearchDropdown } from "@/src/components/ui/search-dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  SoundWaveform,
  type SoundWaveformStatus,
} from "@/src/components/ui/sound-waveform";
import {
  SOFT_GREEN_BUTTON_CLASSES,
  SOFT_RED_BUTTON_CLASSES,
} from "@/src/components/pages/dashboard/constants";
import { THEME_MODE_OPTIONS, type ThemeMode } from "@/src/lib/theme-constants";
import { applyThemeToDom, DARK_THEME_MODES } from "@/src/lib/theme";
import {
  DEFAULT_KEYBOARD_LEADER_BINDINGS,
  DEFAULT_KEYBOARD_SHORTCUT_LEADER,
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
  SHORTCUT_KEY_OPTIONS,
  toShortcutDisplayLabel,
} from "@/src/lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import {
  GROOVE_PLAY_COMMAND_SENTINEL,
  getGlobalSettingsSnapshot,
  getThemeMode,
  globalSettingsGet,
  globalSettingsUpdate,
  soundLibraryImport,
  soundLibraryRemove,
  soundLibraryRename,
  soundLibraryGetPath,
  soundLibraryOpenDirectory,
  isTelemetryEnabled,
  subscribeToGlobalSettings,
  workspaceGetActive,
  workspaceUpdateCommandsSettings,
  workspaceUpdateRootDirectory,
  workspaceUpdateWorktreeSymlinkPaths,
  type WorkspaceCommandSettingsPayload,
  type SoundLibraryEntry,
} from "@/src/lib/ipc";
import { playCustomSound } from "@/src/lib/utils/sound";
import { describeWorkspaceContextError } from "@/src/lib/utils/workspace/context";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";

let settingsGlobalSettingsGetPromise: Promise<
  Awaited<ReturnType<typeof globalSettingsGet>>
> | null = null;
let settingsWorkspaceGetActivePromise: Promise<
  Awaited<ReturnType<typeof workspaceGetActive>>
> | null = null;

function logSettingsTelemetry(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.info(`${UI_TELEMETRY_PREFIX} ${event}`, payload);
}

type SettingsSubpage =
  | "personalization"
  | "workspace"
  | "general"
  | "about";

const SETTINGS_SUBPAGES: {
  id: SettingsSubpage;
  label: string;
  shortLabel: string;
  icon: typeof Palette;
}[] = [
  { id: "general", label: "General", shortLabel: "Gen", icon: Settings2 },
  { id: "workspace", label: "Workspace", shortLabel: "Work", icon: FolderOpen },
  { id: "personalization", label: "Personalization", shortLabel: "Style", icon: Palette },
  { id: "about", label: "About", shortLabel: "Info", icon: Info },
];

function loadSettingsGlobalSettings(): Promise<
  Awaited<ReturnType<typeof globalSettingsGet>>
> {
  if (!settingsGlobalSettingsGetPromise) {
    settingsGlobalSettingsGetPromise = globalSettingsGet().finally(() => {
      settingsGlobalSettingsGetPromise = null;
    });
  }
  return settingsGlobalSettingsGetPromise;
}

function loadSettingsWorkspaceGetActive(): Promise<
  Awaited<ReturnType<typeof workspaceGetActive>>
> {
  if (!settingsWorkspaceGetActivePromise) {
    settingsWorkspaceGetActivePromise = workspaceGetActive().finally(() => {
      settingsWorkspaceGetActivePromise = null;
    });
  }
  return settingsWorkspaceGetActivePromise;
}

function isValidSubpage(value: string | null): value is SettingsSubpage {
  return SETTINGS_SUBPAGES.some((s) => s.id === value);
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialSubpage = searchParams.get("subpage");
  const settingsEnterPerfMsRef = useRef<number>(performance.now());
  const globalSettingsSnapshot = useSyncExternalStore(
    subscribeToGlobalSettings,
    getGlobalSettingsSnapshot,
    getGlobalSettingsSnapshot,
  );
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(
    null,
  );
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    globalSettingsSnapshot.telemetryEnabled,
  );
  const [disableGrooveLoadingSection, setDisableGrooveLoadingSection] =
    useState(globalSettingsSnapshot.disableGrooveLoadingSection);
  const [showFps, setShowFps] = useState(globalSettingsSnapshot.showFps);
  const [alwaysShowDiagnosticsSidebar, setAlwaysShowDiagnosticsSidebar] =
    useState(globalSettingsSnapshot.alwaysShowDiagnosticsSidebar);
  const [periodicRerenderEnabled, setPeriodicRerenderEnabled] = useState(
    globalSettingsSnapshot.periodicRerenderEnabled,
  );
  const [keyboardShortcutLeader, setKeyboardShortcutLeader] = useState(
    globalSettingsSnapshot.keyboardShortcutLeader,
  );
  const [openActionLauncherBinding, setOpenActionLauncherBinding] = useState(
    globalSettingsSnapshot.keyboardLeaderBindings[
      OPEN_ACTION_LAUNCHER_COMMAND_ID
    ] ?? DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID],
  );
  const [openWorktreeDetailsBinding, setOpenWorktreeDetailsBinding] = useState(
    globalSettingsSnapshot.keyboardLeaderBindings[
      OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
    ] ??
      DEFAULT_KEYBOARD_LEADER_BINDINGS[
        OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
      ],
  );
  const [playGrooveCommand, setPlayGrooveCommand] = useState(
    GROOVE_PLAY_COMMAND_SENTINEL,
  );
  const [openTerminalAtWorktreeCommand, setOpenTerminalAtWorktreeCommand] =
    useState("");
  const [runLocalCommand, setRunLocalCommand] = useState("");
  const [worktreeSymlinkPaths, setWorktreeSymlinkPaths] = useState<string[]>(
    [],
  );
  const [rootDirectoryInput, setRootDirectoryInput] = useState("");
  const [isRootDirectorySaving, setIsRootDirectorySaving] = useState(false);
  const [rootDirectoryMessage, setRootDirectoryMessage] = useState<
    string | null
  >(null);
  const [rootDirectoryMessageType, setRootDirectoryMessageType] = useState<
    "success" | "error" | null
  >(null);
  const [isWorktreeSymlinkModalOpen, setIsWorktreeSymlinkModalOpen] =
    useState(false);
  const [isWorktreeSymlinkSaving, setIsWorktreeSymlinkSaving] = useState(false);
  const [worktreeSymlinkMessage, setWorktreeSymlinkMessage] = useState<
    string | null
  >(null);
  const [worktreeSymlinkMessageType, setWorktreeSymlinkMessageType] = useState<
    "success" | "error" | null
  >(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [soundLibrary, setSoundLibrary] = useState<SoundLibraryEntry[]>(
    globalSettingsSnapshot.soundLibrary,
  );
  const [isSoundImporting, setIsSoundImporting] = useState(false);
  const [soundMessage, setSoundMessage] = useState<string | null>(null);
  const [soundMessageType, setSoundMessageType] = useState<
    "success" | "error" | null
  >(null);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [soundFileStatus, setSoundFileStatus] = useState<
    Record<string, SoundWaveformStatus>
  >({});
  const [renamingSoundId, setRenamingSoundId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingSoundId) {
      // Wait a frame for the input to mount after the dropdown closes
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingSoundId]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode());
  const [activeSubpage, setActiveSubpage] = useState<SettingsSubpage>(
    isValidSubpage(initialSubpage) ? initialSubpage : "general",
  );
  const disableGrooveLoadingSectionRequestVersionRef = useRef(0);
  const telemetryEnabledRequestVersionRef = useRef(0);
  const showFpsRequestVersionRef = useRef(0);
  const alwaysShowDiagnosticsSidebarRequestVersionRef = useRef(0);
  const periodicRerenderEnabledRequestVersionRef = useRef(0);
  const keyboardShortcutLeaderRequestVersionRef = useRef(0);
  const keyboardLeaderBindingsRequestVersionRef = useRef(0);
  const themeModeRequestVersionRef = useRef(0);

  useEffect(() => {
    setTelemetryEnabled(globalSettingsSnapshot.telemetryEnabled);
    setDisableGrooveLoadingSection(
      globalSettingsSnapshot.disableGrooveLoadingSection,
    );
    setShowFps(globalSettingsSnapshot.showFps);
    setAlwaysShowDiagnosticsSidebar(
      globalSettingsSnapshot.alwaysShowDiagnosticsSidebar,
    );
    setPeriodicRerenderEnabled(globalSettingsSnapshot.periodicRerenderEnabled);
    setKeyboardShortcutLeader(globalSettingsSnapshot.keyboardShortcutLeader);
    setOpenActionLauncherBinding(
      globalSettingsSnapshot.keyboardLeaderBindings[
        OPEN_ACTION_LAUNCHER_COMMAND_ID
      ] ?? DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID],
    );
    setOpenWorktreeDetailsBinding(
      globalSettingsSnapshot.keyboardLeaderBindings[
        OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
      ] ??
        DEFAULT_KEYBOARD_LEADER_BINDINGS[
          OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
        ],
    );
    setThemeMode(globalSettingsSnapshot.themeMode);
    setSoundLibrary(globalSettingsSnapshot.soundLibrary);
  }, [globalSettingsSnapshot]);

  const onSaveRootDirectory = useCallback(async () => {
    if (!workspaceMeta) {
      setRootDirectoryMessage(
        "Connect a repository before changing the scope directory.",
      );
      setRootDirectoryMessageType("error");
      return;
    }
    setIsRootDirectorySaving(true);
    setRootDirectoryMessage(null);
    setRootDirectoryMessageType(null);
    try {
      const trimmed = rootDirectoryInput.trim();
      const result = await workspaceUpdateRootDirectory({
        rootDirectory: trimmed.length === 0 ? null : trimmed,
      });
      if (!result.ok || !result.workspaceMeta) {
        setRootDirectoryMessage(
          result.error ?? "Failed to update scope directory.",
        );
        setRootDirectoryMessageType("error");
        return;
      }
      setWorkspaceMeta(result.workspaceMeta);
      setRootDirectoryInput(result.workspaceMeta.rootDirectory ?? "");
      setRootDirectoryMessage(
        result.workspaceMeta.rootDirectory
          ? `Scope directory set to "${result.workspaceMeta.rootDirectory}".`
          : "Scope directory cleared.",
      );
      setRootDirectoryMessageType("success");
    } catch {
      setRootDirectoryMessage("Failed to update scope directory.");
      setRootDirectoryMessageType("error");
    } finally {
      setIsRootDirectorySaving(false);
    }
  }, [rootDirectoryInput, workspaceMeta]);

  const onSaveCommandSettings = useCallback(
    async (payload: WorkspaceCommandSettingsPayload) => {
      if (!workspaceMeta) {
        return {
          ok: false,
          error: "Select an active workspace before saving command settings.",
        };
      }

      try {
        const result = await workspaceUpdateCommandsSettings({
          playGrooveCommand: payload.playGrooveCommand,
          openTerminalAtWorktreeCommand:
            payload.openTerminalAtWorktreeCommand ?? null,
          runLocalCommand: payload.runLocalCommand ?? null,
        });

        if (!result.ok || !result.workspaceMeta) {
          return {
            ok: false,
            error: result.error ?? "Failed to save command settings.",
          };
        }

        const savedPlayGrooveCommand =
          result.workspaceMeta.playGrooveCommand ??
          GROOVE_PLAY_COMMAND_SENTINEL;
        const savedOpenTerminalAtWorktreeCommand =
          result.workspaceMeta.openTerminalAtWorktreeCommand ?? "";
        const savedRunLocalCommand = result.workspaceMeta.runLocalCommand ?? "";

        setWorkspaceMeta(result.workspaceMeta);
        setPlayGrooveCommand(savedPlayGrooveCommand);
        setOpenTerminalAtWorktreeCommand(savedOpenTerminalAtWorktreeCommand);
        setRunLocalCommand(savedRunLocalCommand);
        setWorktreeSymlinkPaths(
          result.workspaceMeta.worktreeSymlinkPaths ?? [],
        );
        return {
          ok: true,
          payload: {
            playGrooveCommand: savedPlayGrooveCommand,
            openTerminalAtWorktreeCommand: savedOpenTerminalAtWorktreeCommand,
            runLocalCommand: savedRunLocalCommand,
          },
        };
      } catch {
        return {
          ok: false,
          error: "Failed to save command settings.",
        };
      }
    },
    [workspaceMeta],
  );

  useEffect(() => {
    void (async () => {
      try {
        await loadSettingsGlobalSettings();
      } catch {
        setErrorMessage(
          (current) => current ?? "Failed to load global settings.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    const mountDurationMs = Math.max(
      0,
      performance.now() - settingsEnterPerfMsRef.current,
    );
    logSettingsTelemetry("settings.enter.mount", {
      duration_ms: Number(mountDurationMs.toFixed(2)),
    });

    let rafFrameId = 0;
    let rafNestedFrameId = 0;
    rafFrameId = requestAnimationFrame(() => {
      rafNestedFrameId = requestAnimationFrame(() => {
        const afterPaintDurationMs = Math.max(
          0,
          performance.now() - settingsEnterPerfMsRef.current,
        );
        logSettingsTelemetry("settings.enter.after_paint", {
          duration_ms: Number(afterPaintDurationMs.toFixed(2)),
        });
      });
    });

    return () => {
      cancelAnimationFrame(rafFrameId);
      cancelAnimationFrame(rafNestedFrameId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const startedAtMs = performance.now();
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await loadSettingsWorkspaceGetActive();
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setErrorMessage(
            describeWorkspaceContextError(
              result,
              "Failed to load the active workspace context.",
            ),
          );
          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "error",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
          return;
        }

        if (!result.workspaceMeta) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(GROOVE_PLAY_COMMAND_SENTINEL);
          setOpenTerminalAtWorktreeCommand("");
          setRunLocalCommand("");
          setWorktreeSymlinkPaths([]);
          setRootDirectoryInput("");
          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "ok",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
          return;
        }

        setWorkspaceMeta(result.workspaceMeta);
        setWorkspaceRoot(result.workspaceRoot ?? null);
        setPlayGrooveCommand(
          result.workspaceMeta.playGrooveCommand ??
            GROOVE_PLAY_COMMAND_SENTINEL,
        );
        setOpenTerminalAtWorktreeCommand(
          result.workspaceMeta.openTerminalAtWorktreeCommand ?? "",
        );
        setRunLocalCommand(result.workspaceMeta.runLocalCommand ?? "");
        setWorktreeSymlinkPaths(
          result.workspaceMeta.worktreeSymlinkPaths ?? [],
        );
        setRootDirectoryInput(result.workspaceMeta.rootDirectory ?? "");
        setSaveState("idle");

        const durationMs = Math.max(0, performance.now() - startedAtMs);
        logSettingsTelemetry("workspace_get_active.settings", {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "ok",
          has_workspace_meta: true,
          has_workspace_root: result.workspaceRoot != null,
        });
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(GROOVE_PLAY_COMMAND_SENTINEL);
          setOpenTerminalAtWorktreeCommand("");
          setRunLocalCommand("");
          setWorktreeSymlinkPaths([]);
          setErrorMessage("Failed to load the active workspace context.");

          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "error",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onApplyWorktreeSymlinkPaths = useCallback(
    async (paths: string[]) => {
      if (!workspaceMeta) {
        setWorktreeSymlinkMessageType("error");
        setWorktreeSymlinkMessage(
          "Connect a repository before editing worktree symlink paths.",
        );
        return;
      }

      setIsWorktreeSymlinkSaving(true);
      setWorktreeSymlinkMessage(null);
      setWorktreeSymlinkMessageType(null);

      try {
        const response = await workspaceUpdateWorktreeSymlinkPaths({
          worktreeSymlinkPaths: paths,
        });
        if (!response.ok || !response.workspaceMeta) {
          setWorktreeSymlinkMessageType("error");
          setWorktreeSymlinkMessage(
            response.error ?? "Failed to save worktree symlink paths.",
          );
          return;
        }

        setWorkspaceMeta(response.workspaceMeta);
        setWorktreeSymlinkPaths(
          response.workspaceMeta.worktreeSymlinkPaths ?? [],
        );
        setIsWorktreeSymlinkModalOpen(false);
        setWorktreeSymlinkMessageType("success");
        setWorktreeSymlinkMessage("Worktree symlink paths updated.");
      } catch {
        setWorktreeSymlinkMessageType("error");
        setWorktreeSymlinkMessage("Failed to save worktree symlink paths.");
      } finally {
        setIsWorktreeSymlinkSaving(false);
      }
    },
    [workspaceMeta],
  );

  const onThemeModeChange = (nextTheme: ThemeMode): void => {
    const previousThemeMode = themeMode;
    setThemeMode(nextTheme);
    applyThemeToDom(nextTheme);
    setErrorMessage(null);

    const requestVersion = ++themeModeRequestVersionRef.current;

    void (async () => {
      try {
        const result = await globalSettingsUpdate({ themeMode: nextTheme });
        if (requestVersion !== themeModeRequestVersionRef.current) {
          return;
        }

        if (!result.ok || !result.globalSettings) {
          setThemeMode(previousThemeMode);
          applyThemeToDom(previousThemeMode);
          setErrorMessage(result.error ?? "Failed to update theme mode.");
          return;
        }

        setThemeMode(result.globalSettings.themeMode);
        applyThemeToDom(result.globalSettings.themeMode);
      } catch {
        if (requestVersion !== themeModeRequestVersionRef.current) {
          return;
        }
        setThemeMode(previousThemeMode);
        applyThemeToDom(previousThemeMode);
        setErrorMessage("Failed to update theme mode.");
      }
    })();
  };

  const onKeyboardLeaderChange = (nextLeader: string): void => {
    const normalizedLeader = nextLeader || DEFAULT_KEYBOARD_SHORTCUT_LEADER;
    const previousLeader = keyboardShortcutLeader;
    setKeyboardShortcutLeader(normalizedLeader);
    setErrorMessage(null);

    const requestVersion = ++keyboardShortcutLeaderRequestVersionRef.current;

    void (async () => {
      try {
        const result = await globalSettingsUpdate({
          keyboardShortcutLeader: normalizedLeader,
        });

        if (
          requestVersion !== keyboardShortcutLeaderRequestVersionRef.current
        ) {
          return;
        }

        if (!result.ok || !result.globalSettings) {
          setKeyboardShortcutLeader(previousLeader);
          setErrorMessage(
            result.error ?? "Failed to update keyboard shortcut leader key.",
          );
          return;
        }

        setKeyboardShortcutLeader(result.globalSettings.keyboardShortcutLeader);
      } catch {
        if (
          requestVersion !== keyboardShortcutLeaderRequestVersionRef.current
        ) {
          return;
        }

        setKeyboardShortcutLeader(previousLeader);
        setErrorMessage("Failed to update keyboard shortcut leader key.");
      }
    })();
  };

  const onActionLauncherBindingChange = (nextBinding: string): void => {
    const normalizedBinding =
      nextBinding ||
      DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID];
    const previousBinding = openActionLauncherBinding;
    const previousWorktreeDetailsBinding = openWorktreeDetailsBinding;
    setOpenActionLauncherBinding(normalizedBinding);
    setErrorMessage(null);

    const requestVersion = ++keyboardLeaderBindingsRequestVersionRef.current;

    void (async () => {
      try {
        const result = await globalSettingsUpdate({
          keyboardLeaderBindings: {
            [OPEN_ACTION_LAUNCHER_COMMAND_ID]: normalizedBinding,
            [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]:
              previousWorktreeDetailsBinding,
          },
        });

        if (
          requestVersion !== keyboardLeaderBindingsRequestVersionRef.current
        ) {
          return;
        }

        if (!result.ok || !result.globalSettings) {
          setOpenActionLauncherBinding(previousBinding);
          setErrorMessage(
            result.error ?? "Failed to update open actions shortcut.",
          );
          return;
        }

        setOpenActionLauncherBinding(
          result.globalSettings.keyboardLeaderBindings[
            OPEN_ACTION_LAUNCHER_COMMAND_ID
          ] ??
            DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID],
        );
        setOpenWorktreeDetailsBinding(
          result.globalSettings.keyboardLeaderBindings[
            OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
          ] ??
            DEFAULT_KEYBOARD_LEADER_BINDINGS[
              OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
            ],
        );
      } catch {
        if (
          requestVersion !== keyboardLeaderBindingsRequestVersionRef.current
        ) {
          return;
        }

        setOpenActionLauncherBinding(previousBinding);
        setErrorMessage("Failed to update open actions shortcut.");
      }
    })();
  };

  const onWorktreeDetailsBindingChange = (nextBinding: string): void => {
    const normalizedBinding =
      nextBinding ||
      DEFAULT_KEYBOARD_LEADER_BINDINGS[
        OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
      ];
    const previousBinding = openWorktreeDetailsBinding;
    const previousActionLauncherBinding = openActionLauncherBinding;
    setOpenWorktreeDetailsBinding(normalizedBinding);
    setErrorMessage(null);

    const requestVersion = ++keyboardLeaderBindingsRequestVersionRef.current;

    void (async () => {
      try {
        const result = await globalSettingsUpdate({
          keyboardLeaderBindings: {
            [OPEN_ACTION_LAUNCHER_COMMAND_ID]: previousActionLauncherBinding,
            [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]: normalizedBinding,
          },
        });

        if (
          requestVersion !== keyboardLeaderBindingsRequestVersionRef.current
        ) {
          return;
        }

        if (!result.ok || !result.globalSettings) {
          setOpenWorktreeDetailsBinding(previousBinding);
          setErrorMessage(
            result.error ?? "Failed to update worktree details shortcut.",
          );
          return;
        }

        setOpenActionLauncherBinding(
          result.globalSettings.keyboardLeaderBindings[
            OPEN_ACTION_LAUNCHER_COMMAND_ID
          ] ??
            DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID],
        );
        setOpenWorktreeDetailsBinding(
          result.globalSettings.keyboardLeaderBindings[
            OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
          ] ??
            DEFAULT_KEYBOARD_LEADER_BINDINGS[
              OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
            ],
        );
      } catch {
        if (
          requestVersion !== keyboardLeaderBindingsRequestVersionRef.current
        ) {
          return;
        }

        setOpenWorktreeDetailsBinding(previousBinding);
        setErrorMessage("Failed to update worktree details shortcut.");
      }
    })();
  };

  const shortcutKeyOptions = SHORTCUT_KEY_OPTIONS.map((option) => ({
    value: option,
    label: toShortcutDisplayLabel(option),
  }));

  const settingsPageSidebar = useCallback(
    ({ collapsed }: { collapsed: boolean }) => (
      <Sidebar collapsed={collapsed}>
        <SidebarHeader>
          {collapsed ? (
            <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nav
            </h2>
          ) : (
            <h2 className="text-sm font-semibold">Settings</h2>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {SETTINGS_SUBPAGES.map((subpage) => (
              <SidebarMenuButton
                key={subpage.id}
                isActive={activeSubpage === subpage.id}
                collapsed={collapsed}
                onClick={() => setActiveSubpage(subpage.id)}
              >
                <subpage.icon aria-hidden="true" className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{subpage.label}</span>}
              </SidebarMenuButton>
            ))}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    ),
    [activeSubpage],
  );

  useAppLayout({
    pageSidebar: settingsPageSidebar,
  });

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            {SETTINGS_SUBPAGES.find((s) => s.id === activeSubpage)?.label ?? "Settings"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeSubpage === "general" && "Toggles, keyboard shortcuts, and integrations for Groove."}
            {activeSubpage === "workspace" && "Configure commands and paths for the active workspace."}
            {activeSubpage === "personalization" && "Customize the look, feel, and sounds of Groove."}
            {activeSubpage === "about" && "Information about Groove."}
          </p>
        </div>

        {isLoading && activeSubpage === "workspace" && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Loading active workspace...
          </p>
        )}

        {activeSubpage === "workspace" && (
        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle workspace settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Workspace settings</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">
                    Scope directory
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Optional path (relative to the workspace root) where Groove
                    should create and look for <code>.worktrees/</code>. Leave
                    blank to operate at the workspace root. Useful when you
                    open a monorepo root in Groove but want to scope worktrees
                    to a sub-app like <code>apps/next</code>.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={rootDirectoryInput}
                      onChange={(event) =>
                        setRootDirectoryInput(event.target.value)
                      }
                      placeholder="apps/next"
                      disabled={!workspaceMeta || isRootDirectorySaving}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        void onSaveRootDirectory();
                      }}
                      disabled={!workspaceMeta || isRootDirectorySaving}
                    >
                      {isRootDirectorySaving ? "Saving..." : "Save"}
                    </Button>
                    {workspaceMeta?.rootDirectory && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRootDirectoryInput("");
                          void onSaveRootDirectory();
                        }}
                        disabled={isRootDirectorySaving}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {!workspaceMeta && (
                    <p className="text-xs text-muted-foreground">
                      Connect a repository to configure the scope directory.
                    </p>
                  )}
                  {rootDirectoryMessage &&
                    rootDirectoryMessageType === "success" && (
                      <p className="text-xs text-green-800">
                        {rootDirectoryMessage}
                      </p>
                    )}
                  {rootDirectoryMessage &&
                    rootDirectoryMessageType === "error" && (
                      <p className="text-xs text-destructive">
                        {rootDirectoryMessage}
                      </p>
                    )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">
                    Commands
                  </h3>
                  <CommandsSettingsForm
                    playGrooveCommand={playGrooveCommand}
                    openTerminalAtWorktreeCommand={
                      openTerminalAtWorktreeCommand
                    }
                    runLocalCommand={runLocalCommand}
                    section="commands"
                    disabled={!workspaceMeta}
                    disabledMessage={
                      !workspaceMeta
                        ? "Connect a repository to edit workspace command settings."
                        : undefined
                    }
                    onSave={onSaveCommandSettings}
                  />
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      Worktree symlinked paths
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!workspaceMeta || isWorktreeSymlinkSaving}
                      onClick={() => {
                        setWorktreeSymlinkMessage(null);
                        setWorktreeSymlinkMessageType(null);
                        setIsWorktreeSymlinkModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Groove symlinks these paths into worktrees when they exist
                    in the repository root.
                  </p>

                  <ul className="space-y-1 text-sm text-foreground">
                    {worktreeSymlinkPaths.map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                    {worktreeSymlinkPaths.length === 0 && (
                      <li className="text-muted-foreground">
                        No configured paths.
                      </li>
                    )}
                  </ul>

                  {!workspaceMeta && (
                    <p className="text-xs text-muted-foreground">
                      Connect a repository to edit this list.
                    </p>
                  )}
                  {worktreeSymlinkMessage &&
                    worktreeSymlinkMessageType === "success" && (
                      <p className="text-xs text-green-800">
                        {worktreeSymlinkMessage}
                      </p>
                    )}
                  {worktreeSymlinkMessage &&
                    worktreeSymlinkMessageType === "error" && (
                      <p className="text-xs text-destructive">
                        {worktreeSymlinkMessage}
                      </p>
                    )}
                </section>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        )}

        {activeSubpage === "personalization" && (
        <>
        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle sounds settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Sounds</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <GrooveSoundSettingsPanel
                  grooveSoundSettings={
                    globalSettingsSnapshot.grooveSoundSettings
                  }
                  soundLibrary={soundLibrary}
                  onSoundLibraryChanged={setSoundLibrary}
                />

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      Sound library
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSoundImporting}
                      onClick={() => {
                        setIsSoundImporting(true);
                        setSoundMessage(null);
                        setSoundMessageType(null);

                        void (async () => {
                          try {
                            const result = await soundLibraryImport();
                            if (!result.ok || !result.globalSettings) {
                              setSoundMessageType("error");
                              setSoundMessage(
                                result.error ?? "Failed to import sound.",
                              );
                              return;
                            }
                            setSoundLibrary(result.globalSettings.soundLibrary);
                            if (result.error) {
                              setSoundMessageType("error");
                              setSoundMessage(result.error);
                            }
                          } catch {
                            setSoundMessageType("error");
                            setSoundMessage("Failed to import sound.");
                          } finally {
                            setIsSoundImporting(false);
                          }
                        })();
                      }}
                    >
                      {isSoundImporting ? "Importing..." : "Import sound"}
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Import audio files (mp3, wav, ogg, flac, m4a, aac, webm) to
                    use as notification sounds.
                  </p>

                  {soundLibrary.length === 0 && (
                    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      No sounds imported yet. Import a sound file to get
                      started.
                    </p>
                  )}

                  {soundLibrary.length > 0 && (
                    <TooltipProvider>
                      <div className="rounded-lg border bg-card">
                        <Table>
                          <TableBody>
                            {soundLibrary.map((sound) => (
                              <TableRow key={sound.id}>
                                <TableCell className="w-[35%]">
                                  <div className="flex items-center gap-2 px-2 py-1">
                                    {renamingSoundId === sound.id ? (
                                      <form
                                        className="flex min-w-0 flex-1 items-center gap-1"
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          const trimmed = renameValue.trim();
                                          if (!trimmed) return;
                                          setRenamingSoundId(null);
                                          void (async () => {
                                            try {
                                              const result =
                                                await soundLibraryRename(
                                                  sound.id,
                                                  trimmed,
                                                );
                                              if (
                                                result.ok &&
                                                result.globalSettings
                                              ) {
                                                setSoundLibrary(
                                                  result.globalSettings
                                                    .soundLibrary,
                                                );
                                              }
                                            } catch {
                                              setSoundMessageType("error");
                                              setSoundMessage(
                                                "Failed to rename sound.",
                                              );
                                            }
                                          })();
                                        }}
                                      >
                                        <Input
                                          ref={renameInputRef}
                                          className="h-7 min-w-0 flex-1 text-sm"
                                          value={renameValue}
                                          onChange={(e) =>
                                            setRenameValue(e.target.value)
                                          }
                                          onBlur={() =>
                                            setRenamingSoundId(null)
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Escape") {
                                              setRenamingSoundId(null);
                                            }
                                          }}
                                        />
                                        <Button
                                          type="submit"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                        >
                                          <Check className="size-3.5" />
                                        </Button>
                                      </form>
                                    ) : (
                                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                                        {sound.name}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <SoundWaveform
                                    fileName={sound.fileName}
                                    isPlaying={playingSoundId === sound.id}
                                    barCount={60}
                                    className="h-5 flex-1"
                                    onStatusChange={(status) =>
                                      setSoundFileStatus((prev) => ({
                                        ...prev,
                                        [sound.id]: status,
                                      }))
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  {(() => {
                                    const status = soundFileStatus[sound.id];
                                    const isSoundError = status === "error";
                                    const isSoundLoading = status === "loading";
                                    const isPlayDisabled =
                                      isSoundError || isSoundLoading;
                                    const playTooltip = isSoundError
                                      ? "Sound file unavailable or corrupt"
                                      : isSoundLoading
                                        ? "Loading sound…"
                                        : "Play sound";

                                    return (
                                  <div className="flex items-center justify-end gap-1">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          aria-label={`More actions for ${sound.name}`}
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            void soundLibraryOpenDirectory();
                                          }}
                                        >
                                          <FolderOpen className="mr-2 size-4" />
                                          Open directory
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            void soundLibraryGetPath(
                                              sound.id,
                                            ).then((res) => {
                                              if (res.ok && res.folderPath) {
                                                void navigator.clipboard.writeText(
                                                  res.folderPath,
                                                );
                                              }
                                            });
                                          }}
                                        >
                                          <Copy className="mr-2 size-4" />
                                          Copy path
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            void soundLibraryGetPath(
                                              sound.id,
                                            ).then((res) => {
                                              if (res.ok && res.filePath) {
                                                void navigator.clipboard.writeText(
                                                  res.filePath,
                                                );
                                              }
                                            });
                                          }}
                                        >
                                          <FileText className="mr-2 size-4" />
                                          Copy file path
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            setRenameValue(sound.name);
                                            setRenamingSoundId(sound.id);
                                          }}
                                        >
                                          <Pencil className="mr-2 size-4" />
                                          Rename
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={isPlayDisabled}
                                          className={`h-8 w-8 p-0 ${isPlayDisabled ? "" : SOFT_GREEN_BUTTON_CLASSES}`}
                                          aria-label={`Play ${sound.name}`}
                                          onClick={() => {
                                            setPlayingSoundId(sound.id);
                                            void playCustomSound(
                                              sound.fileName,
                                            ).then((result) => {
                                              const ms = result.played
                                                ? Math.max(
                                                    300,
                                                    result.duration * 1000,
                                                  )
                                                : 300;
                                              setTimeout(() => {
                                                setPlayingSoundId((current) =>
                                                  current === sound.id
                                                    ? null
                                                    : current,
                                                );
                                              }, ms);
                                            });
                                          }}
                                        >
                                          <Play
                                            aria-hidden="true"
                                            className="size-4"
                                          />
                                        </Button>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {playTooltip}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                                          aria-label={`Remove ${sound.name}`}
                                          onClick={() => {
                                            void (async () => {
                                              try {
                                                const result =
                                                  await soundLibraryRemove(
                                                    sound.id,
                                                  );
                                                if (
                                                  !result.ok ||
                                                  !result.globalSettings
                                                ) {
                                                  setSoundMessageType("error");
                                                  setSoundMessage(
                                                    result.error ??
                                                      "Failed to remove sound.",
                                                  );
                                                  return;
                                                }
                                                setSoundLibrary(
                                                  result.globalSettings
                                                    .soundLibrary,
                                                );
                                              } catch {
                                                setSoundMessageType("error");
                                                setSoundMessage(
                                                  "Failed to remove sound.",
                                                );
                                              }
                                            })();
                                          }}
                                        >
                                          <X
                                            aria-hidden="true"
                                            className="size-4"
                                          />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Remove sound
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                    );
                                  })()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TooltipProvider>
                  )}

                  {soundMessage && soundMessageType === "error" && (
                    <p className="text-xs text-destructive">{soundMessage}</p>
                  )}
                </section>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle appearance settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Appearance</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Applies across pages and workspaces and is saved on this
                  device.
                </p>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {THEME_MODE_OPTIONS.map((option) => {
                    const isSelected = themeMode === option.value;
                    const isDark = DARK_THEME_MODES.has(option.value);

                    return (
                      <label
                        key={option.value}
                        data-theme={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm transition-colors hover:border-border/80 ${isDark ? "dark" : ""}`}
                      >
                        <input
                          type="radio"
                          name="theme-mode"
                          value={option.value}
                          checked={isSelected}
                          onChange={() => {
                            onThemeModeChange(option.value);
                          }}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60 transition-colors peer-checked:border-foreground peer-checked:bg-foreground/10 peer-checked:[&>span]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                        >
                          <span className="size-2 rounded-full bg-foreground opacity-0 transition-opacity" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <span className="block font-medium text-foreground">
                              {option.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                Primary
                              </span>
                              <span className="inline-flex h-6 items-center rounded-md bg-secondary px-2 text-[11px] font-medium text-secondary-foreground">
                                Chip
                              </span>
                            </div>

                            <div className="rounded-md border border-input bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                              Search branches...
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        </>
        )}

        {activeSubpage === "general" && (
        <>
        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle keyboard shortcuts settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Keyboard shortcuts</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 text-sm text-foreground">
                <p className="text-xs text-muted-foreground">
                  Customize leader-based shortcuts. Open actions defaults to{" "}
                  <code>&lt;leader&gt; + k</code> and Open worktree details
                  defaults to <code>&lt;leader&gt; + p</code>.
                </p>

                <div className="mt-3 space-y-2">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3">
                    <p className="text-xs text-muted-foreground">Leader key</p>
                    <div className="w-full md:w-56">
                      <SearchDropdown
                        ariaLabel="Keyboard shortcut leader key"
                        searchAriaLabel="Search keyboard shortcut leader keys"
                        options={shortcutKeyOptions}
                        value={keyboardShortcutLeader}
                        placeholder={toShortcutDisplayLabel(
                          DEFAULT_KEYBOARD_SHORTCUT_LEADER,
                        )}
                        onValueChange={onKeyboardLeaderChange}
                        disabled={saveState === "saving"}
                        maxResults={5}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3">
                    <p className="text-xs text-muted-foreground">
                      Open actions key
                    </p>
                    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
                      <code className="text-xs text-muted-foreground md:text-right">{`<${toShortcutDisplayLabel(keyboardShortcutLeader)}> + ${toShortcutDisplayLabel(openActionLauncherBinding)}`}</code>
                      <div className="w-full md:w-56">
                        <SearchDropdown
                          ariaLabel="Open actions key"
                          searchAriaLabel="Search open actions keys"
                          options={shortcutKeyOptions.filter(
                            (option) => option.value !== "Space",
                          )}
                          value={openActionLauncherBinding}
                          placeholder={toShortcutDisplayLabel(
                            DEFAULT_KEYBOARD_LEADER_BINDINGS[
                              OPEN_ACTION_LAUNCHER_COMMAND_ID
                            ],
                          )}
                          onValueChange={onActionLauncherBindingChange}
                          disabled={saveState === "saving"}
                          maxResults={5}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-3">
                    <p className="text-xs text-muted-foreground">
                      Open worktree details key
                    </p>
                    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:justify-end">
                      <code className="text-xs text-muted-foreground md:text-right">{`<${toShortcutDisplayLabel(keyboardShortcutLeader)}> + ${toShortcutDisplayLabel(openWorktreeDetailsBinding)}`}</code>
                      <div className="w-full md:w-56">
                        <SearchDropdown
                          ariaLabel="Open worktree details key"
                          searchAriaLabel="Search open worktree details keys"
                          options={shortcutKeyOptions.filter(
                            (option) => option.value !== "Space",
                          )}
                          value={openWorktreeDetailsBinding}
                          placeholder={toShortcutDisplayLabel(
                            DEFAULT_KEYBOARD_LEADER_BINDINGS[
                              OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
                            ],
                          )}
                          onValueChange={onWorktreeDetailsBindingChange}
                          disabled={saveState === "saving"}
                          maxResults={5}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle integrations settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Integrations</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <OpencodeIntegrationPanel
                  title="Opencode"
                  workspaceRoot={workspaceRoot}
                />
                <ClaudeCodeIntegrationPanel />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="gap-0 py-4">
            <CardHeader className="py-3 [&:has([data-state=closed])]:gap-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                  aria-label="Toggle Groove settings"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform duration-200"
                  />
                  <CardTitle className="text-sm">Groove settings</CardTitle>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={telemetryEnabled}
                      disabled={saveState === "saving"}
                      onCheckedChange={(checked) => {
                        const nextTelemetryEnabled = checked === true;
                        const previousTelemetryEnabled = telemetryEnabled;
                        setTelemetryEnabled(nextTelemetryEnabled);
                        setErrorMessage(null);

                        const requestVersion =
                          ++telemetryEnabledRequestVersionRef.current;

                        void (async () => {
                          try {
                            const result = await globalSettingsUpdate({
                              telemetryEnabled: nextTelemetryEnabled,
                            });

                            if (
                              requestVersion !==
                              telemetryEnabledRequestVersionRef.current
                            ) {
                              return;
                            }

                            if (!result.ok || !result.globalSettings) {
                              setTelemetryEnabled(previousTelemetryEnabled);
                              setErrorMessage(
                                result.error ??
                                  "Failed to update telemetry settings.",
                              );
                              return;
                            }

                            setTelemetryEnabled(
                              result.globalSettings.telemetryEnabled,
                            );
                          } catch {
                            if (
                              requestVersion !==
                              telemetryEnabledRequestVersionRef.current
                            ) {
                              return;
                            }
                            setTelemetryEnabled(previousTelemetryEnabled);
                            setErrorMessage(
                              "Failed to update telemetry settings.",
                            );
                          }
                        })();
                      }}
                    />
                    <span>Enable telemetry</span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 sm:text-right">
                    Controls whether Groove records UI telemetry events.
                  </span>
                </label>

                <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={disableGrooveLoadingSection}
                      disabled={saveState === "saving"}
                      onCheckedChange={(checked) => {
                        const nextDisableGrooveLoadingSection =
                          checked === true;
                        const previousDisableGrooveLoadingSection =
                          disableGrooveLoadingSection;
                        setDisableGrooveLoadingSection(
                          nextDisableGrooveLoadingSection,
                        );
                        setErrorMessage(null);

                        const requestVersion =
                          ++disableGrooveLoadingSectionRequestVersionRef.current;

                        void (async () => {
                          try {
                            const result = await globalSettingsUpdate({
                              disableGrooveLoadingSection:
                                nextDisableGrooveLoadingSection,
                            });

                            if (
                              requestVersion !==
                              disableGrooveLoadingSectionRequestVersionRef.current
                            ) {
                              return;
                            }

                            if (!result.ok || !result.globalSettings) {
                              setDisableGrooveLoadingSection(
                                previousDisableGrooveLoadingSection,
                              );
                              setErrorMessage(
                                result.error ??
                                  "Failed to update Groove loading section visibility.",
                              );
                              return;
                            }

                            setDisableGrooveLoadingSection(
                              result.globalSettings.disableGrooveLoadingSection,
                            );
                          } catch {
                            if (
                              requestVersion !==
                              disableGrooveLoadingSectionRequestVersionRef.current
                            ) {
                              return;
                            }
                            setDisableGrooveLoadingSection(
                              previousDisableGrooveLoadingSection,
                            );
                            setErrorMessage(
                              "Failed to update Groove loading section visibility.",
                            );
                          }
                        })();
                      }}
                    />
                    <span>Disable monkey</span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 sm:text-right">
                    Hides the sidebar monkey sprite frame on desktop.
                  </span>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={showFps}
                      disabled={saveState === "saving"}
                      onCheckedChange={(checked) => {
                        const nextShowFps = checked === true;
                        const previousShowFps = showFps;
                        setShowFps(nextShowFps);
                        setErrorMessage(null);

                        const requestVersion =
                          ++showFpsRequestVersionRef.current;

                        void (async () => {
                          try {
                            const result = await globalSettingsUpdate({
                              showFps: nextShowFps,
                            });

                            if (
                              requestVersion !==
                              showFpsRequestVersionRef.current
                            ) {
                              return;
                            }

                            if (!result.ok || !result.globalSettings) {
                              setShowFps(previousShowFps);
                              setErrorMessage(
                                result.error ??
                                  "Failed to update FPS settings.",
                              );
                              return;
                            }

                            setShowFps(result.globalSettings.showFps);
                          } catch {
                            if (
                              requestVersion !==
                              showFpsRequestVersionRef.current
                            ) {
                              return;
                            }
                            setShowFps(previousShowFps);
                            setErrorMessage("Failed to update FPS settings.");
                          }
                        })();
                      }}
                    />
                    <span>Show FPS</span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 sm:text-right">
                    Shows the frames-per-second overlay for UI performance
                    checks.
                  </span>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={periodicRerenderEnabled}
                      disabled={saveState === "saving"}
                      onCheckedChange={(checked) => {
                        const nextValue = checked === true;
                        const previousValue = periodicRerenderEnabled;
                        setPeriodicRerenderEnabled(nextValue);
                        setErrorMessage(null);

                        const requestVersion =
                          ++periodicRerenderEnabledRequestVersionRef.current;

                        void (async () => {
                          try {
                            const result = await globalSettingsUpdate({
                              periodicRerenderEnabled: nextValue,
                            });

                            if (
                              requestVersion !==
                              periodicRerenderEnabledRequestVersionRef.current
                            ) {
                              return;
                            }

                            if (!result.ok || !result.globalSettings) {
                              setPeriodicRerenderEnabled(previousValue);
                              setErrorMessage(
                                result.error ??
                                  "Failed to update periodic re-render trigger settings.",
                              );
                              return;
                            }

                            setPeriodicRerenderEnabled(
                              result.globalSettings.periodicRerenderEnabled,
                            );
                          } catch {
                            if (
                              requestVersion !==
                              periodicRerenderEnabledRequestVersionRef.current
                            ) {
                              return;
                            }
                            setPeriodicRerenderEnabled(previousValue);
                            setErrorMessage(
                              "Failed to update periodic re-render trigger settings.",
                            );
                          }
                        })();
                      }}
                    />
                    <span>Trigger periodic re-renders</span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 sm:text-right">
                    Forces a React re-render every second to stress test UI
                    updates. Disable when you are done testing.
                  </span>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={alwaysShowDiagnosticsSidebar}
                      disabled={saveState === "saving"}
                      onCheckedChange={(checked) => {
                        const nextValue = checked === true;
                        const previousValue = alwaysShowDiagnosticsSidebar;
                        setAlwaysShowDiagnosticsSidebar(nextValue);
                        setErrorMessage(null);

                        const requestVersion =
                          ++alwaysShowDiagnosticsSidebarRequestVersionRef.current;

                        void (async () => {
                          try {
                            const result = await globalSettingsUpdate({
                              alwaysShowDiagnosticsSidebar: nextValue,
                            });

                            if (
                              requestVersion !==
                              alwaysShowDiagnosticsSidebarRequestVersionRef.current
                            ) {
                              return;
                            }

                            if (!result.ok || !result.globalSettings) {
                              setAlwaysShowDiagnosticsSidebar(previousValue);
                              setErrorMessage(
                                result.error ??
                                  "Failed to update diagnostics sidebar visibility.",
                              );
                              return;
                            }

                            setAlwaysShowDiagnosticsSidebar(
                              result.globalSettings
                                .alwaysShowDiagnosticsSidebar,
                            );
                          } catch {
                            if (
                              requestVersion !==
                              alwaysShowDiagnosticsSidebarRequestVersionRef.current
                            ) {
                              return;
                            }
                            setAlwaysShowDiagnosticsSidebar(previousValue);
                            setErrorMessage(
                              "Failed to update diagnostics sidebar visibility.",
                            );
                          }
                        })();
                      }}
                    />
                    <span>Always show diagnostics sidebar</span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 sm:text-right">
                    Keeps the diagnostics sidebar visible in Groove.
                  </span>
                </label>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        </>
        )}

        {activeSubpage === "about" && (
          <Card className="gap-0 py-4">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">About Groove</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Groove is a desktop app for managing Git multi-worktree
                development. It discovers worktrees, launches terminals and
                build commands per worktree, monitors runtime processes, and
                persists workspace settings.
              </p>
            </CardContent>
          </Card>
        )}

        <WorktreeSymlinkPathsModal
          open={isWorktreeSymlinkModalOpen}
          workspaceRoot={workspaceRoot}
          selectedPaths={worktreeSymlinkPaths}
          savePending={isWorktreeSymlinkSaving}
          onApply={onApplyWorktreeSymlinkPaths}
          onOpenChange={(open) => {
            if (!isWorktreeSymlinkSaving) {
              setIsWorktreeSymlinkModalOpen(open);
            }
          }}
        />

        {errorMessage && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </>
  );
}
