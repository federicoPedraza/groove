import { Check, ChevronsUpDown, Loader2, Play, Plus, Terminal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/components/pages/settings/types";
import { DEFAULT_PLAY_GROOVE_COMMAND, DEFAULT_RUN_LOCAL_COMMAND } from "@/src/lib/ipc";

type CommandsSettingsPayload = {
  playGrooveCommand: string;
  testingPorts: number[];
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

type CommandsSettingsFormProps = {
  playGrooveCommand: string;
  testingPorts: number[];
  openTerminalAtWorktreeCommand: string;
  runLocalCommand: string;
  disabled?: boolean;
  disabledMessage?: string;
  onSave: (payload: CommandsSettingsPayload) => Promise<{ ok: boolean; error?: string; payload?: CommandsSettingsPayload }>;
};

const CUSTOM_TEMPLATE_VALUE = "__custom__";

const PLAY_GROOVE_TEMPLATE_COMMANDS = {
  ghostty: DEFAULT_PLAY_GROOVE_COMMAND,
  warp: "warp --working-directory {worktree} --command opencode",
  kitty: "kitty --directory {worktree} opencode",
  gnome: "gnome-terminal --working-directory={worktree} -- opencode",
  xterm: "xterm -e bash -lc \"cd \\\"{worktree}\\\" && opencode\"",
} as const;

const PLAY_GROOVE_COMMAND_TEMPLATES: Array<{ value: keyof typeof PLAY_GROOVE_TEMPLATE_COMMANDS; label: string }> = [
  { value: "ghostty", label: "Ghostty" },
  { value: "warp", label: "Warp" },
  { value: "kitty", label: "Kitty" },
  { value: "gnome", label: "GNOME Terminal" },
  { value: "xterm", label: "xterm" },
];

const OPEN_TERMINAL_TEMPLATE_COMMANDS = {
  ghostty: "ghostty --working-directory={worktree}",
  warp: "warp --working-directory {worktree}",
  kitty: "kitty --directory {worktree}",
  gnome: "gnome-terminal --working-directory={worktree}",
} as const;

const OPEN_TERMINAL_COMMAND_TEMPLATES: Array<{ value: keyof typeof OPEN_TERMINAL_TEMPLATE_COMMANDS; label: string }> = [
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

const DEFAULT_NEW_PORT = 3003;

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

function toPortString(value: number): string {
  return Number.isInteger(value) && value > 0 ? String(value) : "";
}

export function CommandsSettingsForm({
  playGrooveCommand,
  testingPorts,
  openTerminalAtWorktreeCommand,
  runLocalCommand,
  disabled = false,
  disabledMessage,
  onSave,
}: CommandsSettingsFormProps) {
  const [playCommandValue, setPlayCommandValue] = useState(playGrooveCommand);
  const [portValues, setPortValues] = useState<string[]>(testingPorts.length > 0 ? testingPorts.map(toPortString) : [""]);
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

  useEffect(() => {
    setPlayCommandValue(playGrooveCommand);
    setSelectedPlayTemplate(resolvePlayGrooveTemplateFromCommand(playGrooveCommand));
  }, [playGrooveCommand]);

  useEffect(() => {
    setPortValues(testingPorts.length > 0 ? testingPorts.map(toPortString) : [""]);
  }, [testingPorts]);

  useEffect(() => {
    setOpenTerminalAtWorktreeCommandValue(openTerminalAtWorktreeCommand);
    setSelectedOpenTerminalTemplate(resolveOpenTerminalTemplateFromCommand(openTerminalAtWorktreeCommand));
  }, [openTerminalAtWorktreeCommand]);

  useEffect(() => {
    setRunLocalCommandValue(runLocalCommand);
    setSelectedRunLocalTemplate(resolveRunLocalTemplateFromCommand(runLocalCommand));
  }, [runLocalCommand]);

  const onSubmit = async (): Promise<void> => {
    if (disabled) {
      return;
    }

    const trimmedPlayCommand = playCommandValue.trim();
    if (!trimmedPlayCommand) {
      setSaveState("error");
      setSaveMessage("Play Groove command is required.");
      return;
    }

    const parsedPorts: number[] = [];
    const seenPorts = new Set<number>();
    for (let index = 0; index < portValues.length; index += 1) {
      const rawValue = portValues[index]?.trim() ?? "";
      if (!rawValue) {
        setSaveState("error");
        setSaveMessage(`Port ${index + 1} is required.`);
        return;
      }

      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setSaveState("error");
        setSaveMessage(`Port ${index + 1} must be an integer from 1 to 65535.`);
        return;
      }
      if (seenPorts.has(parsed)) {
        setSaveState("error");
        setSaveMessage(`Port ${parsed} is duplicated.`);
        return;
      }

      seenPorts.add(parsed);
      parsedPorts.push(parsed);
    }

    setSaveState("saving");
    setSaveMessage(null);

    const result = await onSave({
      playGrooveCommand: trimmedPlayCommand,
      testingPorts: parsedPorts,
      openTerminalAtWorktreeCommand: openTerminalAtWorktreeCommandValue.trim() || null,
      runLocalCommand: runLocalCommandValue.trim() || null,
    });

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.error ?? "Failed to save command settings.");
      return;
    }

    const savedPlayCommand = result.payload?.playGrooveCommand ?? trimmedPlayCommand;
    const savedPorts = result.payload?.testingPorts ?? parsedPorts;
    const savedOpenTerminalAtWorktreeCommand = result.payload?.openTerminalAtWorktreeCommand ?? "";
    const savedRunLocalCommand = result.payload?.runLocalCommand ?? "";
    setPlayCommandValue(savedPlayCommand);
    setSelectedPlayTemplate(resolvePlayGrooveTemplateFromCommand(savedPlayCommand));
    setPortValues(savedPorts.map(toPortString));
    setOpenTerminalAtWorktreeCommandValue(savedOpenTerminalAtWorktreeCommand);
    setSelectedOpenTerminalTemplate(resolveOpenTerminalTemplateFromCommand(savedOpenTerminalAtWorktreeCommand));
    setRunLocalCommandValue(savedRunLocalCommand);
    setSelectedRunLocalTemplate(resolveRunLocalTemplateFromCommand(savedRunLocalCommand));
    setSaveState("success");
    setSaveMessage("Commands settings saved.");
  };

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

  return (
    <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Commands</h2>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
            disabled
            aria-label="Play Groove"
          >
            <Play className="size-4" />
          </Button>
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
        <p className="text-xs text-muted-foreground">
          Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>. If omitted, worktree path is appended as the last argument.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Open terminal</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
            disabled
            aria-label="Open terminal at worktree"
          >
            <Terminal className="size-4" />
          </Button>
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
        <p className="text-xs text-muted-foreground">
          Optional override command. Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>. If empty, uses workspace terminal settings.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Run local commands</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 border-green-700/55 bg-green-500/25 px-0 text-green-800 disabled:opacity-100 dark:border-green-200/75 dark:text-green-100"
            disabled
            aria-label="Run local commands"
          >
            <Terminal className="size-4" />
          </Button>
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
        <p className="text-xs text-muted-foreground">
          Optional override command. Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>. Default command:
          <code> {DEFAULT_RUN_LOCAL_COMMAND}</code>.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Testing ports</p>
        <div className="space-y-2">
          {portValues.map((value, index) => (
            <div key={`testing-port-${index}`} className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                value={value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPortValues((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? nextValue : entry)));
                  setSaveState("idle");
                  setSaveMessage(null);
                }}
                placeholder={`Port ${index + 1}`}
                disabled={saveState === "saving" || disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2"
                disabled={saveState === "saving" || disabled || portValues.length <= 1}
                onClick={() => {
                  setPortValues((previous) => previous.filter((_, entryIndex) => entryIndex !== index));
                  setSaveState("idle");
                  setSaveMessage(null);
                }}
                aria-label={`Remove port ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setPortValues((previous) => [...previous, String(DEFAULT_NEW_PORT)]);
            setSaveState("idle");
            setSaveMessage(null);
          }}
          disabled={saveState === "saving" || disabled}
        >
          <Plus className="size-4" />
          Add port
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void onSubmit()} disabled={saveState === "saving" || disabled}>
          {saveState === "saving" && <Loader2 className="size-4 animate-spin" />}
          Save commands
        </Button>
        {disabled && disabledMessage && <span className="text-sm text-muted-foreground">{disabledMessage}</span>}
        {saveState === "success" && saveMessage && <span className="text-sm text-green-800">{saveMessage}</span>}
        {saveState === "error" && saveMessage && <span className="text-sm text-destructive">{saveMessage}</span>}
      </div>
    </div>
  );
}
