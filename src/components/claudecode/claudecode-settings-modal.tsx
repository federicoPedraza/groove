"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { SearchDropdown } from "@/src/components/ui/search-dropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { SoundWaveform } from "@/src/components/ui/sound-waveform";
import { SOFT_GREEN_BUTTON_CLASSES } from "@/src/components/pages/dashboard/constants";
import type { ClaudeCodeSoundSettings, SoundLibraryEntry } from "@/src/lib/ipc";
import { globalSettingsUpdate, soundLibraryImport } from "@/src/lib/ipc";
import { playCustomSound, playNotificationSound } from "@/src/lib/utils/sound";

type ClaudeCodeSettingsModalProps = {
  open: boolean;
  soundLibrary: SoundLibraryEntry[];
  claudeCodeSoundSettings: ClaudeCodeSoundSettings;
  onSettingsSaved: (message: string) => void;
  onSoundLibraryChanged: (library: SoundLibraryEntry[]) => void;
  onOpenChange: (open: boolean) => void;
};

const HOOK_TYPES = [
  {
    key: "notification" as const,
    label: "Notification",
    description:
      "Fires when Claude Code needs your attention (permission prompts, idle timeouts)",
  },
  {
    key: "stop" as const,
    label: "Stop",
    description: "Fires when Claude Code finishes a task",
  },
];

export function ClaudeCodeSettingsModal({
  open,
  soundLibrary,
  claudeCodeSoundSettings,
  onSettingsSaved,
  onSoundLibraryChanged,
  onOpenChange,
}: ClaudeCodeSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<ClaudeCodeSoundSettings>(
    claudeCodeSoundSettings,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [playingHook, setPlayingHook] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    if (open) {
      setLocalSettings(claudeCodeSoundSettings);
      setErrorMessage(null);
    }
  }, [open, claudeCodeSoundSettings]);

  const saveSettings = async (
    nextSettings: ClaudeCodeSoundSettings,
  ): Promise<void> => {
    setIsSaving(true);
    setErrorMessage(null);
    const requestVersion = ++requestVersionRef.current;

    try {
      const result = await globalSettingsUpdate({
        claudeCodeSoundSettings: nextSettings,
      });

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      if (!result.ok || !result.globalSettings) {
        setErrorMessage(
          result.error ?? "Failed to save Claude Code hook settings.",
        );
        return;
      }

      setLocalSettings(result.globalSettings.claudeCodeSoundSettings);
      onSettingsSaved("Claude Code hook settings saved.");
    } catch {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setErrorMessage("Failed to save Claude Code hook settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportSound = async (): Promise<void> => {
    setIsImporting(true);
    try {
      const result = await soundLibraryImport();
      if (result.ok && result.globalSettings) {
        onSoundLibraryChanged(result.globalSettings.soundLibrary);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const soundOptions = [
    { value: "__none__", label: "Default (synthesized)" },
    ...soundLibrary.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Claude Code settings</DialogTitle>
          <DialogDescription>
            Configure sounds for Claude Code lifecycle hooks. Groove
            automatically installs hooks into worktrees to notify you when
            Claude Code needs attention or finishes a task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto py-2">
          {HOOK_TYPES.map((hook) => {
            const hookEntry = localSettings[hook.key];

            return (
              <div
                key={hook.key}
                className="space-y-2 rounded-md border px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Checkbox
                      checked={hookEntry.enabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) => {
                        const nextSettings: ClaudeCodeSoundSettings = {
                          ...localSettings,
                          [hook.key]: {
                            ...hookEntry,
                            enabled: checked === true,
                          },
                        };
                        setLocalSettings(nextSettings);
                        void saveSettings(nextSettings);
                      }}
                    />
                    <span>{hook.label}</span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {hook.description}
                </p>

                {hookEntry.enabled && (
                  <div className="mt-2 space-y-2">
                    {soundLibrary.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No sounds in library.{" "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          disabled={isImporting}
                          onClick={() => void handleImportSound()}
                        >
                          Import a sound
                        </button>{" "}
                        to assign a custom tone, or leave as default.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <SearchDropdown
                          ariaLabel={`Sound for ${hook.label} hook`}
                          searchAriaLabel={`Search sounds for ${hook.label} hook`}
                          options={soundOptions}
                          value={hookEntry.soundId ?? "__none__"}
                          placeholder="Default (synthesized)"
                          disabled={isSaving}
                          onValueChange={(nextSoundId) => {
                            const resolvedSoundId =
                              nextSoundId === "__none__" ? null : nextSoundId;
                            const nextSettings: ClaudeCodeSoundSettings = {
                              ...localSettings,
                              [hook.key]: {
                                ...hookEntry,
                                soundId: resolvedSoundId,
                              },
                            };
                            setLocalSettings(nextSettings);
                            void saveSettings(nextSettings);
                          }}
                          maxResults={10}
                        />
                        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
                          <SoundWaveform
                            fileName={(() => {
                              const s = hookEntry.soundId
                                ? soundLibrary.find(
                                    (e) => e.id === hookEntry.soundId,
                                  )
                                : null;
                              return s?.fileName ?? null;
                            })()}
                            isPlaying={playingHook === hook.key}
                            barCount={60}
                            className="h-5 flex-1"
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className={`h-8 w-8 shrink-0 p-0 ${SOFT_GREEN_BUTTON_CLASSES}`}
                                  aria-label={`Play ${hook.label} sound`}
                                  onClick={() => {
                                    const selectedSound = hookEntry.soundId
                                      ? soundLibrary.find(
                                          (s) => s.id === hookEntry.soundId,
                                        )
                                      : null;

                                    setPlayingHook(hook.key);

                                    if (selectedSound) {
                                      void playCustomSound(
                                        selectedSound.fileName,
                                      ).then((durationSec) => {
                                        const ms = Math.max(
                                          300,
                                          durationSec * 1000,
                                        );
                                        setTimeout(() => {
                                          setPlayingHook((current) =>
                                            current === hook.key
                                              ? null
                                              : current,
                                          );
                                        }, ms);
                                      });
                                    } else {
                                      playNotificationSound();
                                      setTimeout(() => {
                                        setPlayingHook((current) =>
                                          current === hook.key ? null : current,
                                        );
                                      }, 300);
                                    }
                                  }}
                                >
                                  <Play aria-hidden="true" className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {hookEntry.soundId
                                  ? "Play selected sound"
                                  : "Play default sound"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
