import { Check, ChevronsUpDown, Play, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import type { SaveState } from "@/src/components/pages/settings/types";
import {
  DEFAULT_PLAY_GROOVE_COMMAND,
  DEFAULT_RUN_LOCAL_COMMAND,
  GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL,
  GROOVE_PLAY_CLAUDE_CODE_COMMAND_SENTINEL,
  GROOVE_PLAY_COMMAND_SENTINEL,
} from "@/src/lib/ipc";

type CommandsSettingsPayload = {
  playGrooveCommand: string;
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

type CommandsSettingsFormProps = {
  playGrooveCommand: string;
  openTerminalAtWorktreeCommand: string;
  runLocalCommand: string;
  section?: "all" | "commands";
  disabled?: boolean;
  disabledMessage?: string;
  onSave: (payload: CommandsSettingsPayload) => Promise<{ ok: boolean; error?: string; payload?: CommandsSettingsPayload }>;
};

const CUSTOM_TEMPLATE_VALUE = "__custom__";

const PLAY_GROOVE_TEMPLATE_COMMANDS = {
  grooveOpencode: GROOVE_PLAY_COMMAND_SENTINEL,
  grooveClaudeCode: GROOVE_PLAY_CLAUDE_CODE_COMMAND_SENTINEL,
  system: DEFAULT_PLAY_GROOVE_COMMAND,
  ghostty: "ghostty --working-directory={worktree} -e opencode",
  warp: "warp --working-directory {worktree} --command opencode",
  kitty: "kitty --directory {worktree} opencode",
  gnome: "gnome-terminal --working-directory={worktree} -- opencode",
  xterm: "xterm -e bash -lc \"cd \\\"{worktree}\\\" && opencode\"",
} as const;

const PLAY_GROOVE_COMMAND_TEMPLATES: Array<{ value: keyof typeof PLAY_GROOVE_TEMPLATE_COMMANDS; label: string }> = [
  { value: "grooveOpencode", label: "Groove: Opencode" },
  { value: "grooveClaudeCode", label: "Groove: Claude Code" },
  { value: "system", label: "System default" },
  { value: "ghostty", label: "Ghostty" },
  { value: "warp", label: "Warp" },
  { value: "kitty", label: "Kitty" },
  { value: "gnome", label: "GNOME Terminal" },
  { value: "xterm", label: "xterm" },
];

const OPEN_TERMINAL_TEMPLATE_COMMANDS = {
  groove: GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL,
  ghostty: "ghostty --working-directory={worktree}",
  warp: "warp --working-directory {worktree}",
  kitty: "kitty --directory {worktree}",
  gnome: "gnome-terminal --working-directory={worktree}",
} as const;

const OPEN_TERMINAL_COMMAND_TEMPLATES: Array<{ value: keyof typeof OPEN_TERMINAL_TEMPLATE_COMMANDS; label: string }> = [
  { value: "groove", label: "Groove" },
  { value: "ghostty", label: "Ghostty" },
  { value: "warp", label: "Warp" },
  { value: "kitty", label: "Kitty" },
  { value: "gnome", label: "GNOME Terminal" },
];

const RUN_LOCAL_TEMPLATE_COMMANDS = {
  pnpm: DEFAULT_RUN_LOCAL_COMMAND,
  npm: "npm run dev",
  bun: "bun run dev",
  yarn: "yarn dev",
  rust: "cargo run",
  deno: "deno task dev",
} as const;

const RUN_LOCAL_COMMAND_TEMPLATES: Array<{ value: keyof typeof RUN_LOCAL_TEMPLATE_COMMANDS; label: string }> = [
  { value: "pnpm", label: "pnpm" },
  { value: "npm", label: "npm" },
  { value: "bun", label: "bun" },
  { value: "yarn", label: "yarn" },
  { value: "rust", label: "Rust (cargo)" },
  { value: "deno", label: "Deno" },
];

type PlayGrooveTemplateValue = (typeof PLAY_GROOVE_COMMAND_TEMPLATES)[number]["value"] | typeof CUSTOM_TEMPLATE_VALUE;
type OpenTerminalTemplateValue = (typeof OPEN_TERMINAL_COMMAND_TEMPLATES)[number]["value"] | typeof CUSTOM_TEMPLATE_VALUE;
type RunLocalTemplateValue = (typeof RUN_LOCAL_COMMAND_TEMPLATES)[number]["value"] | typeof CUSTOM_TEMPLATE_VALUE;

function resolvePlayGrooveTemplateFromCommand(command: string): PlayGrooveTemplateValue {
  const trimmed = command.trim();
  const matchedTemplate = PLAY_GROOVE_COMMAND_TEMPLATES.find(
    (template) => PLAY_GROOVE_TEMPLATE_COMMANDS[template.value] === trimmed,
  );
  if (matchedTemplate) {
    return matchedTemplate.value;
  }

  return CUSTOM_TEMPLATE_VALUE;
}

function resolveOpenTerminalTemplateFromCommand(command: string): OpenTerminalTemplateValue {
  const trimmed = command.trim();
  const matchedTemplate = OPEN_TERMINAL_COMMAND_TEMPLATES.find(
    (template) => OPEN_TERMINAL_TEMPLATE_COMMANDS[template.value] === trimmed,
  );
  if (matchedTemplate) {
    return matchedTemplate.value;
  }

  return CUSTOM_TEMPLATE_VALUE;
}

function resolveRunLocalTemplateFromCommand(command: string): RunLocalTemplateValue {
  const trimmed = command.trim();
  const matchedTemplate = RUN_LOCAL_COMMAND_TEMPLATES.find((template) => RUN_LOCAL_TEMPLATE_COMMANDS[template.value] === trimmed);
  if (matchedTemplate) {
    return matchedTemplate.value;
  }

  return CUSTOM_TEMPLATE_VALUE;
}

function toCommandsSignature(payload: CommandsSettingsPayload): string {
  return JSON.stringify(payload);
}

export function CommandsSettingsForm({
  playGrooveCommand,
  openTerminalAtWorktreeCommand,
  runLocalCommand,
  section = "all",
  disabled = false,
  disabledMessage,
  onSave,
}: CommandsSettingsFormProps) {
  const [playCommandValue, setPlayCommandValue] = useState(playGrooveCommand);
  const [openTerminalAtWorktreeCommandValue, setOpenTerminalAtWorktreeCommandValue] = useState(openTerminalAtWorktreeCommand);
  const [runLocalCommandValue, setRunLocalCommandValue] = useState(runLocalCommand);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedPlayTemplate, setSelectedPlayTemplate] = useState<PlayGrooveTemplateValue>(
    resolvePlayGrooveTemplateFromCommand(playGrooveCommand),
  );
  const [selectedOpenTerminalTemplate, setSelectedOpenTerminalTemplate] = useState<OpenTerminalTemplateValue>(
    resolveOpenTerminalTemplateFromCommand(openTerminalAtWorktreeCommand),
  );
  const [selectedRunLocalTemplate, setSelectedRunLocalTemplate] = useState<RunLocalTemplateValue>(
    resolveRunLocalTemplateFromCommand(runLocalCommand),
  );
  const workspaceScopeVersionRef = useRef(0);
  const saveRequestVersionRef = useRef(0);
  const lastSavedSignatureRef = useRef(
    toCommandsSignature({
      playGrooveCommand: playGrooveCommand.trim(),
      openTerminalAtWorktreeCommand: openTerminalAtWorktreeCommand.trim() || null,
      runLocalCommand: runLocalCommand.trim() || null,
    }),
  );

  useEffect(() => {
    workspaceScopeVersionRef.current += 1;
    saveRequestVersionRef.current = 0;
    setPlayCommandValue(playGrooveCommand);
    setOpenTerminalAtWorktreeCommandValue(openTerminalAtWorktreeCommand);
    setRunLocalCommandValue(runLocalCommand);
    setSelectedPlayTemplate(resolvePlayGrooveTemplateFromCommand(playGrooveCommand));
    setSelectedOpenTerminalTemplate(resolveOpenTerminalTemplateFromCommand(openTerminalAtWorktreeCommand));
    setSelectedRunLocalTemplate(resolveRunLocalTemplateFromCommand(runLocalCommand));
    lastSavedSignatureRef.current = toCommandsSignature({
      playGrooveCommand: playGrooveCommand.trim(),
      openTerminalAtWorktreeCommand: openTerminalAtWorktreeCommand.trim() || null,
      runLocalCommand: runLocalCommand.trim() || null,
    });
    setSaveState("idle");
    setSaveMessage(null);
  }, [openTerminalAtWorktreeCommand, playGrooveCommand, runLocalCommand]);

  const buildPayload = useCallback(
    (): { payload: CommandsSettingsPayload | null; error: string | null; suppressErrorMessage?: boolean } => {
    const trimmedPlayCommand = playCommandValue.trim();
    if (!trimmedPlayCommand) {
      return {
        payload: null,
        error: "Play Groove command is required.",
      };
    }

    return {
      payload: {
        playGrooveCommand: trimmedPlayCommand,
        openTerminalAtWorktreeCommand: openTerminalAtWorktreeCommandValue.trim() || null,
        runLocalCommand: runLocalCommandValue.trim() || null,
      },
      error: null,
    };
    },
    [openTerminalAtWorktreeCommandValue, playCommandValue, runLocalCommandValue],
  );

  const onAutoSave = useCallback(async (): Promise<void> => {
    if (disabled) {
      return;
    }

    const { payload, error, suppressErrorMessage } = buildPayload();
    if (!payload || error) {
      setSaveState("error");
      if (suppressErrorMessage) {
        setSaveMessage(null);
      } else {
        setSaveMessage(error ?? "Failed to save command settings.");
      }
      return;
    }

    const nextSignature = toCommandsSignature(payload);
    if (nextSignature === lastSavedSignatureRef.current) {
      return;
    }

    const requestVersion = ++saveRequestVersionRef.current;
    const workspaceScopeVersion = workspaceScopeVersionRef.current;

    setSaveState("saving");
    setSaveMessage(null);

    const result = await onSave(payload);

    if (workspaceScopeVersion !== workspaceScopeVersionRef.current) {
      return;
    }

    if (requestVersion !== saveRequestVersionRef.current) {
      return;
    }

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.error ?? "Failed to save command settings.");
      return;
    }

    const savedPlayCommand = result.payload?.playGrooveCommand ?? payload.playGrooveCommand;
    const savedOpenTerminalAtWorktreeCommand = result.payload?.openTerminalAtWorktreeCommand ?? "";
    const savedRunLocalCommand = result.payload?.runLocalCommand ?? "";
    setPlayCommandValue(savedPlayCommand);
    setSelectedPlayTemplate(resolvePlayGrooveTemplateFromCommand(savedPlayCommand));
    setOpenTerminalAtWorktreeCommandValue(savedOpenTerminalAtWorktreeCommand);
    setSelectedOpenTerminalTemplate(resolveOpenTerminalTemplateFromCommand(savedOpenTerminalAtWorktreeCommand));
    setRunLocalCommandValue(savedRunLocalCommand);
    setSelectedRunLocalTemplate(resolveRunLocalTemplateFromCommand(savedRunLocalCommand));
    lastSavedSignatureRef.current = toCommandsSignature({
      playGrooveCommand: savedPlayCommand.trim(),
      openTerminalAtWorktreeCommand: savedOpenTerminalAtWorktreeCommand.trim() || null,
      runLocalCommand: savedRunLocalCommand.trim() || null,
    });
    setSaveState("success");
    setSaveMessage(null);
  }, [buildPayload, disabled, onSave]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const debounceHandle = window.setTimeout(() => {
      void onAutoSave();
    }, 450);

    return () => {
      window.clearTimeout(debounceHandle);
    };
  }, [disabled, onAutoSave, openTerminalAtWorktreeCommandValue, playCommandValue, runLocalCommandValue]);

  const selectedPlayTemplateLabel =
    selectedPlayTemplate === CUSTOM_TEMPLATE_VALUE
      ? "Custom command"
      : PLAY_GROOVE_COMMAND_TEMPLATES.find((template) => template.value === selectedPlayTemplate)?.label ?? "Custom command";
  const selectedOpenTerminalTemplateLabel =
    selectedOpenTerminalTemplate === CUSTOM_TEMPLATE_VALUE
      ? "Custom command"
      : OPEN_TERMINAL_COMMAND_TEMPLATES.find((template) => template.value === selectedOpenTerminalTemplate)?.label ??
        "Custom command";
  const selectedRunLocalTemplateLabel =
    selectedRunLocalTemplate === CUSTOM_TEMPLATE_VALUE
      ? "Custom command"
      : RUN_LOCAL_COMMAND_TEMPLATES.find((template) => template.value === selectedRunLocalTemplate)?.label ?? "Custom command";
  const showCommandsSection = section === "all" || section === "commands";

  return (
    <div className={section === "all" ? "space-y-3 rounded-md border px-3 py-3" : "space-y-3"}>
      {section === "all" && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Commands</h2>
        </div>
      )}

      <TooltipProvider>
        {showCommandsSection && (
          <>
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
                        disabled
                        aria-label="Play Groove"
                      >
                        <Play className="size-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Play Groove</TooltipContent>
                </Tooltip>
                <label htmlFor="play-groove-command" className="sr-only">
                  Command
                </label>
                <Input
                  id="play-groove-command"
                  value={playCommandValue}
                  onChange={(event) => {
                    setPlayCommandValue(event.target.value);
                    setSelectedPlayTemplate(resolvePlayGrooveTemplateFromCommand(event.target.value));
                    setSaveState("idle");
                    setSaveMessage(null);
                  }}
                  placeholder={DEFAULT_PLAY_GROOVE_COMMAND}
                  disabled={saveState === "saving" || disabled}
                  className="sm:flex-1"
                />
                <label htmlFor="play-groove-command-template" className="sr-only">
                  Terminal template
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="play-groove-command-template"
                      type="button"
                      variant="outline"
                      className="w-full justify-between bg-transparent px-3 font-normal sm:w-56 dark:border-border/80 dark:bg-muted/35 dark:hover:bg-muted/45"
                      aria-label="Select play groove terminal template"
                      disabled={saveState === "saving" || disabled}
                    >
                      <span>{selectedPlayTemplateLabel}</span>
                      <ChevronsUpDown className="size-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {PLAY_GROOVE_COMMAND_TEMPLATES.map((template) => {
                      const isSelected = template.value === selectedPlayTemplate;

                      return (
                        <DropdownMenuItem
                          key={template.value}
                          onSelect={() => {
                            setPlayCommandValue(PLAY_GROOVE_TEMPLATE_COMMANDS[template.value]);
                            setSelectedPlayTemplate(template.value);
                            setSaveState("idle");
                            setSaveMessage(null);
                          }}
                          className="justify-between"
                        >
                          <span>{template.label}</span>
                          {isSelected && <Check className="size-4" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
                        disabled
                        aria-label="Open terminal at worktree"
                      >
                        <Terminal className="size-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Launch worktree terminal</TooltipContent>
                </Tooltip>
                <label htmlFor="open-terminal-at-worktree-command" className="sr-only">
                  Open terminal command
                </label>
                <Input
                  id="open-terminal-at-worktree-command"
                  value={openTerminalAtWorktreeCommandValue}
                  onChange={(event) => {
                    setOpenTerminalAtWorktreeCommandValue(event.target.value);
                    setSelectedOpenTerminalTemplate(resolveOpenTerminalTemplateFromCommand(event.target.value));
                    setSaveState("idle");
                    setSaveMessage(null);
                  }}
                  placeholder="Leave empty to use automatic terminal detection"
                  disabled={saveState === "saving" || disabled}
                  className="sm:flex-1"
                />
                <label htmlFor="open-terminal-at-worktree-command-template" className="sr-only">
                  Open terminal template
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="open-terminal-at-worktree-command-template"
                      type="button"
                      variant="outline"
                      className="w-full justify-between bg-transparent px-3 font-normal sm:w-56 dark:border-border/80 dark:bg-muted/35 dark:hover:bg-muted/45"
                      aria-label="Select open terminal template"
                      disabled={saveState === "saving" || disabled}
                    >
                      <span>{selectedOpenTerminalTemplateLabel}</span>
                      <ChevronsUpDown className="size-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {OPEN_TERMINAL_COMMAND_TEMPLATES.map((template) => {
                      const isSelected = template.value === selectedOpenTerminalTemplate;

                      return (
                        <DropdownMenuItem
                          key={template.value}
                          onSelect={() => {
                            setOpenTerminalAtWorktreeCommandValue(OPEN_TERMINAL_TEMPLATE_COMMANDS[template.value]);
                            setSelectedOpenTerminalTemplate(template.value);
                            setSaveState("idle");
                            setSaveMessage(null);
                          }}
                          className="justify-between"
                        >
                          <span>{template.label}</span>
                          {isSelected && <Check className="size-4" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
                        disabled
                        aria-label="Run local commands"
                      >
                        <Terminal className="size-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Run local dev command</TooltipContent>
                </Tooltip>
                <label htmlFor="run-local-command" className="sr-only">
                  Run local command
                </label>
                <Input
                  id="run-local-command"
                  value={runLocalCommandValue}
                  onChange={(event) => {
                    setRunLocalCommandValue(event.target.value);
                    setSelectedRunLocalTemplate(resolveRunLocalTemplateFromCommand(event.target.value));
                    setSaveState("idle");
                    setSaveMessage(null);
                  }}
                  placeholder={`Leave empty to use ${DEFAULT_RUN_LOCAL_COMMAND}`}
                  disabled={saveState === "saving" || disabled}
                  className="sm:flex-1"
                />
                <label htmlFor="run-local-command-template" className="sr-only">
                  Run local template
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="run-local-command-template"
                      type="button"
                      variant="outline"
                      className="w-full justify-between bg-transparent px-3 font-normal sm:w-56 dark:border-border/80 dark:bg-muted/35 dark:hover:bg-muted/45"
                      aria-label="Select run local template"
                      disabled={saveState === "saving" || disabled}
                    >
                      <span>{selectedRunLocalTemplateLabel}</span>
                      <ChevronsUpDown className="size-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {RUN_LOCAL_COMMAND_TEMPLATES.map((template) => {
                      const isSelected = template.value === selectedRunLocalTemplate;

                      return (
                        <DropdownMenuItem
                          key={template.value}
                          onSelect={() => {
                            setRunLocalCommandValue(RUN_LOCAL_TEMPLATE_COMMANDS[template.value]);
                            setSelectedRunLocalTemplate(template.value);
                            setSaveState("idle");
                            setSaveMessage(null);
                          }}
                          className="justify-between"
                        >
                          <span>{template.label}</span>
                          {isSelected && <Check className="size-4" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        )}

        <>
          {saveState === "saving" && <span className="mr-2 inline-flex items-center text-sm text-muted-foreground">Saving command settings...</span>}
          {disabled && disabledMessage && <span className="mr-2 inline-flex items-center text-sm text-muted-foreground">{disabledMessage}</span>}
          {saveState === "error" && saveMessage && <span className="mr-2 inline-flex items-center text-sm text-destructive">{saveMessage}</span>}
        </>
      </TooltipProvider>
    </div>
  );
}
