import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SUPPORTED_TERMINAL_OPTIONS } from "@/components/pages/settings/constants";
import type { DefaultTerminal } from "@/src/lib/ipc";
import type { SaveState } from "@/components/pages/settings/types";

type TerminalSettingsFormProps = {
  defaultTerminal: DefaultTerminal;
  terminalCustomCommand: string;
  saveState: SaveState;
  saveMessage: string | null;
  onDefaultTerminalChange: (value: DefaultTerminal) => void;
  onTerminalCustomCommandChange: (value: string) => void;
  onSave: () => void;
};

export function TerminalSettingsForm({
  defaultTerminal,
  terminalCustomCommand,
  saveState,
  saveMessage,
  onDefaultTerminalChange,
  onTerminalCustomCommandChange,
  onSave,
}: TerminalSettingsFormProps) {
  const customCommandEnabled = defaultTerminal === "custom";
  const selectedTerminalOption = SUPPORTED_TERMINAL_OPTIONS.find((option) => option.value === defaultTerminal);

  return (
    <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
      <div className="space-y-1">
        <label id="default-terminal-label" className="text-sm font-medium text-foreground">
          Terminal for Open Terminal and testing actions
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id="default-terminal"
              type="button"
              variant="outline"
              className="w-full justify-between bg-transparent px-3 font-normal dark:border-border/80 dark:bg-muted/35 dark:hover:bg-muted/45"
              aria-labelledby="default-terminal-label"
              disabled={saveState === "saving"}
            >
              <span>{selectedTerminalOption?.label ?? "Select terminal"}</span>
              <ChevronsUpDown className="size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {SUPPORTED_TERMINAL_OPTIONS.map((option) => {
              const isSelected = option.value === defaultTerminal;

              return (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => {
                    onDefaultTerminalChange(option.value);
                  }}
                  className="justify-between"
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="size-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1">
        <label htmlFor="terminal-custom-command" className="text-sm font-medium text-foreground">
          Custom command fallback
        </label>
        <Input
          id="terminal-custom-command"
          value={terminalCustomCommand}
          onChange={(event) => {
            onTerminalCustomCommandChange(event.target.value);
          }}
          placeholder="Example: ghostty --working-directory={worktree}"
          disabled={saveState === "saving" || !customCommandEnabled}
        />
        <p className="text-xs text-muted-foreground">
          Used when terminal is set to Custom command. Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={saveState === "saving"}>
          {saveState === "saving" && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
        {saveState === "success" && saveMessage && <span className="text-sm text-green-800">{saveMessage}</span>}
        {saveState === "error" && saveMessage && <span className="text-sm text-destructive">{saveMessage}</span>}
      </div>
    </div>
  );
}
