import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecoverPreviousSessionModal } from "@/src/components/pages/barracks/recover-previous-session-modal";
import type { RunningGrooveRecord } from "@/src/lib/ipc";

function buildGroove(
  overrides: Partial<RunningGrooveRecord> = {},
): RunningGrooveRecord {
  return {
    workspaceRoot: "/workspace",
    worktree: "feature_login",
    worktreePath: "/workspace/.worktrees/feature_login",
    command: "claude",
    sessionId: "session-1",
    startedAt: "2026-05-27T10:00:00Z",
    ...overrides,
  };
}

function renderModal(
  overrides: Partial<Parameters<typeof RecoverPreviousSessionModal>[0]> = {},
) {
  const grooves = overrides.grooves ?? [buildGroove()];
  const props = {
    open: true,
    grooves,
    selected: new Set(grooves.map((groove) => groove.worktree)),
    loading: false,
    onToggle: vi.fn(),
    onOpenChange: vi.fn(),
    onDismiss: vi.fn(),
    onRecover: vi.fn(),
    ...overrides,
  };
  render(<RecoverPreviousSessionModal {...props} />);
  return props;
}

describe("RecoverPreviousSessionModal", () => {
  it("renders the dialog and title when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Recover previous session")).toBeTruthy();
  });

  it("lists each groove's worktree and command", () => {
    renderModal({
      grooves: [
        buildGroove({ worktree: "feature_login", command: "claude" }),
        buildGroove({
          worktree: "fix_payments",
          command: "pnpm run dev",
          sessionId: "session-2",
        }),
      ],
    });
    expect(screen.getByText("feature_login")).toBeTruthy();
    expect(screen.getByText("claude")).toBeTruthy();
    expect(screen.getByText("fix_payments")).toBeTruthy();
    expect(screen.getByText("pnpm run dev")).toBeTruthy();
  });

  it("shows the selected count in the recover button", () => {
    renderModal({
      grooves: [
        buildGroove({ worktree: "a" }),
        buildGroove({ worktree: "b", sessionId: "session-2" }),
      ],
      selected: new Set(["a"]),
    });
    expect(screen.getByText("Recover (1)")).toBeTruthy();
  });

  it("disables the recover button when nothing is selected", () => {
    renderModal({ selected: new Set() });
    const button = screen.getByText("Recover (0)").closest("button");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onToggle when a groove is clicked", () => {
    const onToggle = vi.fn();
    renderModal({ onToggle });
    fireEvent.click(screen.getByText("feature_login"));
    expect(onToggle).toHaveBeenCalledWith("feature_login");
  });

  it("calls onDismiss when Dismiss is clicked", () => {
    const onDismiss = vi.fn();
    renderModal({ onDismiss });
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onRecover when Recover is clicked", () => {
    const onRecover = vi.fn();
    renderModal({ onRecover });
    fireEvent.click(screen.getByText("Recover (1)").closest("button")!);
    expect(onRecover).toHaveBeenCalledOnce();
  });

  it("annotates grooves that are still running", () => {
    renderModal({ grooves: [buildGroove({ stillRunning: true })] });
    expect(screen.getByText(/still running/)).toBeTruthy();
  });
});
