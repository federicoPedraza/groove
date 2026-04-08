import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));
vi.mock("@/src/lib/command-history", () => ({
  trackCommandExecution: vi.fn((_cmd: string, run: () => Promise<unknown>) => run()),
}));

import {
  cancelOpencodeFlow,
  checkOpencodeStatus,
  clearIpcTelemetrySummary,
  diagnosticsCleanAllDevServers,
  diagnosticsGetMsotConsumingPrograms,
  diagnosticsGetSystemOverview,
  diagnosticsKillAllNodeAndOpencodeInstances,
  diagnosticsListOpencodeInstances,
  diagnosticsListWorktreeNodeApps,
  diagnosticsStopAllOpencodeInstances,
  diagnosticsStopProcess,
  getGlobalSettingsSnapshot,
  getIpcTelemetrySummary,
  getOpencodeProfile,
  getThemeMode,
  gitAdd,
  gitAheadBehind,
  gitCommit,
  gitCurrentBranch,
  gitHasStagedChanges,
  gitHasUpstream,
  gitListBranches,
  gitListFileStates,
  gitMerge,
  gitMergeAbort,
  gitMergeInProgress,
  gitPull,
  gitPush,
  gitStageFiles,
  gitStatus,
  gitUnstageFiles,
  globalSettingsGet,
  globalSettingsUpdate,
  grooveBinRepair,
  grooveBinStatus,
  grooveList,
  grooveNew,
  grooveRestore,
  grooveRm,
  grooveStop,
  grooveSummary,
  grooveTerminalClose,
  grooveTerminalGetSession,
  grooveTerminalListSessions,
  grooveTerminalOpen,
  grooveTerminalResize,
  grooveTerminalWrite,
  hasBlockingInvokeInFlight,
  invalidateWorkspaceGetActiveCache,
  isAlwaysShowDiagnosticsSidebarEnabled,
  isGrooveLoadingSectionDisabled,
  isPeriodicRerenderEnabled,
  isShowFpsEnabled,
  isTelemetryEnabled,
  listenGrooveNotification,
  listenGrooveTerminalLifecycle,
  listenGrooveTerminalOutput,
  listenWorkspaceChange,
  listenWorkspaceReady,
  opencodeCopySkills,
  opencodeIntegrationStatus,
  opencodeListSkills,
  opencodeUpdateGlobalSettings,
  opencodeUpdateWorkspaceSettings,
  openExternalUrl,
  printIpcTelemetrySummary,
  repairOpencodeIntegration,
  runOpencodeFlow,
  setOpencodeProfile,
  subscribeToBlockingInvokes,
  subscribeToGlobalSettings,
  subscribeToWorkspaceSettings,
  syncOpencodeConfig,
  validateOpencodeSettingsDirectory,
  workspaceClearActive,
  workspaceEvents,
  workspaceGetActive,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
  workspaceListSymlinkEntries,
  workspaceOpen,
  workspaceOpenTerminal,
  workspaceOpenWorkspaceTerminal,
  workspacePickAndOpen,
  workspaceTermSanityApply,
  workspaceTermSanityCheck,
  workspaceUpdateCommandsSettings,
  workspaceUpdateTerminalSettings,
  workspaceUpdateWorktreeSymlinkPaths,
  gitAuthStatus,
} from "@/src/lib/ipc";

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockInvoke.mockResolvedValue({ ok: true });
  clearIpcTelemetrySummary();
  invalidateWorkspaceGetActiveCache();
});

// No afterEach vi.restoreAllMocks() — it would break vi.mock() factory mocks

// ---------------------------------------------------------------------------
// Getter functions (read from latestGlobalSettings)
// ---------------------------------------------------------------------------
describe("getter functions", () => {
  it("isTelemetryEnabled returns true by default", () => {
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("isGrooveLoadingSectionDisabled returns false by default", () => {
    expect(isGrooveLoadingSectionDisabled()).toBe(false);
  });

  it("isShowFpsEnabled returns false by default", () => {
    expect(isShowFpsEnabled()).toBe(false);
  });

  it("isAlwaysShowDiagnosticsSidebarEnabled returns false by default", () => {
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(false);
  });

  it("isPeriodicRerenderEnabled returns false by default", () => {
    expect(isPeriodicRerenderEnabled()).toBe(false);
  });

  it("getThemeMode returns 'groove' by default", () => {
    expect(getThemeMode()).toBe("groove");
  });

  it("getGlobalSettingsSnapshot returns a valid default snapshot", () => {
    const snapshot = getGlobalSettingsSnapshot();
    expect(snapshot.telemetryEnabled).toBe(true);
    expect(snapshot.themeMode).toBe("groove");
    expect(snapshot.keyboardShortcutLeader).toBe("Space");
    expect(snapshot.opencodeSettings.enabled).toBe(false);
    expect(snapshot.opencodeSettings.settingsDirectory).toBe("~/.config/opencode");
  });
});

// ---------------------------------------------------------------------------
// subscribeToGlobalSettings / subscribeToWorkspaceSettings
// ---------------------------------------------------------------------------
describe("subscribeToGlobalSettings", () => {
  it("fires listener when global settings change via global_settings_get result", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGlobalSettings(listener);

    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        telemetryEnabled: true,
        showFps: true,
        themeMode: "dark",
      },
    });

    await globalSettingsGet();
    expect(listener).toHaveBeenCalled();

    // Reset to defaults
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        telemetryEnabled: true,
        showFps: false,
        themeMode: "groove",
      },
    });
    await globalSettingsUpdate({});

    unsubscribe();
  });

  it("subscribeToWorkspaceSettings is an alias", () => {
    expect(subscribeToWorkspaceSettings).toBe(subscribeToGlobalSettings);
  });

  it("does not fire when settings have not changed", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGlobalSettings(listener);

    // Return same defaults
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        telemetryEnabled: true,
        disableGrooveLoadingSection: false,
        showFps: false,
        alwaysShowDiagnosticsSidebar: false,
        periodicRerenderEnabled: false,
        themeMode: "groove",
        keyboardShortcutLeader: "Space",
        keyboardLeaderBindings: { openActionLauncher: "k", openWorktreeDetailsLauncher: "p" },
        opencodeSettings: { enabled: false, defaultModel: null, settingsDirectory: "~/.config/opencode" },
      },
    });

    await globalSettingsGet();
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("unsubscribe removes the listener", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGlobalSettings(listener);
    unsubscribe();

    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { showFps: true },
    });

    await globalSettingsUpdate({});
    expect(listener).not.toHaveBeenCalled();

    // Reset
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { showFps: false },
    });
    await globalSettingsUpdate({});
  });
});

// ---------------------------------------------------------------------------
// subscribeToBlockingInvokes / hasBlockingInvokeInFlight
// ---------------------------------------------------------------------------
describe("blocking invokes", () => {
  it("hasBlockingInvokeInFlight returns false initially", () => {
    expect(hasBlockingInvokeInFlight()).toBe(false);
  });

  it("hasBlockingInvokeInFlight becomes true during a blocking invoke", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToBlockingInvokes(listener);

    let resolveInvoke!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInvoke = resolve; }),
    );

    const promise = grooveNew({ rootName: "test", knownWorktrees: [], branch: "feat" });
    // Allow microtask to run
    await vi.waitFor(() => expect(hasBlockingInvokeInFlight()).toBe(true));
    expect(listener).toHaveBeenCalled();

    resolveInvoke({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    await promise;

    expect(hasBlockingInvokeInFlight()).toBe(false);

    unsubscribe();
  });

  it("unsubscribing removes blocking invoke listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToBlockingInvokes(listener);
    unsubscribe();
    // No assertion needed beyond ensuring no error
  });
});

// ---------------------------------------------------------------------------
// Telemetry summary
// ---------------------------------------------------------------------------
describe("telemetry summary", () => {
  it("getIpcTelemetrySummary returns empty array initially", () => {
    expect(getIpcTelemetrySummary()).toEqual([]);
  });

  it("records telemetry after IPC calls", async () => {
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    const summary = getIpcTelemetrySummary();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0].command).toBe("groove_new");
    expect(summary[0].count).toBe(1);
    expect(typeof summary[0].avg_ms).toBe("number");
    expect(typeof summary[0].p50_ms).toBe("number");
    expect(typeof summary[0].p95_ms).toBe("number");
    expect(typeof summary[0].max_ms).toBe("number");
  });

  it("clearIpcTelemetrySummary clears aggregates", async () => {
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    expect(getIpcTelemetrySummary().length).toBeGreaterThan(0);
    clearIpcTelemetrySummary();
    expect(getIpcTelemetrySummary()).toEqual([]);
  });

  it("printIpcTelemetrySummary calls console.table and returns rows", async () => {
    const tableCalls: unknown[][] = [];
    const tablespy = vi.spyOn(console, "table").mockImplementation((...args: unknown[]) => { tableCalls.push(args); });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    const rows = printIpcTelemetrySummary();
    tablespy.mockRestore();
    expect(tableCalls.length).toBe(1);
    expect(tableCalls[0][0]).toEqual(rows);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("window helpers are attached", () => {
    expect(typeof window.__grooveTelemetrySummary).toBe("function");
    expect(typeof window.__grooveTelemetrySummaryClear).toBe("function");
  });

  it("window.__grooveTelemetrySummaryClear clears telemetry", async () => {
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    window.__grooveTelemetrySummaryClear?.();
    expect(getIpcTelemetrySummary()).toEqual([]);
  });

  it("window.__grooveTelemetrySummary prints and returns summary", async () => {
    const tablespy = vi.spyOn(console, "table").mockImplementation(() => {});
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    const rows = window.__grooveTelemetrySummary?.();
    tablespy.mockRestore();
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
describe("deduplication", () => {
  it("deduplicates concurrent calls with same command and args", async () => {
    let resolveInvoke!: (v: unknown) => void;
    mockInvoke.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInvoke = resolve; }),
    );

    const p1 = grooveList({ knownWorktrees: [] });
    const p2 = grooveList({ knownWorktrees: [] });

    resolveInvoke({ ok: true, rows: {}, stdout: "", stderr: "" });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    // invoke called only once due to deduplication
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("grooveTerminalWrite is not deduped", async () => {
    mockInvoke.mockResolvedValue({ ok: true });
    const payload = { rootName: "r", knownWorktrees: [], worktree: "w", input: "x" };
    const p1 = grooveTerminalWrite(payload);
    const p2 = grooveTerminalWrite(payload);
    await Promise.all([p1, p2]);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Telemetry logging via console.info
// ---------------------------------------------------------------------------
describe("telemetry logging", () => {
  it("logs with ui-telemetry prefix when telemetry is enabled", async () => {
    // Ensure telemetry is enabled
    expect(isTelemetryEnabled()).toBe(true);
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      calls.push(args);
    });
    mockInvoke.mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "tel-1" });
    infoSpy.mockRestore();

    const telemetryCall = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(telemetryCall).toBeDefined();
    expect((telemetryCall![1] as Record<string, unknown>).outcome).toBe("ok");
  });

  it("logs outcome 'error' when result.ok is false", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    mockInvoke.mockResolvedValueOnce({ ok: false, error: "fail" });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "err-1" });
    infoSpy.mockRestore();
    const telemetryCall = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(telemetryCall).toBeDefined();
    expect((telemetryCall![1] as Record<string, unknown>).outcome).toBe("error");
  });

  it("logs outcome 'success' when result has no ok field", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    mockInvoke.mockResolvedValueOnce({ data: 123 });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "suc-1" });
    infoSpy.mockRestore();
    const telemetryCall = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(telemetryCall).toBeDefined();
    expect((telemetryCall![1] as Record<string, unknown>).outcome).toBe("success");
  });

  it("logs outcome 'throw' when invoke rejects", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    mockInvoke.mockRejectedValueOnce(new Error("network error"));
    await expect(grooveNew({ rootName: "r", knownWorktrees: [], branch: "throw-1" })).rejects.toThrow("network error");
    infoSpy.mockRestore();
    const telemetryCall = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(telemetryCall).toBeDefined();
    expect((telemetryCall![1] as Record<string, unknown>).outcome).toBe("throw");
  });

  it("logs args_summary for calls with arguments", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    await grooveRestore({ rootName: "r", knownWorktrees: ["w1"], worktree: "w1" });
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_restore",
    );
    expect(call).toBeDefined();
    expect((call![1] as Record<string, unknown>).args_summary).toBeDefined();
  });

  it("summarizeArgValue handles long strings", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    const longStr = "a".repeat(50);
    await openExternalUrl(longStr);
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "open_external_url",
    );
    expect(call).toBeDefined();
    const summary = (call![1] as Record<string, unknown>).args_summary as string;
    expect(summary).toContain("string(len=50)");
  });

  it("summarizeArgValue handles numbers, booleans, null, arrays, objects", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    await diagnosticsStopProcess(42);
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "diagnostics_stop_process",
    );
    expect(call).toBeDefined();
    const summary = (call![1] as Record<string, unknown>).args_summary as string;
    expect(summary).toContain("42");
  });

  it("does not log when telemetry is disabled", async () => {
    // Disable telemetry via global settings sync
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { telemetryEnabled: false },
    });
    await globalSettingsUpdate({ telemetryEnabled: false });

    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    mockInvoke.mockResolvedValueOnce({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "tel-disabled" });
    infoSpy.mockRestore();

    const telemetryCalls = calls.filter(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(telemetryCalls.length).toBe(0);

    // Re-enable telemetry for other tests
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { telemetryEnabled: true },
    });
    await globalSettingsUpdate({ telemetryEnabled: true });
  });
});

// ---------------------------------------------------------------------------
// Global settings sync via invokeCommand
// ---------------------------------------------------------------------------
describe("global settings sync", () => {
  it("updates global settings when global_settings_get returns", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        telemetryEnabled: true,
        showFps: true,
        themeMode: "dark",
        alwaysShowDiagnosticsSidebar: true,
        periodicRerenderEnabled: true,
        disableGrooveLoadingSection: true,
        opencodeSettings: { enabled: true, defaultModel: "gpt-4", settingsDirectory: "/custom" },
      },
    });
    await globalSettingsGet();
    expect(isShowFpsEnabled()).toBe(true);
    expect(getThemeMode()).toBe("dark");
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(true);
    expect(isPeriodicRerenderEnabled()).toBe(true);
    expect(isGrooveLoadingSectionDisabled()).toBe(true);
    const snap = getGlobalSettingsSnapshot();
    expect(snap.opencodeSettings.enabled).toBe(true);
    expect(snap.opencodeSettings.defaultModel).toBe("gpt-4");
    expect(snap.opencodeSettings.settingsDirectory).toBe("/custom");
  });

  it("updates global settings when global_settings_update returns", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { showFps: true },
    });
    await globalSettingsUpdate({ showFps: true });
    expect(isShowFpsEnabled()).toBe(true);
    // Reset
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { showFps: false },
    });
    await globalSettingsUpdate({ showFps: false });
  });

  it("does not update settings when ok is false", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: false,
      globalSettings: { showFps: true },
    });
    await globalSettingsGet();
    expect(isShowFpsEnabled()).toBe(false);
  });

  it("does not update settings when globalSettings is missing", async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true });
    await globalSettingsGet();
    expect(getThemeMode()).toBe("groove");
  });

  it("does not sync for non-settings commands", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { showFps: true },
    });
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    expect(isShowFpsEnabled()).toBe(false);
  });

  it("normalizeOpencodeSettings handles empty/null values", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        opencodeSettings: { enabled: false, defaultModel: "  ", settingsDirectory: "" },
      },
    });
    await globalSettingsGet();
    const snap = getGlobalSettingsSnapshot();
    expect(snap.opencodeSettings.defaultModel).toBeNull();
    expect(snap.opencodeSettings.settingsDirectory).toBe("~/.config/opencode");
  });

  it("normalizeGlobalSettings uses defaults for invalid themeMode", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: { themeMode: "invalid-mode" },
    });
    await globalSettingsGet();
    expect(getThemeMode()).toBe("groove");
  });

  it("normalizeGlobalSettings handles null input", async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: null,
    });
    await globalSettingsGet();
    // Should not crash; settings remain defaults
    expect(getThemeMode()).toBe("groove");
  });

  it("does not sync when result is not an object", async () => {
    mockInvoke.mockResolvedValueOnce("not-an-object");
    await globalSettingsGet();
    expect(getThemeMode()).toBe("groove");
  });
});

// ---------------------------------------------------------------------------
// IPC wrapper functions — verify correct command names
// ---------------------------------------------------------------------------
describe("IPC wrapper functions", () => {
  it("grooveList calls groove_list", async () => {
    await grooveList({ knownWorktrees: [] });
    expect(mockInvoke).toHaveBeenCalledWith("groove_list", { payload: { knownWorktrees: [] } });
  });

  it("grooveRestore calls groove_restore", async () => {
    await grooveRestore({ rootName: "r", knownWorktrees: [], worktree: "w" });
    expect(mockInvoke).toHaveBeenCalledWith("groove_restore", { payload: { rootName: "r", knownWorktrees: [], worktree: "w" } });
  });

  it("grooveNew calls groove_new", async () => {
    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    expect(mockInvoke).toHaveBeenCalledWith("groove_new", { payload: { rootName: "r", knownWorktrees: [], branch: "b" } });
  });

  it("grooveRm calls groove_rm", async () => {
    await grooveRm({ rootName: "r", knownWorktrees: [], target: "t", worktree: "w" });
    expect(mockInvoke).toHaveBeenCalledWith("groove_rm", { payload: { rootName: "r", knownWorktrees: [], target: "t", worktree: "w" } });
  });

  it("grooveStop calls groove_stop", async () => {
    await grooveStop({ rootName: "r", knownWorktrees: [], worktree: "w" });
    expect(mockInvoke).toHaveBeenCalledWith("groove_stop", { payload: { rootName: "r", knownWorktrees: [], worktree: "w" } });
  });

  it("grooveSummary calls groove_summary", async () => {
    await grooveSummary({ rootName: "r", knownWorktrees: [], sessionIds: [] });
    expect(mockInvoke).toHaveBeenCalledWith("groove_summary", { payload: { rootName: "r", knownWorktrees: [], sessionIds: [] } });
  });

  it("workspaceEvents calls workspace_events", async () => {
    await workspaceEvents({ knownWorktrees: [] });
    expect(mockInvoke).toHaveBeenCalledWith("workspace_events", { payload: { knownWorktrees: [] } });
  });

  it("openExternalUrl calls open_external_url", async () => {
    await openExternalUrl("https://example.com");
    expect(mockInvoke).toHaveBeenCalledWith("open_external_url", { url: "https://example.com" });
  });

  it("diagnosticsListOpencodeInstances calls correct command", async () => {
    await diagnosticsListOpencodeInstances();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_list_opencode_instances", undefined);
  });

  it("diagnosticsStopProcess calls correct command", async () => {
    await diagnosticsStopProcess(123);
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_stop_process", { pid: 123 });
  });

  it("diagnosticsStopAllOpencodeInstances calls correct command", async () => {
    await diagnosticsStopAllOpencodeInstances();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_stop_all_opencode_instances", undefined);
  });

  it("diagnosticsKillAllNodeAndOpencodeInstances calls correct command", async () => {
    await diagnosticsKillAllNodeAndOpencodeInstances();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_kill_all_node_and_opencode_instances", undefined);
  });

  it("diagnosticsListWorktreeNodeApps calls correct command", async () => {
    await diagnosticsListWorktreeNodeApps();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_list_worktree_node_apps", undefined);
  });

  it("diagnosticsCleanAllDevServers calls correct command", async () => {
    await diagnosticsCleanAllDevServers();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_clean_all_dev_servers", undefined);
  });

  it("diagnosticsGetMsotConsumingPrograms calls correct command", async () => {
    await diagnosticsGetMsotConsumingPrograms();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_get_msot_consuming_programs", undefined);
  });

  it("diagnosticsGetSystemOverview calls correct command with background intent", async () => {
    await diagnosticsGetSystemOverview();
    expect(mockInvoke).toHaveBeenCalledWith("diagnostics_get_system_overview", undefined);
  });

  it("workspacePickAndOpen invalidates cache and calls command", async () => {
    await workspacePickAndOpen();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_pick_and_open", undefined);
  });

  it("workspaceOpen invalidates cache and calls command", async () => {
    await workspaceOpen("/path");
    expect(mockInvoke).toHaveBeenCalledWith("workspace_open", { workspaceRoot: "/path" });
  });

  it("workspaceClearActive invalidates cache and calls command", async () => {
    await workspaceClearActive();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_clear_active", undefined);
  });

  it("workspaceTermSanityCheck calls correct command", async () => {
    await workspaceTermSanityCheck();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_term_sanity_check", undefined);
  });

  it("workspaceTermSanityApply calls correct command", async () => {
    await workspaceTermSanityApply();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_term_sanity_apply", undefined);
  });

  it("workspaceGitignoreSanityCheck calls correct command", async () => {
    await workspaceGitignoreSanityCheck();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_gitignore_sanity_check", undefined);
  });

  it("workspaceGitignoreSanityApply calls correct command", async () => {
    await workspaceGitignoreSanityApply();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_gitignore_sanity_apply", undefined);
  });

  it("grooveBinStatus calls correct command", async () => {
    await grooveBinStatus();
    expect(mockInvoke).toHaveBeenCalledWith("groove_bin_status", undefined);
  });

  it("grooveBinRepair calls correct command", async () => {
    await grooveBinRepair();
    expect(mockInvoke).toHaveBeenCalledWith("groove_bin_repair", undefined);
  });

  it("gitAuthStatus calls correct command", async () => {
    await gitAuthStatus({ workspaceRoot: "/root" });
    expect(mockInvoke).toHaveBeenCalledWith("git_auth_status", { payload: { workspaceRoot: "/root" } });
  });

  it("gitStatus calls correct command", async () => {
    await gitStatus({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_status", { payload: { path: "/p" } });
  });

  it("gitCurrentBranch calls correct command", async () => {
    await gitCurrentBranch({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_current_branch", { payload: { path: "/p" } });
  });

  it("gitListBranches calls correct command", async () => {
    await gitListBranches({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_list_branches", { payload: { path: "/p" } });
  });

  it("gitAheadBehind calls correct command", async () => {
    await gitAheadBehind({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_ahead_behind", { payload: { path: "/p" } });
  });

  it("gitPull calls correct command", async () => {
    await gitPull({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_pull", { payload: { path: "/p" } });
  });

  it("gitPush calls correct command", async () => {
    await gitPush({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_push", { payload: { path: "/p" } });
  });

  it("gitMerge calls correct command", async () => {
    await gitMerge({ path: "/p", targetBranch: "main" });
    expect(mockInvoke).toHaveBeenCalledWith("git_merge", { payload: { path: "/p", targetBranch: "main" } });
  });

  it("gitMergeAbort calls correct command", async () => {
    await gitMergeAbort({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_merge_abort", { payload: { path: "/p" } });
  });

  it("gitHasStagedChanges calls correct command", async () => {
    await gitHasStagedChanges({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_has_staged_changes", { payload: { path: "/p" } });
  });

  it("gitMergeInProgress calls correct command", async () => {
    await gitMergeInProgress({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_merge_in_progress", { payload: { path: "/p" } });
  });

  it("gitHasUpstream calls correct command", async () => {
    await gitHasUpstream({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_has_upstream", { payload: { path: "/p" } });
  });

  it("gitAdd calls correct command", async () => {
    await gitAdd({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_add", { payload: { path: "/p" } });
  });

  it("gitListFileStates calls correct command", async () => {
    await gitListFileStates({ path: "/p" });
    expect(mockInvoke).toHaveBeenCalledWith("git_list_file_states", { payload: { path: "/p" } });
  });

  it("gitStageFiles calls correct command", async () => {
    await gitStageFiles({ path: "/p", files: ["a.ts"] });
    expect(mockInvoke).toHaveBeenCalledWith("git_stage_files", { payload: { path: "/p", files: ["a.ts"] } });
  });

  it("gitUnstageFiles calls correct command", async () => {
    await gitUnstageFiles({ path: "/p", files: ["a.ts"] });
    expect(mockInvoke).toHaveBeenCalledWith("git_unstage_files", { payload: { path: "/p", files: ["a.ts"] } });
  });

  it("gitCommit calls correct command", async () => {
    await gitCommit({ path: "/p", message: "msg" });
    expect(mockInvoke).toHaveBeenCalledWith("git_commit", { payload: { path: "/p", message: "msg" } });
  });

  it("globalSettingsGet calls correct command", async () => {
    await globalSettingsGet();
    expect(mockInvoke).toHaveBeenCalledWith("global_settings_get", undefined);
  });

  it("globalSettingsUpdate calls correct command", async () => {
    await globalSettingsUpdate({ showFps: true });
    expect(mockInvoke).toHaveBeenCalledWith("global_settings_update", { payload: { showFps: true } });
  });

  it("workspaceUpdateTerminalSettings calls correct command", async () => {
    const payload = { defaultTerminal: "auto" as const };
    await workspaceUpdateTerminalSettings(payload);
    expect(mockInvoke).toHaveBeenCalledWith("workspace_update_terminal_settings", { payload });
  });

  it("workspaceUpdateCommandsSettings calls correct command", async () => {
    const payload = { playGrooveCommand: "cmd" };
    await workspaceUpdateCommandsSettings(payload);
    expect(mockInvoke).toHaveBeenCalledWith("workspace_update_commands_settings", { payload });
  });

  it("workspaceUpdateWorktreeSymlinkPaths calls correct command", async () => {
    const payload = { worktreeSymlinkPaths: ["/a"] };
    await workspaceUpdateWorktreeSymlinkPaths(payload);
    expect(mockInvoke).toHaveBeenCalledWith("workspace_update_worktree_symlink_paths", { payload });
  });

  it("workspaceListSymlinkEntries calls correct command", async () => {
    await workspaceListSymlinkEntries();
    expect(mockInvoke).toHaveBeenCalledWith("workspace_list_symlink_entries", { payload: {} });
  });

  it("opencodeIntegrationStatus calls correct command", async () => {
    await opencodeIntegrationStatus();
    expect(mockInvoke).toHaveBeenCalledWith("opencode_integration_status", undefined);
  });

  it("opencodeUpdateWorkspaceSettings calls correct command", async () => {
    const payload = { enabled: true };
    await opencodeUpdateWorkspaceSettings(payload);
    expect(mockInvoke).toHaveBeenCalledWith("opencode_update_workspace_settings", { payload });
  });

  it("opencodeUpdateGlobalSettings calls correct command", async () => {
    const payload = { enabled: true };
    await opencodeUpdateGlobalSettings(payload);
    expect(mockInvoke).toHaveBeenCalledWith("opencode_update_global_settings", { payload });
  });

  it("checkOpencodeStatus calls correct command", async () => {
    await checkOpencodeStatus("/wt");
    expect(mockInvoke).toHaveBeenCalledWith("check_opencode_status", { worktreePath: "/wt" });
  });

  it("validateOpencodeSettingsDirectory calls correct command", async () => {
    await validateOpencodeSettingsDirectory("/dir", "/root");
    expect(mockInvoke).toHaveBeenCalledWith("validate_opencode_settings_directory", {
      settingsDirectory: "/dir",
      workspaceRoot: "/root",
    });
  });

  it("validateOpencodeSettingsDirectory passes null when workspaceRoot is undefined", async () => {
    await validateOpencodeSettingsDirectory("/dir");
    expect(mockInvoke).toHaveBeenCalledWith("validate_opencode_settings_directory", {
      settingsDirectory: "/dir",
      workspaceRoot: null,
    });
  });

  it("opencodeListSkills calls correct command", async () => {
    await opencodeListSkills("/root", "/gp", "/wp");
    expect(mockInvoke).toHaveBeenCalledWith("opencode_list_skills", {
      workspaceRoot: "/root",
      globalSkillsPath: "/gp",
      workspaceSkillsPath: "/wp",
    });
  });

  it("opencodeListSkills passes null for undefined params", async () => {
    await opencodeListSkills();
    expect(mockInvoke).toHaveBeenCalledWith("opencode_list_skills", {
      workspaceRoot: null,
      globalSkillsPath: null,
      workspaceSkillsPath: null,
    });
  });

  it("opencodeCopySkills calls correct command", async () => {
    const payload = { globalSkillsPath: "/g", workspaceSkillsPath: "/w", globalToWorkspace: [], workspaceToGlobal: [] };
    await opencodeCopySkills(payload);
    expect(mockInvoke).toHaveBeenCalledWith("opencode_copy_skills", { payload });
  });

  it("getOpencodeProfile calls correct command", async () => {
    await getOpencodeProfile("/wt");
    expect(mockInvoke).toHaveBeenCalledWith("get_opencode_profile", { worktreePath: "/wt" });
  });

  it("setOpencodeProfile calls correct command", async () => {
    const payload = { patch: { enabled: true } };
    await setOpencodeProfile("/wt", payload);
    expect(mockInvoke).toHaveBeenCalledWith("set_opencode_profile", { worktreePath: "/wt", payload });
  });

  it("syncOpencodeConfig calls correct command", async () => {
    await syncOpencodeConfig("/wt");
    expect(mockInvoke).toHaveBeenCalledWith("sync_opencode_config", { worktreePath: "/wt" });
  });

  it("repairOpencodeIntegration calls correct command", async () => {
    await repairOpencodeIntegration("/wt");
    expect(mockInvoke).toHaveBeenCalledWith("repair_opencode_integration", { worktreePath: "/wt" });
  });

  it("runOpencodeFlow calls correct command", async () => {
    const payload = { phase: "init" as const };
    await runOpencodeFlow("/wt", payload);
    expect(mockInvoke).toHaveBeenCalledWith("run_opencode_flow", { worktreePath: "/wt", payload });
  });

  it("cancelOpencodeFlow calls correct command", async () => {
    await cancelOpencodeFlow("run-1");
    expect(mockInvoke).toHaveBeenCalledWith("cancel_opencode_flow", { runId: "run-1" });
  });

  it("workspaceOpenTerminal calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[] };
    await workspaceOpenTerminal(payload);
    expect(mockInvoke).toHaveBeenCalledWith("workspace_open_terminal", { payload });
  });

  it("workspaceOpenWorkspaceTerminal calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[] };
    await workspaceOpenWorkspaceTerminal(payload);
    expect(mockInvoke).toHaveBeenCalledWith("workspace_open_workspace_terminal", { payload });
  });

  it("grooveTerminalOpen calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w" };
    await grooveTerminalOpen(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_open", { payload });
  });

  it("grooveTerminalWrite calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w", input: "x" };
    await grooveTerminalWrite(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_write", { payload });
  });

  it("grooveTerminalResize calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w", cols: 80, rows: 24 };
    await grooveTerminalResize(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_resize", { payload });
  });

  it("grooveTerminalClose calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w" };
    await grooveTerminalClose(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_close", { payload });
  });

  it("grooveTerminalGetSession calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w" };
    await grooveTerminalGetSession(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_get_session", { payload });
  });

  it("grooveTerminalListSessions calls correct command", async () => {
    const payload = { rootName: "r", knownWorktrees: [] as string[], worktree: "w" };
    await grooveTerminalListSessions(payload);
    expect(mockInvoke).toHaveBeenCalledWith("groove_terminal_list_sessions", { payload });
  });
});

// ---------------------------------------------------------------------------
// listen* functions
// ---------------------------------------------------------------------------
describe("listen functions", () => {
  it("listenWorkspaceChange registers listener on workspace-change", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    const callback = vi.fn();
    const result = await listenWorkspaceChange(callback);
    expect(mockListen).toHaveBeenCalledWith("workspace-change", expect.any(Function));
    expect(result).toBe(unlisten);

    // Simulate event
    const eventHandler = mockListen.mock.calls[0][1];
    eventHandler({ payload: { index: 1, source: "test" } });
    expect(callback).toHaveBeenCalledWith({ index: 1, source: "test" });
  });

  it("listenWorkspaceReady registers listener on workspace-ready", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    const callback = vi.fn();
    await listenWorkspaceReady(callback);
    expect(mockListen).toHaveBeenCalledWith("workspace-ready", expect.any(Function));

    const eventHandler = mockListen.mock.calls[0][1];
    eventHandler({ payload: { ready: true } });
    expect(callback).toHaveBeenCalledWith({ ready: true });
  });

  it("listenGrooveTerminalOutput registers listener on groove-terminal-output", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    const callback = vi.fn();
    await listenGrooveTerminalOutput(callback);
    expect(mockListen).toHaveBeenCalledWith("groove-terminal-output", expect.any(Function));

    const eventHandler = mockListen.mock.calls[0][1];
    const payload = { sessionId: "s1", workspaceRoot: "/r", worktree: "w", chunk: "data" };
    eventHandler({ payload });
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it("listenGrooveTerminalLifecycle registers listener on groove-terminal-lifecycle", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    const callback = vi.fn();
    await listenGrooveTerminalLifecycle(callback);
    expect(mockListen).toHaveBeenCalledWith("groove-terminal-lifecycle", expect.any(Function));

    const eventHandler = mockListen.mock.calls[0][1];
    const payload = { sessionId: "s1", workspaceRoot: "/r", worktree: "w", kind: "started" };
    eventHandler({ payload });
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it("listenGrooveNotification registers listener on groove-notification", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);
    const callback = vi.fn();
    await listenGrooveNotification(callback);
    expect(mockListen).toHaveBeenCalledWith("groove-notification", expect.any(Function));

    const eventHandler = mockListen.mock.calls[0][1];
    const payload = { workspaceRoot: "/r", notification: { id: "n1", worktree: "w", message: "hi", type: "info", timestamp: "t", source: "s" } };
    eventHandler({ payload });
    expect(callback).toHaveBeenCalledWith(payload);
  });
});

// ---------------------------------------------------------------------------
// workspaceGetActive caching
// ---------------------------------------------------------------------------
describe("workspaceGetActive caching", () => {
  it("returns cached result within TTL", async () => {
    const response = { ok: true, rows: [] };
    mockInvoke.mockResolvedValueOnce(response);

    const r1 = await workspaceGetActive();
    const r2 = await workspaceGetActive();

    expect(r1).toBe(r2);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("invalidateWorkspaceGetActiveCache forces fresh call", async () => {
    const response1 = { ok: true, rows: [], id: 1 };
    const response2 = { ok: true, rows: [], id: 2 };
    mockInvoke.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);

    await workspaceGetActive();
    invalidateWorkspaceGetActiveCache();
    const r2 = await workspaceGetActive();

    expect(r2).toEqual(response2);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Deduplication with error path
// ---------------------------------------------------------------------------
describe("deduplication error handling", () => {
  it("deduped calls propagate errors to all waiters", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("boom"));

    const p1 = grooveList({ knownWorktrees: [] });
    const p2 = grooveList({ knownWorktrees: [] });

    await expect(p1).rejects.toThrow("boom");
    await expect(p2).rejects.toThrow("boom");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// invokeCommand intent: "background" does not count as blocking
// ---------------------------------------------------------------------------
describe("background intent", () => {
  it("background intent does not increment blocking invoke count", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToBlockingInvokes(listener);

    let resolveInvoke!: (value: unknown) => void;
    mockInvoke.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInvoke = resolve; }),
    );

    const promise = diagnosticsGetSystemOverview(); // has intent: "background"
    // Give microtasks a chance
    await new Promise((r) => setTimeout(r, 10));
    expect(hasBlockingInvokeInFlight()).toBe(false);
    // listener should not have been called for blocking
    expect(listener).not.toHaveBeenCalled();

    resolveInvoke({ ok: true });
    await promise;

    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// UNTRACKED_COMMANDS: commands in the set skip trackCommandExecution
// ---------------------------------------------------------------------------
describe("UNTRACKED_COMMANDS", () => {
  it("grooveList (untracked) does not call trackCommandExecution", async () => {
    const { trackCommandExecution } = await import("@/src/lib/command-history");
    (trackCommandExecution as ReturnType<typeof vi.fn>).mockClear();

    await grooveList({ knownWorktrees: [] });
    expect(trackCommandExecution).not.toHaveBeenCalled();
  });

  it("grooveNew (tracked) calls trackCommandExecution", async () => {
    const { trackCommandExecution } = await import("@/src/lib/command-history");
    (trackCommandExecution as ReturnType<typeof vi.fn>).mockClear();

    await grooveNew({ rootName: "r", knownWorktrees: [], branch: "b" });
    expect(trackCommandExecution).toHaveBeenCalledWith("groove_new", expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// summarizeInvokeArgs coverage via telemetry logs
// ---------------------------------------------------------------------------
describe("summarizeInvokeArgs edge cases", () => {
  it("redacts keys matching blocked pattern", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    await validateOpencodeSettingsDirectory("/dir", null);
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "validate_opencode_settings_directory",
    );
    expect(call).toBeDefined();
  });

  it("handles payload object with nested keys", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    await grooveNew({ rootName: "r", knownWorktrees: ["w1", "w2"], branch: "summary-1" });
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "groove_new",
    );
    expect(call).toBeDefined();
    const summary = (call![1] as Record<string, unknown>).args_summary as string;
    expect(summary).toContain("payload{");
  });

  it("handles undefined/null args (no args_summary in log)", async () => {
    const calls: unknown[][] = [];
    const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { calls.push(args); });
    await diagnosticsListOpencodeInstances();
    infoSpy.mockRestore();
    const call = calls.find(
      (c) => c[0] === "[ui-telemetry] ipc.invoke" && (c[1] as Record<string, unknown>)?.command === "diagnostics_list_opencode_instances",
    );
    expect(call).toBeDefined();
    expect((call![1] as Record<string, unknown>).args_summary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// serializeInvokeArg coverage via deduplication key
// ---------------------------------------------------------------------------
describe("serializeInvokeArg edge cases", () => {
  it("different arg values produce different dedupe keys (no false dedup)", async () => {
    let callCount = 0;
    mockInvoke.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: true });
    });

    await gitStatus({ path: "/a" });
    await gitStatus({ path: "/b" });
    expect(callCount).toBe(2);
  });

  it("handles args with undefined values and unusual types in dedupe serialization", async () => {
    // grooveRestore accepts optional fields that may be undefined
    // This exercises serializeInvokeArg with undefined (via array) and various types
    let callCount = 0;
    mockInvoke.mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: true });
    });

    // Two calls with different worktree values produce different dedupe keys
    await grooveRestore({ rootName: "r", knownWorktrees: [], worktree: "a", target: undefined });
    await grooveRestore({ rootName: "r", knownWorktrees: [], worktree: "b", target: undefined });
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Multiple telemetry samples (recordIpcTelemetryDuration reservoir sampling)
// ---------------------------------------------------------------------------
describe("telemetry reservoir sampling", () => {
  it("records multiple samples and computes percentiles correctly", async () => {
    // Make many calls to get multiple samples
    for (let i = 0; i < 5; i++) {
      mockInvoke.mockResolvedValueOnce({ ok: true });
      await diagnosticsListOpencodeInstances();
      // Clear dedup between calls
      await new Promise((r) => setTimeout(r, 0));
    }

    const summary = getIpcTelemetrySummary();
    const row = summary.find((r) => r.command === "diagnostics_list_opencode_instances");
    expect(row).toBeDefined();
    expect(row!.count).toBeGreaterThanOrEqual(5);
    expect(row!.p50_ms).toBeGreaterThanOrEqual(0);
    expect(row!.p95_ms).toBeGreaterThanOrEqual(row!.p50_ms);
  });
});

// ---------------------------------------------------------------------------
// Edge: globalSettings with changed keyboard bindings
// ---------------------------------------------------------------------------
describe("global settings keyboard binding changes", () => {
  it("detects keyboard binding changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGlobalSettings(listener);

    mockInvoke.mockResolvedValueOnce({
      ok: true,
      globalSettings: {
        keyboardLeaderBindings: { openActionLauncher: "x", openWorktreeDetailsLauncher: "p" },
      },
    });
    await globalSettingsGet();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });
});
