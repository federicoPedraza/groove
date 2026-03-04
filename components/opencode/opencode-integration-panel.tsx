"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";

import { OpencodeSettingsModal } from "@/components/opencode/opencode-settings-modal";
import { Button } from "@/components/ui/button";
import { parseImportedOpencodeSettings } from "@/src/lib/opencode-config-artifact";
import {
  opencodeIntegrationStatus,
  opencodeUpdateGlobalSettings,
  opencodeUpdateWorkspaceSettings,
  type OpencodeSettings,
} from "@/src/lib/ipc";

type OpencodeIntegrationPanelProps = {
  title: string;
  workspaceRoot: string | null;
};

const DEFAULT_SETTINGS: OpencodeSettings = {
  enabled: false,
  defaultModel: null,
};

export function OpencodeIntegrationPanel({ title, workspaceRoot }: OpencodeIntegrationPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workspaceSavePending, setWorkspaceSavePending] = useState(false);
  const [globalSavePending, setGlobalSavePending] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [workspaceScopeAvailable, setWorkspaceScopeAvailable] = useState(false);
  const [globalScopeAvailable, setGlobalScopeAvailable] = useState(false);
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

      setWorkspaceScopeAvailable(response.workspaceScopeAvailable);
      setGlobalScopeAvailable(response.globalScopeAvailable);
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

  const statusLine = useMemo(() => {
    const scope = effectiveScope === "none" ? "None" : effectiveScope === "workspace" ? "Workspace" : "Global";
    const enabledSettings = effectiveScope === "workspace" ? workspaceSettings : globalSettings;
    const enabled = effectiveScope !== "none" && enabledSettings.enabled;
    return `Effective scope: ${scope}. Status: ${enabled ? "Enabled" : "Disabled"}.`;
  }, [effectiveScope, globalSettings, workspaceSettings]);

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

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{statusLine}</p>
        <p>Workspace scope available: {workspaceScopeAvailable ? "Yes" : "No"}</p>
        <p>Global scope available: {globalScopeAvailable ? "Yes" : "No"}</p>
      </div>

      {statusMessage ? <p className="text-xs text-green-800">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

      <OpencodeSettingsModal
        open={isModalOpen}
        workspaceRoot={workspaceRoot}
        workspaceScopeAvailable={workspaceScopeAvailable}
        globalScopeAvailable={globalScopeAvailable}
        effectiveScope={effectiveScope}
        workspaceSettings={workspaceSettings}
        globalSettings={globalSettings}
        workspaceSavePending={workspaceSavePending}
        globalSavePending={globalSavePending}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        onOpenChange={(open) => {
          if (workspaceSavePending || globalSavePending) {
            return;
          }
          setIsModalOpen(open);
        }}
        onSaveWorkspace={(payload) => {
          setWorkspaceSavePending(true);
          setStatusMessage(null);
          setErrorMessage(null);

          void (async () => {
            try {
              const response = await opencodeUpdateWorkspaceSettings(payload);
              if (!response.ok || !response.settings) {
                setErrorMessage(response.error ?? "Failed to save workspace Opencode settings.");
                return;
              }

              setWorkspaceSettings(response.settings);
              setStatusMessage("Workspace Opencode settings saved.");
              await refreshStatus();
            } catch {
              setErrorMessage("Failed to save workspace Opencode settings.");
            } finally {
              setWorkspaceSavePending(false);
            }
          })();
        }}
        onImportWorkspace={(file) => {
          setWorkspaceSavePending(true);
          setStatusMessage(null);
          setErrorMessage(null);

          void (async () => {
            try {
              const rawText = await file.text();
              const parsed = parseImportedOpencodeSettings(rawText, "workspace");
              if (!parsed.ok) {
                setErrorMessage(parsed.error);
                return;
              }

              const response = await opencodeUpdateWorkspaceSettings(parsed.settings);
              if (!response.ok || !response.settings) {
                setErrorMessage(response.error ?? "Failed to import workspace Opencode settings.");
                return;
              }

              setWorkspaceSettings(response.settings);
              setStatusMessage("Workspace Opencode settings imported.");
              await refreshStatus();
            } catch {
              setErrorMessage("Failed to import workspace Opencode settings.");
            } finally {
              setWorkspaceSavePending(false);
            }
          })();
        }}
        onSaveGlobal={(payload) => {
          setGlobalSavePending(true);
          setStatusMessage(null);
          setErrorMessage(null);

          void (async () => {
            try {
              const response = await opencodeUpdateGlobalSettings(payload);
              if (!response.ok || !response.settings) {
                setErrorMessage(response.error ?? "Failed to save global Opencode settings.");
                return;
              }

              setGlobalSettings(response.settings);
              setStatusMessage("Global Opencode settings saved.");
              await refreshStatus();
            } catch {
              setErrorMessage("Failed to save global Opencode settings.");
            } finally {
              setGlobalSavePending(false);
            }
          })();
        }}
        onImportGlobal={(file) => {
          setGlobalSavePending(true);
          setStatusMessage(null);
          setErrorMessage(null);

          void (async () => {
            try {
              const rawText = await file.text();
              const parsed = parseImportedOpencodeSettings(rawText, "global");
              if (!parsed.ok) {
                setErrorMessage(parsed.error);
                return;
              }

              const response = await opencodeUpdateGlobalSettings(parsed.settings);
              if (!response.ok || !response.settings) {
                setErrorMessage(response.error ?? "Failed to import global Opencode settings.");
                return;
              }

              setGlobalSettings(response.settings);
              setStatusMessage("Global Opencode settings imported.");
              await refreshStatus();
            } catch {
              setErrorMessage("Failed to import global Opencode settings.");
            } finally {
              setGlobalSavePending(false);
            }
          })();
        }}
      />
    </div>
  );
}
