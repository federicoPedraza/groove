import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CommandsSettingsPayload = {
  playGrooveCommand: string;
  testingPorts: number[];
};

type CommandsSettingsFormProps = {
  playGrooveCommand: string;
  testingPorts: number[];
  disabled?: boolean;
  disabledMessage?: string;
  onSave: (payload: CommandsSettingsPayload) => Promise<{ ok: boolean; error?: string; payload?: CommandsSettingsPayload }>;
};

type SaveState = "idle" | "saving" | "success" | "error";

const DEFAULT_NEW_PORT = 3003;

function toPortString(value: number): string {
  return Number.isInteger(value) && value > 0 ? String(value) : "";
}

export function CommandsSettingsForm({ playGrooveCommand, testingPorts, disabled = false, disabledMessage, onSave }: CommandsSettingsFormProps) {
  const [playCommandValue, setPlayCommandValue] = useState(playGrooveCommand);
  const [portValues, setPortValues] = useState<string[]>(testingPorts.length > 0 ? testingPorts.map(toPortString) : [""]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlayCommandValue(playGrooveCommand);
  }, [playGrooveCommand]);

  useEffect(() => {
    setPortValues(testingPorts.length > 0 ? testingPorts.map(toPortString) : [""]);
  }, [testingPorts]);

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
    });

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.error ?? "Failed to save command settings.");
      return;
    }

    const savedPlayCommand = result.payload?.playGrooveCommand ?? trimmedPlayCommand;
    const savedPorts = result.payload?.testingPorts ?? parsedPorts;
    setPlayCommandValue(savedPlayCommand);
    setPortValues(savedPorts.map(toPortString));
    setSaveState("success");
    setSaveMessage("Commands settings saved.");
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Commands</h2>
      </div>

      <div className="space-y-1">
        <label htmlFor="play-groove-command" className="text-sm font-medium text-foreground">
          Play Groove command
        </label>
        <Input
          id="play-groove-command"
          value={playCommandValue}
          onChange={(event) => {
            setPlayCommandValue(event.target.value);
            setSaveState("idle");
            setSaveMessage(null);
          }}
          placeholder="groove go {target}"
          disabled={saveState === "saving" || disabled}
        />
        <p className="text-xs text-muted-foreground">
          Supports <code>{"{target}"}</code> for branch/worktree target. If omitted, the target is appended as the last argument.
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
