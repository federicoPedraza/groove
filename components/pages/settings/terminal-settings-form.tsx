import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
      <div className="space-y-1">
        <label htmlFor="default-terminal" className="text-sm font-medium text-foreground">
          Default terminal
        </label>
        <select
          id="default-terminal"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          value={defaultTerminal}
          onChange={(event) => {
            onDefaultTerminalChange(event.target.value as DefaultTerminal);
          }}
          disabled={saveState === "saving"}
        >
          {SUPPORTED_TERMINAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
          placeholder="Example: ghostty --working-directory {worktree}"
          disabled={saveState === "saving" || !customCommandEnabled}
        />
        <p className="text-xs text-muted-foreground">
          Used when default terminal is set to Custom command. Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>.
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
