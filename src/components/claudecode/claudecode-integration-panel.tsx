"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ClaudeCodeSettingsModal } from "@/src/components/claudecode/claudecode-settings-modal";
import { Button } from "@/src/components/ui/button";
import {
  getGlobalSettingsSnapshot,
  subscribeToGlobalSettings,
} from "@/src/lib/ipc";

export function ClaudeCodeIntegrationPanel() {
  const globalSettingsSnapshot = useSyncExternalStore(
    subscribeToGlobalSettings,
    getGlobalSettingsSnapshot,
    getGlobalSettingsSnapshot,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [soundLibrary, setSoundLibrary] = useState(
    globalSettingsSnapshot.soundLibrary,
  );

  const hookSettings = globalSettingsSnapshot.claudeCodeSoundSettings;
  const enabledCount = [hookSettings.notification, hookSettings.stop].filter(
    (h) => h.enabled,
  ).length;

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Claude Code</h3>
          <p className="text-xs text-muted-foreground">
            Hook sounds and notifications for Claude Code sessions.
            {enabledCount > 0
              ? ` ${enabledCount} hook${enabledCount > 1 ? "s" : ""} enabled.`
              : " No hooks enabled."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setStatusMessage(null);
            setSoundLibrary(globalSettingsSnapshot.soundLibrary);
            setIsModalOpen(true);
          }}
        >
          <Settings2 aria-hidden="true" className="size-4" />
          <span>Settings</span>
        </Button>
      </div>

      {statusMessage && (
        <p className="text-xs text-green-800">{statusMessage}</p>
      )}

      <ClaudeCodeSettingsModal
        open={isModalOpen}
        soundLibrary={soundLibrary}
        claudeCodeSoundSettings={globalSettingsSnapshot.claudeCodeSoundSettings}
        onSettingsSaved={(message) => {
          setStatusMessage(message);
        }}
        onSoundLibraryChanged={(library) => {
          setSoundLibrary(library);
        }}
        onOpenChange={(open) => {
          setIsModalOpen(open);
        }}
      />
    </div>
  );
}
