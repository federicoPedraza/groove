import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DiagnosticsMostConsumingProgramsResponse,
  DiagnosticsStopAllResponse,
  DiagnosticsSystemOverviewResponse,
  WorkspaceContextResponse,
  WorkspaceGitignoreSanityResponse,
  WorkspaceTermSanityResponse,
} from "@/src/lib/ipc";

const {
  diagnosticsCleanAllDevServersMock,
  diagnosticsGetSystemOverviewMock,
  diagnosticsGetMsotConsumingProgramsMock,
  diagnosticsKillAllNodeInstancesMock,
  workspaceGetActiveMock,
  workspaceGitignoreSanityApplyMock,
  workspaceGitignoreSanityCheckMock,
  workspaceTermSanityCheckMock,
  workspaceTermSanityApplyMock,
} = vi.hoisted(() => ({
  diagnosticsCleanAllDevServersMock:
    vi.fn<() => Promise<DiagnosticsStopAllResponse>>(),
  diagnosticsGetSystemOverviewMock:
    vi.fn<() => Promise<DiagnosticsSystemOverviewResponse>>(),
  diagnosticsGetMsotConsumingProgramsMock:
    vi.fn<() => Promise<DiagnosticsMostConsumingProgramsResponse>>(),
  diagnosticsKillAllNodeInstancesMock:
    vi.fn<() => Promise<DiagnosticsStopAllResponse>>(),
  workspaceGetActiveMock: vi.fn<() => Promise<WorkspaceContextResponse>>(),
  workspaceGitignoreSanityApplyMock:
    vi.fn<() => Promise<WorkspaceGitignoreSanityResponse>>(),
  workspaceGitignoreSanityCheckMock:
    vi.fn<() => Promise<WorkspaceGitignoreSanityResponse>>(),
  workspaceTermSanityCheckMock:
    vi.fn<() => Promise<WorkspaceTermSanityResponse>>(),
  workspaceTermSanityApplyMock:
    vi.fn<() => Promise<WorkspaceTermSanityResponse>>(),
}));

vi.mock("@/src/lib/ipc", () => ({
  isTelemetryEnabled: vi.fn(() => false),
  diagnosticsCleanAllDevServers: diagnosticsCleanAllDevServersMock,
  diagnosticsGetSystemOverview: diagnosticsGetSystemOverviewMock,
  diagnosticsGetMsotConsumingPrograms: diagnosticsGetMsotConsumingProgramsMock,
  diagnosticsKillAllNodeInstances: diagnosticsKillAllNodeInstancesMock,
  workspaceGetActive: workspaceGetActiveMock,
  workspaceGitignoreSanityApply: workspaceGitignoreSanityApplyMock,
  workspaceGitignoreSanityCheck: workspaceGitignoreSanityCheckMock,
  workspaceTermSanityCheck: workspaceTermSanityCheckMock,
  workspaceTermSanityApply: workspaceTermSanityApplyMock,
}));

vi.mock("@/src/components/pages/diagnostics/diagnostics-header", () => ({
  DiagnosticsHeader: ({
    isLoadingMostConsumingPrograms,
    isCleaningAllDevServers,
    onLoadMostConsumingPrograms,
    onCleanAll,
  }: {
    isLoadingMostConsumingPrograms: boolean;
    isCleaningAllDevServers: boolean;
    onLoadMostConsumingPrograms: () => void;
    onCleanAll: () => void;
  }) => (
    <div data-testid="diagnostics-header">
      <button
        type="button"
        data-testid="btn-load-top"
        disabled={isLoadingMostConsumingPrograms}
        onClick={onLoadMostConsumingPrograms}
      >
        Load Top
      </button>
      <button
        type="button"
        data-testid="btn-clean-all"
        disabled={isCleaningAllDevServers}
        onClick={onCleanAll}
      >
        Clean All
      </button>
    </div>
  ),
}));

vi.mock(
  "@/src/components/pages/diagnostics/diagnostics-system-sidebar",
  () => ({
    DiagnosticsSystemSidebar: () => <div data-testid="system-sidebar" />,
  }),
);

vi.mock("@/src/components/pages/diagnostics/emergency-card", () => ({
  EmergencyCard: ({
    isKillingAllNodeAndOpencodeInstances,
    onKillAllNodeInstances,
  }: {
    isKillingAllNodeAndOpencodeInstances: boolean;
    onKillAllNodeInstances: () => void;
  }) => (
    <div data-testid="emergency-card">
      <button
        type="button"
        data-testid="btn-emergency-kill"
        disabled={isKillingAllNodeAndOpencodeInstances}
        onClick={onKillAllNodeInstances}
      >
        Emergency Kill
      </button>
    </div>
  ),
}));

vi.mock("@/src/components/pages/use-app-layout", () => ({
  useAppLayout: vi.fn(),
}));

vi.mock("@/src/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function defaultMocks(): void {
  diagnosticsGetSystemOverviewMock.mockResolvedValue({
    ok: true,
    overview: {
      cpuUsagePercent: 25,
      cpuCores: 8,
      ramTotalBytes: 17179869184,
      ramUsedBytes: 4294967296,
      ramUsagePercent: 25,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
      swapUsagePercent: 0,
      diskTotalBytes: 536870912000,
      diskUsedBytes: 107374182400,
      diskUsagePercent: 20,
      platform: "linux",
      hostname: "test-host",
    },
  });
  workspaceGetActiveMock.mockResolvedValue({
    ok: true,
    workspaceRoot: "/test/workspace",
    rows: [],
    workspaceMeta: {
      version: 1,
      rootName: "test",
      createdAt: "",
      updatedAt: "",
    },
  });
  workspaceGitignoreSanityCheckMock.mockResolvedValue({
    ok: true,
    isApplicable: true,
    hasGrooveEntry: true,
    hasWorkspaceEntry: true,
    missingEntries: [],
  });
  workspaceTermSanityCheckMock.mockResolvedValue({
    ok: true,
    isUsable: true,
    termValue: "xterm-256color",
  });
  diagnosticsCleanAllDevServersMock.mockResolvedValue({
    ok: true,
    attempted: 2,
    stopped: 2,
    alreadyStopped: 0,
    failed: 0,
    errors: [],
  });
  diagnosticsKillAllNodeInstancesMock.mockResolvedValue({
    ok: true,
    attempted: 1,
    stopped: 1,
    alreadyStopped: 0,
    failed: 0,
    errors: [],
  });
  diagnosticsGetMsotConsumingProgramsMock.mockResolvedValue({
    ok: true,
    output: "PID  MEM  CMD\n1234  512  node",
  });
  workspaceGitignoreSanityApplyMock.mockResolvedValue({
    ok: true,
    isApplicable: true,
    hasGrooveEntry: true,
    hasWorkspaceEntry: true,
    missingEntries: [],
    patched: true,
    patchedWorktree: "feature-1",
  });
  workspaceTermSanityApplyMock.mockResolvedValue({
    ok: true,
    isUsable: true,
    termValue: "xterm-256color",
    applied: true,
    fixedValue: "xterm-256color",
  });
}

describe("DiagnosticsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    defaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderPage() {
    const mod = await import("@/src/app/diagnostics/page");
    const DiagnosticsPage = mod.default;
    const result = render(<DiagnosticsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return result;
  }

  it("renders the diagnostics page with header and emergency card", async () => {
    await renderPage();
    expect(screen.getByTestId("diagnostics-header")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-card")).toBeInTheDocument();
  });

  it("renders sanity checks table when workspace is active and gitignore is healthy", async () => {
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(".gitignore includes Groove entries"),
      ).toBeInTheDocument();
    });
    const healthyElements = screen.getAllByText("Healthy");
    expect(healthyElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows missing entries label for gitignore sanity", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove", ".worktrees"],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Missing .groove and .worktrees in .gitignore."),
      ).toBeInTheDocument();
    });
  });

  it("shows no active workspace label when workspace is not active", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: false,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("No active workspace selected."),
      ).toBeInTheDocument();
    });
  });

  it("shows no .gitignore found when not applicable", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: false,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("No .gitignore found in this directory."),
      ).toBeInTheDocument();
    });
  });

  it("shows unable to check gitignore sanity on error", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: false,
      isApplicable: false,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [],
      error: "Some error",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to check .gitignore sanity."),
      ).toBeInTheDocument();
    });
  });

  it("shows unable to check gitignore sanity on exception", async () => {
    workspaceGitignoreSanityCheckMock.mockRejectedValue(
      new Error("Network error"),
    );
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to check .gitignore sanity."),
      ).toBeInTheDocument();
    });
  });

  it("shows TERM is usable when term sanity is healthy", async () => {
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("TERM is usable (xterm-256color)."),
      ).toBeInTheDocument();
    });
  });

  it("shows TERM is missing or unusable when term is not usable", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("TERM is missing or unusable (dumb)."),
      ).toBeInTheDocument();
    });
  });

  it("shows unable to check TERM sanity on error", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: false,
      isUsable: false,
      termValue: undefined,
      error: "Some TERM error",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to check TERM sanity."),
      ).toBeInTheDocument();
    });
  });

  it("shows unable to check TERM sanity on exception", async () => {
    workspaceTermSanityCheckMock.mockRejectedValue(new Error("TERM exception"));
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to check TERM sanity."),
      ).toBeInTheDocument();
    });
  });

  it("applies gitignore sanity patch on button click", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Missing .groove/)).toBeInTheDocument();
    });

    const applyButton = screen.getByRole("button", {
      name: /Apply fix for .gitignore/,
    });
    expect(applyButton).not.toBeDisabled();

    await act(async () => {
      applyButton.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(workspaceGitignoreSanityApplyMock).toHaveBeenCalled();
  });

  it("applies term sanity patch on button click", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getAllByText(/TERM is missing or unusable/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      const applyButton = screen.getByRole("button", {
        name: /Apply fix for TERM/,
      });
      expect(applyButton).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(workspaceTermSanityApplyMock).toHaveBeenCalled();
  });

  it("shows status message after applying gitignore patch", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Applied Groove .gitignore sanity patch in feature-1/),
      ).toBeInTheDocument();
    });
  });

  it("shows 'already applied' message when gitignore patch not needed", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: false,
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Groove .gitignore sanity patch is already applied."),
      ).toBeInTheDocument();
    });
  });

  it("shows error when gitignore apply fails", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: false,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
      error: "Apply failed",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Apply failed")).toBeInTheDocument();
    });
  });

  it("shows error when gitignore apply throws", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockRejectedValue(new Error("Network"));
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to apply .gitignore sanity patch."),
      ).toBeInTheDocument();
    });
  });

  it("clears gitignore state when workspace is not active on apply", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    // Now workspace becomes inactive on apply
    workspaceGetActiveMock.mockResolvedValue({ ok: false, rows: [] });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("No active workspace selected."),
      ).toBeInTheDocument();
    });
  });

  it("shows gitignore not applicable message on apply", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: false,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [],
      patched: false,
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("No .gitignore found in the active workspace."),
      ).toBeInTheDocument();
    });
  });

  it("shows patched message without worktree", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: true,
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Applied Groove .gitignore sanity patch."),
      ).toBeInTheDocument();
    });
  });

  it("shows TERM sanity applied message", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Applied TERM sanity patch (TERM=xterm-256color)."),
      ).toBeInTheDocument();
    });
  });

  it("shows TERM sanity already applied message", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    workspaceTermSanityApplyMock.mockResolvedValue({
      ok: true,
      isUsable: true,
      termValue: "xterm-256color",
      applied: false,
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("TERM sanity patch is already applied."),
      ).toBeInTheDocument();
    });
  });

  it("shows TERM sanity apply error", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    workspaceTermSanityApplyMock.mockResolvedValue({
      ok: false,
      isUsable: false,
      termValue: "dumb",
      error: "TERM apply failed",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("TERM apply failed")).toBeInTheDocument();
    });
  });

  it("shows TERM sanity apply exception", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    workspaceTermSanityApplyMock.mockRejectedValue(new Error("Network"));
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to apply TERM sanity patch."),
      ).toBeInTheDocument();
    });
  });

  it("runs clean all dev servers action", async () => {
    const { toast } = await import("@/src/lib/toast");
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-clean-all").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(diagnosticsCleanAllDevServersMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Clean all completed"),
        expect.anything(),
      );
    });
  });

  it("shows toast error when clean all fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsCleanAllDevServersMock.mockResolvedValue({
      ok: false,
      error: "Clean failed",
      attempted: 0,
      stopped: 0,
      alreadyStopped: 0,
      failed: 0,
      errors: [],
    });
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-clean-all").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Clean all failed.",
        expect.anything(),
      );
    });
  });

  it("shows toast error when clean all throws", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsCleanAllDevServersMock.mockRejectedValue(new Error("Net"));
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-clean-all").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Clean-all request failed.", {
        command: "diagnostics_clean_all_dev_servers",
      });
    });
  });

  it("runs emergency kill action", async () => {
    const { toast } = await import("@/src/lib/toast");
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-emergency-kill").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(diagnosticsKillAllNodeInstancesMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Emergency kill completed"),
        expect.anything(),
      );
    });
  });

  it("shows toast error when emergency kill fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsKillAllNodeInstancesMock.mockResolvedValue({
      ok: false,
      error: "Kill failed",
      attempted: 0,
      stopped: 0,
      alreadyStopped: 0,
      failed: 0,
      errors: [],
    });
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-emergency-kill").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to kill all Node"),
        expect.anything(),
      );
    });
  });

  it("shows toast error when emergency kill throws", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsKillAllNodeInstancesMock.mockRejectedValue(new Error("Net"));
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-emergency-kill").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Emergency kill request failed.",
        { command: "diagnostics_kill_all_node_instances" },
      );
    });
  });

  it("runs load most consuming programs action", async () => {
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(diagnosticsGetMsotConsumingProgramsMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/PID\s+MEM\s+CMD/)).toBeInTheDocument();
    });
  });

  it("shows error when most consuming programs fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsGetMsotConsumingProgramsMock.mockResolvedValue({
      ok: false,
      error: "Query failed",
      output: "",
    });
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to load top processes.",
        expect.anything(),
      );
    });
  });

  it("shows error when most consuming programs throws", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsGetMsotConsumingProgramsMock.mockRejectedValue(new Error("Net"));
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to load top processes.",
        { command: "diagnostics_get_msot_consuming_programs" },
      );
    });
  });

  it("hides most consuming programs output when hide button clicked", async () => {
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText(/PID\s+MEM\s+CMD/)).toBeInTheDocument();
    });

    const hideButton = screen.getByRole("button", {
      name: "Hide top processes",
    });
    await act(async () => {
      hideButton.click();
    });

    expect(screen.queryByText(/PID\s+MEM\s+CMD/)).not.toBeInTheDocument();
  });

  it("shows 'No output.' when most consuming programs returns empty output", async () => {
    diagnosticsGetMsotConsumingProgramsMock.mockResolvedValue({
      ok: true,
      output: "",
    });
    await renderPage();

    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("No output.")).toBeInTheDocument();
    });
  });

  it("loads system overview on mount and polls", async () => {
    await renderPage();
    expect(diagnosticsGetSystemOverviewMock).toHaveBeenCalled();
  });

  it("handles system overview error response", async () => {
    diagnosticsGetSystemOverviewMock.mockResolvedValue({
      ok: false,
      error: "System overview failed",
    });
    await renderPage();
    // The component stores the error but delegates display to DiagnosticsSystemSidebar
    expect(diagnosticsGetSystemOverviewMock).toHaveBeenCalled();
  });

  it("handles system overview exception", async () => {
    diagnosticsGetSystemOverviewMock.mockRejectedValue(new Error("Net"));
    await renderPage();
    expect(diagnosticsGetSystemOverviewMock).toHaveBeenCalled();
  });

  it("shows TERM value without parentheses when termValue is null", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: undefined,
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("TERM is missing or unusable."),
      ).toBeInTheDocument();
    });
  });

  it("uses fallback error for gitignore check when no error message", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: false,
      isApplicable: false,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to check .gitignore sanity."),
      ).toBeInTheDocument();
    });
  });

  it("uses fallback error for term apply when no error message", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: "dumb",
    });
    workspaceTermSanityApplyMock.mockResolvedValue({
      ok: false,
      isUsable: false,
      termValue: "dumb",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(
        screen.getByText("Failed to apply TERM sanity patch."),
      ).toBeInTheDocument();
    });
  });

  it("uses fallback error for gitignore apply when no error message", async () => {
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: false,
      isApplicable: true,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [".groove"],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for .gitignore/ }),
      ).not.toBeDisabled();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for .gitignore/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(
        screen.getByText("Failed to apply .gitignore sanity patch."),
      ).toBeInTheDocument();
    });
  });

  it("uses fallback for most consuming programs error without message", async () => {
    const { toast } = await import("@/src/lib/toast");
    diagnosticsGetMsotConsumingProgramsMock.mockResolvedValue({
      ok: false,
      output: "",
    });
    await renderPage();
    await act(async () => {
      screen.getByTestId("btn-load-top").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("applies term sanity patch with fallback fixedValue", async () => {
    workspaceTermSanityCheckMock.mockResolvedValue({
      ok: true,
      isUsable: false,
      termValue: undefined,
    });
    workspaceTermSanityApplyMock.mockResolvedValue({
      ok: true,
      isUsable: true,
      applied: true,
      termValue: "xterm-256color",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Apply fix for TERM/ }),
      ).not.toBeDisabled();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Apply fix for TERM/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(
        screen.getByText("Applied TERM sanity patch (TERM=xterm-256color)."),
      ).toBeInTheDocument();
    });
  });
});

// Need afterEach import
import { afterEach } from "vitest";
