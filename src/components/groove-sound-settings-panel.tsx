"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { SearchDropdown } from "@/src/components/ui/search-dropdown";
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
import { SOFT_GREEN_BUTTON_CLASSES } from "@/src/components/pages/dashboard/constants";
import type {
  GrooveSoundSettings,
  GrooveSoundHookType,
  SoundLibraryEntry,
} from "@/src/lib/ipc";
import { globalSettingsUpdate, soundLibraryImport } from "@/src/lib/ipc";
import { playCustomSound, playNotificationSound } from "@/src/lib/utils/sound";

type GrooveSoundSettingsPanelProps = {
  grooveSoundSettings: GrooveSoundSettings;
  soundLibrary: SoundLibraryEntry[];
  onSoundLibraryChanged: (library: SoundLibraryEntry[]) => void;
};

const HOOK_TYPES: {
  key: GrooveSoundHookType;
  label: string;
  description: string;
}[] = [
  {
    key: "play",
    label: "Play groove",
    description: "Fires when a worktree groove is started",
  },
  {
    key: "pause",
    label: "Pause",
    description: "Fires when a worktree is paused or stopped",
  },
  {
    key: "summaryStart",
    label: "Summary start",
    description: "Fires when a summary generation begins",
  },
  {
    key: "summaryEnd",
    label: "Summary end",
    description: "Fires when a summary generation completes",
  },
  {
    key: "emergency",
    label: "Emergency / Clean all",
    description:
      "Fires on emergency kill, clean all, or worktree removal actions",
  },
  {
    key: "remove",
    label: "Remove worktree",
    description: "Fires when a worktree is removed or deleted",
  },
];

export function GrooveSoundSettingsPanel({
  grooveSoundSettings,
  soundLibrary,
  onSoundLibraryChanged,
}: GrooveSoundSettingsPanelProps) {
  const [localSettings, setLocalSettings] =
    useState<GrooveSoundSettings>(grooveSoundSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [playingHook, setPlayingHook] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [soundStatus, setSoundStatus] = useState<
    Record<string, SoundWaveformStatus>
  >({});
  const requestVersionRef = useRef(0);

  const syncedSettings =
    JSON.stringify(localSettings) !== JSON.stringify(grooveSoundSettings)
      ? localSettings
      : grooveSoundSettings;

  const saveSettings = async (
    nextSettings: GrooveSoundSettings,
  ): Promise<void> => {
    setIsSaving(true);
    setErrorMessage(null);
    const requestVersion = ++requestVersionRef.current;

    try {
      const result = await globalSettingsUpdate({
        grooveSoundSettings: nextSettings,
      });

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      if (!result.ok || !result.globalSettings) {
        setErrorMessage(
          result.error ?? "Failed to save groove sound settings.",
        );
        return;
      }

      setLocalSettings(result.globalSettings.grooveSoundSettings);
    } catch {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setErrorMessage("Failed to save groove sound settings.");
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
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">Groove sounds</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Configure sounds for Groove actions. When enabled, a sound plays each
        time the corresponding action is triggered.
      </p>

      <div className="space-y-2">
        {HOOK_TYPES.map((hook) => {
          const hookEntry = syncedSettings[hook.key];

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
                      const nextSettings: GrooveSoundSettings = {
                        ...syncedSettings,
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
                          const nextSettings: GrooveSoundSettings = {
                            ...syncedSettings,
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
                          onStatusChange={(status) =>
                            setSoundStatus((prev) => ({
                              ...prev,
                              [hook.key]: status,
                            }))
                          }
                        />
                        {(() => {
                          const status = soundStatus[hook.key];
                          const isSoundError =
                            hookEntry.soundId != null && status === "error";
                          const isSoundLoading =
                            hookEntry.soundId != null && status === "loading";
                          const isDisabled =
                            isSoundError || isSoundLoading;
                          const tooltipText = isSoundError
                            ? "Sound file unavailable or corrupt"
                            : isSoundLoading
                              ? "Loading sound…"
                              : hookEntry.soundId
                                ? "Play selected sound"
                                : "Play default sound";

                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isDisabled}
                                      className={`h-8 w-8 shrink-0 p-0 ${isDisabled ? "" : SOFT_GREEN_BUTTON_CLASSES}`}
                                      aria-label={`Play ${hook.label} sound`}
                                      onClick={() => {
                                        const selectedSound = hookEntry.soundId
                                          ? soundLibrary.find(
                                              (s) =>
                                                s.id === hookEntry.soundId,
                                            )
                                          : null;

                                        setPlayingHook(hook.key);

                                        if (selectedSound) {
                                          void playCustomSound(
                                            selectedSound.fileName,
                                          ).then((result) => {
                                            const ms = result.played
                                              ? Math.max(
                                                  300,
                                                  result.duration * 1000,
                                                )
                                              : 300;
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
                                              current === hook.key
                                                ? null
                                                : current,
                                            );
                                          }, 300);
                                        }
                                      }}
                                    >
                                      <Play
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{tooltipText}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
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
    </section>
  );
}
