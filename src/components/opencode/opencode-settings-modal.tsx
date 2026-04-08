"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
  opencodeCopySkills,
  opencodeListSkills,
  opencodeUpdateGlobalSettings,
  opencodeUpdateWorkspaceSettings,
  type OpencodeEffectiveScope,
  type OpencodeSkillScope,
  type OpencodeSettings,
  validateOpencodeSettingsDirectory,
} from "@/src/lib/ipc";

type OpencodeSettingsModalProps = {
  open: boolean;
  workspaceRoot: string | null;
  effectiveScope: OpencodeEffectiveScope;
  workspaceSettings: OpencodeSettings;
  globalSettings: OpencodeSettings;
  statusMessage: string | null;
  errorMessage: string | null;
  onSettingsSaved: (message: string) => void;
  onOpenChange: (open: boolean) => void;
};

type SkillListItem = OpencodeSkillScope["skills"][number] & {
  virtualIncoming: boolean;
};


function defaultGlobalSkillsPathFromSettingsDirectory(settingsDirectory: string): string {
  const normalized = settingsDirectory.trim();
  return normalized.length > 0 ? `${normalized}/skills` : `${DEFAULT_OPENCODE_SETTINGS_DIRECTORY}/skills`;
}

function defaultWorkspaceSkillsPath(workspaceRoot: string | null): string {
  if (!workspaceRoot) {
    return "./.opencode/skill";
  }
  return `${workspaceRoot}/.opencode/skill`;
}

function workspaceSkillsStorageKey(workspaceRoot: string | null): string {
  return workspaceRoot ? `groove:opencode:workspace-skills-path:${workspaceRoot}` : "groove:opencode:workspace-skills-path:default";
}

function globalSkillsStorageKey(): string {
  return "groove:opencode:global-skills-path";
}

export function OpencodeSettingsModal({
  open,
  workspaceRoot,
  effectiveScope,
  workspaceSettings,
  globalSettings,
  statusMessage,
  errorMessage,
  onSettingsSaved,
  onOpenChange,
}: OpencodeSettingsModalProps) {
  const [savePending, setSavePending] = useState(false);
  const [validationPending, setValidationPending] = useState(false);
  const [settingsDirectory, setSettingsDirectory] = useState(DEFAULT_OPENCODE_SETTINGS_DIRECTORY);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [globalSkillsPath, setGlobalSkillsPath] = useState(`${DEFAULT_OPENCODE_SETTINGS_DIRECTORY}/skills`);
  const [workspaceSkillsPath, setWorkspaceSkillsPath] = useState("./.opencode/skill");
  const [globalSkillsScope, setGlobalSkillsScope] = useState<OpencodeSkillScope | null>(null);
  const [workspaceSkillsScope, setWorkspaceSkillsScope] = useState<OpencodeSkillScope | null>(null);
  const [globalMarkedSkills, setGlobalMarkedSkills] = useState<string[]>([]);
  const [workspaceMarkedSkills, setWorkspaceMarkedSkills] = useState<string[]>([]);

  const selectedSettings = useMemo<OpencodeSettings>(() => {
    if (effectiveScope === "workspace") {
      return workspaceSettings;
    }
    if (effectiveScope === "global") {
      return globalSettings;
    }
    return globalSettings;
  }, [effectiveScope, globalSettings, workspaceSettings]);


  useEffect(() => {
    if (!open) {
      return;
    }

    setSettingsDirectory(selectedSettings.settingsDirectory || DEFAULT_OPENCODE_SETTINGS_DIRECTORY);
    setValidationMessage(null);
    setValidationError(null);
    setGlobalMarkedSkills([]);
    setWorkspaceMarkedSkills([]);
  }, [open, selectedSettings.settingsDirectory]);

  const loadSkillsScopes = (globalPath: string, workspacePath: string) => {
    setSkillsLoading(true);
    setSkillsError(null);

    void (async () => {
      try {
        const response = await opencodeListSkills(workspaceRoot, globalPath, workspacePath);
        if (!response.ok) {
          setGlobalSkillsScope(null);
          setWorkspaceSkillsScope(null);
          setSkillsError(response.error ?? "Failed to load Opencode skills.");
          return;
        }

        setGlobalSkillsScope(response.globalScope ?? null);
        setWorkspaceSkillsScope(response.workspaceScope ?? null);
      } catch {
        setGlobalSkillsScope(null);
        setWorkspaceSkillsScope(null);
        setSkillsError("Failed to load Opencode skills.");
      } finally {
        setSkillsLoading(false);
      }
    })();
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const globalDefaultPath = defaultGlobalSkillsPathFromSettingsDirectory(
      selectedSettings.settingsDirectory || DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
    );
    const workspaceDefaultPath = defaultWorkspaceSkillsPath(workspaceRoot);

    let storedGlobalPath: string | null = null;
    let storedWorkspacePath: string | null = null;

    if (typeof window !== "undefined") {
      storedGlobalPath = window.localStorage.getItem(globalSkillsStorageKey());
      storedWorkspacePath = window.localStorage.getItem(workspaceSkillsStorageKey(workspaceRoot));
    }

    const normalizedGlobalPath = (storedGlobalPath && storedGlobalPath.trim()) || globalSkillsPath.trim() || globalDefaultPath;
    const normalizedWorkspacePath =
      (storedWorkspacePath && storedWorkspacePath.trim()) || workspaceSkillsPath.trim() || workspaceDefaultPath;

    setGlobalSkillsPath(normalizedGlobalPath);
    setWorkspaceSkillsPath(normalizedWorkspacePath);
    loadSkillsScopes(normalizedGlobalPath, normalizedWorkspacePath);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes paths and loader to avoid infinite re-renders
  }, [open, workspaceRoot, selectedSettings.settingsDirectory]);

  const settingsBusy = savePending || validationPending;

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
          <section className="space-y-3 rounded-md border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Opencode settings directory</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="opencode-settings-directory" className="text-xs font-medium text-foreground">
                Directory path
              </label>
              <Input
                id="opencode-settings-directory"
                value={settingsDirectory}
                onChange={(event) => {
                  setSettingsDirectory(event.target.value);
                  setValidationMessage(null);
                  setValidationError(null);
                }}
                placeholder={DEFAULT_OPENCODE_SETTINGS_DIRECTORY}
                disabled={settingsBusy}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Default path: <code>{DEFAULT_OPENCODE_SETTINGS_DIRECTORY}</code>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={settingsBusy}
                onClick={() => {
                  setValidationPending(true);
                  setValidationMessage(null);
                  setValidationError(null);

                  void (async () => {
                    try {
                      const response = await validateOpencodeSettingsDirectory(settingsDirectory, workspaceRoot);
                      if (!response.ok) {
                        const resolvedText = response.resolvedPath ? ` Resolved path: ${response.resolvedPath}` : "";
                        const existenceText =
                          response.directoryExists && !response.opencodeConfigExists
                            ? " Directory exists but opencode.json is missing."
                            : "";
                        setValidationError(
                          `${response.error ?? "Invalid Opencode settings directory."}${existenceText}${resolvedText}`,
                        );
                        return;
                      }

                      setValidationMessage(
                        response.resolvedPath
                          ? `Validated Opencode settings directory at ${response.resolvedPath}.`
                          : "Validated Opencode settings directory.",
                      );
                    } catch {
                      setValidationError("Failed to validate Opencode settings directory.");
                    } finally {
                      setValidationPending(false);
                    }
                  })();
                }}
              >
                Validate
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={settingsBusy}
                onClick={() => {
                  const normalizedDirectory = settingsDirectory.trim() || DEFAULT_OPENCODE_SETTINGS_DIRECTORY;
                  const shouldUseWorkspaceScope = effectiveScope === "workspace" && workspaceRoot != null;
                  const settingsSource = shouldUseWorkspaceScope ? workspaceSettings : globalSettings;

                  setSavePending(true);
                  setValidationMessage(null);
                  setValidationError(null);

                  void (async () => {
                    try {
                      if (shouldUseWorkspaceScope && workspaceRoot) {
                        const response = await opencodeUpdateWorkspaceSettings({
                          enabled: settingsSource.enabled,
                          defaultModel: settingsSource.defaultModel ?? null,
                          settingsDirectory: normalizedDirectory,
                        });

                        if (!response.ok) {
                          setValidationError(response.error ?? "Failed to save Opencode settings directory.");
                          return;
                        }
                      } else {
                        const response = await opencodeUpdateGlobalSettings({
                          enabled: settingsSource.enabled,
                          defaultModel: settingsSource.defaultModel ?? null,
                          settingsDirectory: normalizedDirectory,
                        });

                        if (!response.ok) {
                          setValidationError(response.error ?? "Failed to save Opencode settings directory.");
                          return;
                        }
                      }

                      setSettingsDirectory(normalizedDirectory);
                      setValidationMessage("Opencode settings directory saved.");
                      onSettingsSaved("Opencode settings updated.");
                    } catch {
                      setValidationError("Failed to save Opencode settings directory.");
                    } finally {
                      setSavePending(false);
                    }
                  })();
                }}
              >
                Save path
              </Button>
            </div>

            {validationMessage ? <p className="text-xs text-green-800">{validationMessage}</p> : null}
            {validationError ? <p className="text-xs text-destructive">{validationError}</p> : null}
          </section>

          <section className="space-y-3 rounded-md border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Skills visualizer</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="global-skills-path" className="text-xs font-medium text-foreground">
                  Global skills path
                </label>
                <Input
                  id="global-skills-path"
                  value={globalSkillsPath}
                  onChange={(event) => setGlobalSkillsPath(event.target.value)}
                  disabled={skillsLoading}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="workspace-skills-path" className="text-xs font-medium text-foreground">
                  Workspace skills path
                </label>
                <Input
                  id="workspace-skills-path"
                  value={workspaceSkillsPath}
                  onChange={(event) => setWorkspaceSkillsPath(event.target.value)}
                  disabled={skillsLoading}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={skillsLoading}
                onClick={() => {
                  const normalizedGlobalPath = globalSkillsPath.trim() || `${DEFAULT_OPENCODE_SETTINGS_DIRECTORY}/skills`;
                  const normalizedWorkspacePath = workspaceSkillsPath.trim() || defaultWorkspaceSkillsPath(workspaceRoot);
                  setGlobalSkillsPath(normalizedGlobalPath);
                  setWorkspaceSkillsPath(normalizedWorkspacePath);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(globalSkillsStorageKey(), normalizedGlobalPath);
                    window.localStorage.setItem(workspaceSkillsStorageKey(workspaceRoot), normalizedWorkspacePath);
                  }

                  void (async () => {
                    if (globalMarkedSkills.length > 0 || workspaceMarkedSkills.length > 0) {
                      try {
                        setSkillsLoading(true);
                        setSkillsError(null);
                        const copyResponse = await opencodeCopySkills({
                          globalSkillsPath: normalizedGlobalPath,
                          workspaceSkillsPath: normalizedWorkspacePath,
                          globalToWorkspace: globalMarkedSkills,
                          workspaceToGlobal: workspaceMarkedSkills,
                        });

                        if (!copyResponse.ok) {
                          setSkillsError(copyResponse.error ?? "Failed to copy selected skills.");
                          setSkillsLoading(false);
                          return;
                        }

                        setValidationMessage(
                          `Copied ${copyResponse.copiedToWorkspace} to workspace and ${copyResponse.copiedToGlobal} to global.`,
                        );
                        setGlobalMarkedSkills([]);
                        setWorkspaceMarkedSkills([]);
                      } catch {
                        setSkillsError("Failed to copy selected skills.");
                        setSkillsLoading(false);
                        return;
                      }
                    }

                    loadSkillsScopes(normalizedGlobalPath, normalizedWorkspacePath);
                  })();
                }}
              >
                Reload skills
              </Button>
            </div>

            {skillsLoading ? <p className="text-xs text-muted-foreground">Loading skills...</p> : null}
            {skillsError ? <p className="text-xs text-destructive">{skillsError}</p> : null}

            <div className="grid gap-3 md:grid-cols-2">
              {globalSkillsScope ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Global scope</p>
                  <p className="text-xs text-muted-foreground">
                    Skills directory: <code>{globalSkillsScope.skillsPath}</code>
                  </p>
                  {!globalSkillsScope.skillsDirectoryExists ? (
                    <p className="text-xs text-muted-foreground">No skills directory found.</p>
                  ) : null}
                  {globalSkillsScope.skillsDirectoryExists && globalSkillsScope.skills.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No skills found in this scope.</p>
                  ) : null}
                  {globalSkillsScope.skills.length > 0 ? (
                    <div className="min-h-56 max-h-56 overflow-y-auto rounded-md border border-border/60 p-2">
                      <ul className="space-y-1">
                        {Array.from(new Map<string, SkillListItem>([
                          ...globalSkillsScope.skills.map((skill): [string, SkillListItem] => [
                            skill.name,
                            { ...skill, virtualIncoming: false },
                          ]),
                          ...workspaceMarkedSkills.map((name): [string, SkillListItem] => [
                            name,
                            {
                              name,
                              path: `incoming:${name}`,
                              isDirectory: true,
                              hasSkillMarkdown: false,
                              virtualIncoming: true,
                            },
                          ]),
                        ]).values()).map((skill) => {
                          const isMarked = globalMarkedSkills.includes(skill.name);
                          const movedFromWorkspace = workspaceMarkedSkills.includes(skill.name);
                          const textColorClass = movedFromWorkspace
                            ? "text-blue-600"
                            : isMarked
                              ? "text-green-600"
                              : "text-foreground";
                          const className = [
                            "cursor-pointer rounded px-2 py-1 text-xs transition-colors hover:bg-muted",
                            textColorClass,
                          ].join(" ");

                          return (
                            <li
                              key={skill.path}
                              className={className}
                              onClick={() => {
                                if (skill.virtualIncoming) {
                                  return;
                                }
                                setGlobalMarkedSkills((current) =>
                                  current.includes(skill.name)
                                    ? current.filter((name) => name !== skill.name)
                                    : [...current, skill.name],
                                );
                              }}
                            >
                              {skill.name} <span className="text-muted-foreground">({skill.isDirectory ? "dir" : "file"})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {workspaceSkillsScope ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Workspace scope</p>
                  <p className="text-xs text-muted-foreground">
                    Skills directory: <code>{workspaceSkillsScope.skillsPath}</code>
                  </p>
                  {!workspaceSkillsScope.skillsDirectoryExists ? (
                    <p className="text-xs text-muted-foreground">No skills directory found.</p>
                  ) : null}
                  {workspaceSkillsScope.skillsDirectoryExists && workspaceSkillsScope.skills.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No skills found in this scope.</p>
                  ) : null}
                  {workspaceSkillsScope.skills.length > 0 ? (
                    <div className="min-h-56 max-h-56 overflow-y-auto rounded-md border border-border/60 p-2">
                      <ul className="space-y-1">
                        {Array.from(new Map<string, SkillListItem>([
                          ...workspaceSkillsScope.skills.map((skill): [string, SkillListItem] => [
                            skill.name,
                            { ...skill, virtualIncoming: false },
                          ]),
                          ...globalMarkedSkills.map((name): [string, SkillListItem] => [
                            name,
                            {
                              name,
                              path: `incoming:${name}`,
                              isDirectory: true,
                              hasSkillMarkdown: false,
                              virtualIncoming: true,
                            },
                          ]),
                        ]).values()).map((skill) => {
                          const isMarked = workspaceMarkedSkills.includes(skill.name);
                          const movedFromGlobal = globalMarkedSkills.includes(skill.name);
                          const textColorClass = movedFromGlobal
                            ? "text-blue-600"
                            : isMarked
                              ? "text-green-600"
                              : "text-foreground";
                          const className = [
                            "cursor-pointer rounded px-2 py-1 text-xs transition-colors hover:bg-muted",
                            textColorClass,
                          ].join(" ");

                          return (
                            <li
                              key={skill.path}
                              className={className}
                              onClick={() => {
                                if (skill.virtualIncoming) {
                                  return;
                                }
                                setWorkspaceMarkedSkills((current) =>
                                  current.includes(skill.name)
                                    ? current.filter((name) => name !== skill.name)
                                    : [...current, skill.name],
                                );
                              }}
                            >
                              {skill.name} <span className="text-muted-foreground">({skill.isDirectory ? "dir" : "file"})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="">
                  <p className="text-xs text-muted-foreground">Workspace scope appears only when this workspace has a <code>.opencode</code> folder.</p>
                </div>
              )}
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
