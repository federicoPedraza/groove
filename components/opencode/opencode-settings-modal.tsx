"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildOpencodeConfigArtifact } from "@/src/lib/opencode-config-artifact";
import type { OpencodeEffectiveScope, OpencodeSettings } from "@/src/lib/ipc";

type OpencodeSettingsModalProps = {
  open: boolean;
  workspaceScopeAvailable: boolean;
  globalScopeAvailable: boolean;
  effectiveScope: OpencodeEffectiveScope;
  workspaceSettings: OpencodeSettings;
  globalSettings: OpencodeSettings;
  workspaceSavePending: boolean;
  globalSavePending: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onSaveWorkspace: (payload: OpencodeSettings) => void;
  onSaveGlobal: (payload: OpencodeSettings) => void;
  onImportWorkspace: (file: File) => void;
  onImportGlobal: (file: File) => void;
};

const DEFAULT_SETTINGS: OpencodeSettings = {
  enabled: false,
  defaultModel: null,
};

function scopeLabel(scope: OpencodeEffectiveScope): string {
  if (scope === "workspace") {
    return "workspace";
  }
  if (scope === "global") {
    return "global";
  }
  return "none";
}

export function OpencodeSettingsModal({
  open,
  workspaceScopeAvailable,
  globalScopeAvailable,
  effectiveScope,
  workspaceSettings,
  globalSettings,
  workspaceSavePending,
  globalSavePending,
  statusMessage,
  errorMessage,
  onOpenChange,
  onSaveWorkspace,
  onSaveGlobal,
  onImportWorkspace,
  onImportGlobal,
}: OpencodeSettingsModalProps) {
  const [workspaceEnabled, setWorkspaceEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [workspaceDefaultModel, setWorkspaceDefaultModel] = useState("");
  const [globalEnabled, setGlobalEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [globalDefaultModel, setGlobalDefaultModel] = useState("");
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);
  const globalImportInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveScopeText = useMemo(() => {
    if (effectiveScope === "none") {
      return "No Opencode config scope is available in this environment.";
    }
    return `Effective config scope is currently ${scopeLabel(effectiveScope)}.`;
  }, [effectiveScope]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setWorkspaceEnabled(workspaceSettings.enabled ?? false);
    setWorkspaceDefaultModel(workspaceSettings.defaultModel ?? "");
    setGlobalEnabled(globalSettings.enabled ?? false);
    setGlobalDefaultModel(globalSettings.defaultModel ?? "");
  }, [globalSettings, open, workspaceSettings]);

  const downloadScopeConfig = (scope: "workspace" | "global") => {
    const settings =
      scope === "workspace"
        ? { enabled: workspaceEnabled, defaultModel: workspaceDefaultModel.trim() || null }
        : { enabled: globalEnabled, defaultModel: globalDefaultModel.trim() || null };

    const artifact = buildOpencodeConfigArtifact(scope, settings);
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `opencode-${scope}-config-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opencode integration</DialogTitle>
          <DialogDescription>
            Configure Opencode settings saved in Groove metadata. Groove does not write into <code>.opencode</code> or <code>$HOME/.config/opencode</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{effectiveScopeText}</p>

          <section className="space-y-3 rounded-md border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Workspace configuration</p>
              <p className="text-xs text-muted-foreground">
                Available only when the active workspace has a <code>.opencode/</code> directory.
              </p>
            </div>

            {!workspaceScopeAvailable ? <p className="text-xs text-muted-foreground">Unavailable for the current workspace.</p> : null}

            <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Checkbox
                  checked={workspaceEnabled}
                  disabled={!workspaceScopeAvailable || workspaceSavePending}
                  onCheckedChange={(checked) => setWorkspaceEnabled(checked === true)}
                />
                <span>Enable workspace Opencode configuration</span>
              </span>
            </label>

            <div className="space-y-2">
              <label htmlFor="opencode-workspace-default-model" className="text-sm font-medium">
                Default model (optional)
              </label>
              <Input
                id="opencode-workspace-default-model"
                value={workspaceDefaultModel}
                onChange={(event) => setWorkspaceDefaultModel(event.target.value)}
                placeholder="gpt-5.3-codex"
                disabled={!workspaceScopeAvailable || workspaceSavePending}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceScopeAvailable || workspaceSavePending}
                onClick={() => {
                  onSaveWorkspace({
                    enabled: workspaceEnabled,
                    defaultModel: workspaceDefaultModel.trim() || null,
                  });
                }}
              >
                Save workspace config
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceScopeAvailable || workspaceSavePending}
                onClick={() => downloadScopeConfig("workspace")}
              >
                Export
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceScopeAvailable || workspaceSavePending}
                onClick={() => workspaceImportInputRef.current?.click()}
              >
                Import
              </Button>
              <input
                ref={workspaceImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  onImportWorkspace(file);
                }}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-md border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Global configuration</p>
              <p className="text-xs text-muted-foreground">
                Available only when <code>$HOME/.config/opencode/</code> exists.
              </p>
            </div>

            {!globalScopeAvailable ? <p className="text-xs text-muted-foreground">Unavailable on this machine.</p> : null}

            <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Checkbox
                  checked={globalEnabled}
                  disabled={!globalScopeAvailable || globalSavePending}
                  onCheckedChange={(checked) => setGlobalEnabled(checked === true)}
                />
                <span>Enable global Opencode configuration</span>
              </span>
            </label>

            <div className="space-y-2">
              <label htmlFor="opencode-global-default-model" className="text-sm font-medium">
                Default model (optional)
              </label>
              <Input
                id="opencode-global-default-model"
                value={globalDefaultModel}
                onChange={(event) => setGlobalDefaultModel(event.target.value)}
                placeholder="gpt-5.3-codex"
                disabled={!globalScopeAvailable || globalSavePending}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!globalScopeAvailable || globalSavePending}
                onClick={() => {
                  onSaveGlobal({
                    enabled: globalEnabled,
                    defaultModel: globalDefaultModel.trim() || null,
                  });
                }}
              >
                Save global config
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!globalScopeAvailable || globalSavePending}
                onClick={() => downloadScopeConfig("global")}
              >
                Export
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!globalScopeAvailable || globalSavePending}
                onClick={() => globalImportInputRef.current?.click()}
              >
                Import
              </Button>
              <input
                ref={globalImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  onImportGlobal(file);
                }}
              />
            </div>
          </section>

          {statusMessage ? <p className="text-xs text-green-800">{statusMessage}</p> : null}
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
