"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildOpencodeConfigArtifact } from "@/src/lib/opencode-config-artifact";
import {
  checkOpencodeStatus,
  getOpencodeProfile,
  repairOpencodeIntegration,
  setOpencodeProfile,
  syncOpencodeConfig,
  type OpenCodeProfile,
  type OpenCodeStatus,
  type OpencodeEffectiveScope,
  type OpencodeSettings,
} from "@/src/lib/ipc";

type OpencodeSettingsModalProps = {
  open: boolean;
  workspaceRoot: string | null;
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

const DEFAULT_PROFILE: OpenCodeProfile = {
  version: "v1",
  enabled: true,
  artifactStore: "none",
  defaultFlow: "new_change",
  commands: {
    init: "init",
    newChange: "new_change",
    continue: "continue",
    apply: "apply",
    verify: "verify",
    archive: "archive",
  },
  timeouts: {
    phaseSeconds: 900,
  },
  safety: {
    requireUserApprovalBetweenPhases: true,
    allowParallelSpecDesign: false,
  },
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
  workspaceRoot,
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
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusData, setStatusData] = useState<OpenCodeStatus | null>(null);
  const [applyPending, setApplyPending] = useState(false);
  const [repairPending, setRepairPending] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const resolveProfileForApply = (profile: OpenCodeProfile | null): OpenCodeProfile => {
    const source = profile ?? DEFAULT_PROFILE;
    const phaseSeconds =
      Number.isFinite(source.timeouts.phaseSeconds) && source.timeouts.phaseSeconds > 0
        ? source.timeouts.phaseSeconds
        : DEFAULT_PROFILE.timeouts.phaseSeconds;

    return {
      version: source.version.trim() || DEFAULT_PROFILE.version,
      enabled: source.enabled,
      artifactStore: "none",
      defaultFlow: source.defaultFlow.trim() || DEFAULT_PROFILE.defaultFlow,
      commands: {
        init: source.commands.init.trim() || DEFAULT_PROFILE.commands.init,
        newChange: source.commands.newChange.trim() || DEFAULT_PROFILE.commands.newChange,
        continue: source.commands.continue.trim() || DEFAULT_PROFILE.commands.continue,
        apply: source.commands.apply.trim() || DEFAULT_PROFILE.commands.apply,
        verify: source.commands.verify.trim() || DEFAULT_PROFILE.commands.verify,
        archive: source.commands.archive.trim() || DEFAULT_PROFILE.commands.archive,
      },
      timeouts: {
        phaseSeconds,
      },
      safety: {
        requireUserApprovalBetweenPhases: source.safety.requireUserApprovalBetweenPhases,
        allowParallelSpecDesign: source.safety.allowParallelSpecDesign,
      },
    };
  };

  const refreshRuntime = async () => {
    if (!workspaceRoot) {
      setStatusData(null);
      return;
    }

    setStatusLoading(true);
    setRuntimeError(null);

    try {
      const [statusResponse, profileResponse] = await Promise.all([
        checkOpencodeStatus(workspaceRoot),
        getOpencodeProfile(workspaceRoot),
      ]);

      if (!statusResponse.ok || !statusResponse.status) {
        setStatusData(null);
        setRuntimeError(statusResponse.error ?? "Failed to load OpenCode diagnostics.");
      } else {
        setStatusData(statusResponse.status);
      }

      if (!profileResponse.ok || !profileResponse.profile) {
        setRuntimeError((current) => current ?? profileResponse.error ?? "Failed to load OpenCode profile.");
      }
    } catch {
      setStatusData(null);
      setRuntimeError("Failed to load OpenCode diagnostics.");
    } finally {
      setStatusLoading(false);
    }
  };

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
    setRuntimeMessage(null);
    setRuntimeError(null);
    void refreshRuntime();
  }, [globalSettings, open, workspaceSettings]);

  const runtimeBusy = statusLoading || applyPending || repairPending;

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
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Opencode integration</DialogTitle>
          <DialogDescription>
            Configure Opencode settings saved in Groove metadata. Groove does not write into <code>.opencode</code> or <code>$HOME/.config/opencode</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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

          <section className="space-y-3 rounded-md border px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Workspace runtime profile</p>
                <p className="text-xs text-muted-foreground">
                  Runs OpenCode operational actions using <code>.groove/opencode-profile.json</code> and <code>.groove/opencode-config.generated.json</code>.
                </p>
              </div>
            </div>

            {!workspaceRoot ? <p className="text-xs text-muted-foreground">Connect a repository to use OpenCode runtime tools.</p> : null}

            {statusData ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">ATL sanity:</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      statusData.sanity.applied ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {statusData.sanity.applied ? "Applied" : "Needs repair"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  <p>Worktree exists: {statusData.worktreeExists ? "Yes" : "No"}</p>
                  <p>Git repository: {statusData.gitRepo ? "Yes" : "No"}</p>
                  <p>OpenCode binary: {statusData.opencodeAvailable ? "Available" : "Missing"}</p>
                  <p>Required commands: {statusData.requiredCommandsAvailable ? "Ready" : "Missing"}</p>
                  <p>Profile valid: {statusData.profileValid ? "Yes" : "No"}</p>
                  <p>Profile path: <code>{statusData.profilePath}</code></p>
                  <p>Sync target: <code>{statusData.syncTargetPath}</code></p>
                  <p>Artifact store: <code>{statusData.artifactStore ?? "none"}</code></p>
                  <p>Artifact store readiness: {statusData.artifactStoreReady ? "Ready" : "Needs setup"}</p>
                </div>
              </div>
            ) : null}

            {statusData && statusData.missingCommands.length > 0 ? (
              <p className="text-xs text-destructive">Missing commands: {statusData.missingCommands.join(", ")}</p>
            ) : null}

            {statusData && statusData.warnings.length > 0 ? (
              <p className="text-xs text-muted-foreground">Warnings: {statusData.warnings.join(" | ")}</p>
            ) : null}

            {statusData && statusData.sanity.diagnostics.length > 0 ? (
              <p className="text-xs text-muted-foreground">Sanity diagnostics: {statusData.sanity.diagnostics.join(" | ")}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceRoot || runtimeBusy}
                onClick={() => {
                  setRuntimeMessage(null);
                  setRuntimeError(null);
                  void refreshRuntime();
                }}
              >
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceRoot || runtimeBusy}
                onClick={() => {
                  if (!workspaceRoot) {
                    return;
                  }

                  setApplyPending(true);
                  setRuntimeMessage(null);
                  setRuntimeError(null);

                  void (async () => {
                    try {
                      const profileResponse = await getOpencodeProfile(workspaceRoot);
                      const profileToApply =
                        profileResponse.ok && profileResponse.profile
                          ? resolveProfileForApply(profileResponse.profile)
                          : resolveProfileForApply(null);

                      const setProfileResponse = await setOpencodeProfile(workspaceRoot, {
                        patch: profileToApply,
                      });
                      if (!setProfileResponse.ok || !setProfileResponse.profile) {
                        setRuntimeError(setProfileResponse.error ?? "OpenCode apply failed while preparing profile.");
                        return;
                      }

                      const syncResponse = await syncOpencodeConfig(workspaceRoot);
                      if (!syncResponse.ok || !syncResponse.result) {
                        setRuntimeError(syncResponse.error ?? "OpenCode apply failed while syncing config.");
                        return;
                      }

                      setRuntimeMessage(syncResponse.result.message);
                      await refreshRuntime();
                    } catch {
                      setRuntimeError("OpenCode apply failed.");
                    } finally {
                      setApplyPending(false);
                    }
                  })();
                }}
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspaceRoot || runtimeBusy || Boolean(statusData?.sanity.applied)}
                onClick={() => {
                  if (!workspaceRoot) {
                    return;
                  }

                  setRepairPending(true);
                  setRuntimeMessage(null);
                  setRuntimeError(null);

                  void (async () => {
                    try {
                      const response = await repairOpencodeIntegration(workspaceRoot);
                      if (!response.ok || !response.result) {
                        setRuntimeError(response.error ?? "OpenCode repair failed.");
                        return;
                      }

                      const backupText = response.result.backupPath ? ` Backup: ${response.result.backupPath}` : "";
                      setRuntimeMessage(
                        response.result.repaired
                          ? `OpenCode repair completed.${backupText}`
                          : `Repair attempted but sanity is still failing.${backupText}`,
                      );
                      await refreshRuntime();
                    } catch {
                      setRuntimeError("OpenCode repair failed.");
                    } finally {
                      setRepairPending(false);
                    }
                  })();
                }}
              >
                Repair
              </Button>
            </div>

            {runtimeMessage ? <p className="text-xs text-green-800">{runtimeMessage}</p> : null}
            {runtimeError ? <p className="text-xs text-destructive">{runtimeError}</p> : null}
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
