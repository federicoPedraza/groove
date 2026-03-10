"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";

import { OpencodeSettingsModal } from "@/components/opencode/opencode-settings-modal";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
  opencodeIntegrationStatus,
  type OpencodeSettings,
} from "@/src/lib/ipc";

type OpencodeIntegrationPanelProps = {
  title: string;
  workspaceRoot: string | null;
};

const DEFAULT_SETTINGS: OpencodeSettings = {
  enabled: false,
  defaultModel: null,
  settingsDirectory: DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
};

export function OpencodeIntegrationPanel({ title, workspaceRoot }: OpencodeIntegrationPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [effectiveScope, setEffectiveScope] = useState<"workspace" | "global" | "none">("none");
  const [workspaceSettings, setWorkspaceSettings] = useState<OpencodeSettings>({ ...DEFAULT_SETTINGS });
  const [globalSettings, setGlobalSettings] = useState<OpencodeSettings>({ ...DEFAULT_SETTINGS });

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);

    try {
      const response = await opencodeIntegrationStatus();
      if (!response.ok) {
        setErrorMessage(response.error ?? "Failed to load Opencode status.");
        return;
      }

      setEffectiveScope(response.effectiveScope);
      setWorkspaceSettings(response.workspaceSettings ?? { ...DEFAULT_SETTINGS });
      setGlobalSettings(response.globalSettings ?? { ...DEFAULT_SETTINGS });
    } catch {
      setErrorMessage("Failed to load Opencode status.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, workspaceRoot]);

  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">Workspace/global Opencode configuration stored in Groove settings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingStatus}
            onClick={() => {
              setStatusMessage(null);
              setErrorMessage(null);
              void refreshStatus();
            }}
          >
            {loadingStatus ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusMessage(null);
              setErrorMessage(null);
              setIsModalOpen(true);
            }}
          >
            <Settings2 aria-hidden="true" className="size-4" />
            <span>Settings</span>
          </Button>
        </div>
      </div>

      {statusMessage ? <p className="text-xs text-green-800">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

      <OpencodeSettingsModal
        open={isModalOpen}
        workspaceRoot={workspaceRoot}
        effectiveScope={effectiveScope}
        workspaceSettings={workspaceSettings}
        globalSettings={globalSettings}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        onSettingsSaved={(message) => {
          setStatusMessage(message);
          setErrorMessage(null);
          void refreshStatus();
        }}
        onOpenChange={(open) => {
          setIsModalOpen(open);
        }}
      />
    </div>
  );
}
