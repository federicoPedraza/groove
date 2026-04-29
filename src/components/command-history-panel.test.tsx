import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandExecutionEntry } from "@/src/lib/command-history";

const {
  subscribeToCommandHistoryMock,
  getCommandHistorySnapshotMock,
  clearCommandHistoryMock,
  formatCommandRelativeTimeMock,
  getCommandMetadataMock,
} = vi.hoisted(() => ({
  subscribeToCommandHistoryMock: vi.fn(() => () => {}),
  getCommandHistorySnapshotMock: vi.fn((): CommandExecutionEntry[] => []),
  clearCommandHistoryMock: vi.fn(),
  formatCommandRelativeTimeMock: vi.fn(() => "now"),
  getCommandMetadataMock: vi.fn((command: string) => ({
    title: `Title for ${command}`,
    description: `Description for ${command}`,
    icon: vi.fn(),
  })),
}));

vi.mock("@/src/lib/command-history", () => ({
  subscribeToCommandHistory: subscribeToCommandHistoryMock,
  getCommandHistorySnapshot: getCommandHistorySnapshotMock,
  clearCommandHistory: clearCommandHistoryMock,
  formatCommandRelativeTime: formatCommandRelativeTimeMock,
}));

vi.mock("@/src/lib/command-metadata", () => ({
  getCommandMetadata: getCommandMetadataMock,
}));

vi.mock("@/src/components/collapsed-toast", () => ({
  CollapsedToast: () => null,
}));

vi.mock("@/src/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const { CommandHistoryPanel } =
  await import("@/src/components/command-history-panel");

function makeEntry(
  overrides: Partial<CommandExecutionEntry> &
    Pick<CommandExecutionEntry, "id" | "command" | "state">,
): CommandExecutionEntry {
  return {
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    ...overrides,
  };
}

describe("CommandHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommandHistorySnapshotMock.mockReturnValue([]);
  });

  it("renders trigger button with version", () => {
    render(<CommandHistoryPanel />);

    expect(
      screen.getByRole("button", { name: "Command history" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it("trigger button has aria-expanded false when closed", () => {
    render(<CommandHistoryPanel />);

    const trigger = screen.getByRole("button", { name: "Command history" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens panel when trigger is clicked", () => {
    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(
      screen.getByRole("dialog", { name: "Command history" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Terminal Log")).toBeInTheDocument();
  });

  it("closes panel when trigger is clicked again", () => {
    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows 'No commands yet' when there are no entries", () => {
    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("No commands yet")).toBeInTheDocument();
  });

  it("renders completed entries in the panel", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "groove_restore", state: "success" }),
      makeEntry({
        id: "2",
        command: "groove_new",
        state: "error",
        failureDetail: "Something went wrong",
      }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Title for groove_restore")).toBeInTheDocument();
    expect(screen.getByText("Title for groove_new")).toBeInTheDocument();
  });

  it("shows entry count badge when entries exist", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
      makeEntry({ id: "2", command: "cmd2", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show count badge when no entries", () => {
    getCommandHistorySnapshotMock.mockReturnValue([]);
    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    const header = screen.getByText("Terminal Log").closest("div");
    expect(header).not.toBeNull();
    expect(within(header!).queryByText("0")).not.toBeInTheDocument();
  });

  it("calls clearCommandHistory when clear button is clicked", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));

    expect(clearCommandHistoryMock).toHaveBeenCalledTimes(1);
  });

  it("disables clear button when no entries", () => {
    getCommandHistorySnapshotMock.mockReturnValue([]);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(
      screen.getByRole("button", { name: "Clear history" }),
    ).toBeDisabled();
  });

  it("switches to raw mode and shows command names instead of titles", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "groove_restore", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Title for groove_restore")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Raw"));

    expect(screen.getByText("groove_restore")).toBeInTheDocument();
  });

  it("shows description in friendly mode only", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Description for cmd1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Raw"));

    expect(screen.queryByText("Description for cmd1")).not.toBeInTheDocument();
  });

  it("shows failure detail for error entries", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({
        id: "1",
        command: "cmd1",
        state: "error",
        failureDetail: "Disk full",
      }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Disk full")).toBeInTheDocument();
  });

  it("does not show failure detail for success entries", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.queryByText(/Disk full/)).not.toBeInTheDocument();
  });

  it("shows running count when there are running entries", () => {
    const entries: CommandExecutionEntry[] = [
      {
        id: "1",
        command: "cmd1",
        state: "running",
        startedAt: Date.now(),
        completedAt: null,
      },
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("1 running")).toBeInTheDocument();
  });

  it("does not show running count when no running entries", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });

  it("filters out non-completed entries from display list", () => {
    const entries: CommandExecutionEntry[] = [
      {
        id: "1",
        command: "running_cmd",
        state: "running",
        startedAt: Date.now(),
        completedAt: null,
      },
      makeEntry({ id: "2", command: "done_cmd", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Title for done_cmd")).toBeInTheDocument();
    expect(screen.queryByText("Title for running_cmd")).not.toBeInTheDocument();
  });

  it("closes panel on Escape key", () => {
    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes panel when clicking outside", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <CommandHistoryPanel />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("limits displayed entries to 20", () => {
    const entries: CommandExecutionEntry[] = Array.from(
      { length: 25 },
      (_, i) =>
        makeEntry({
          id: String(i),
          command: `cmd_${String(i)}`,
          state: "success",
        }),
    );
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("switches back to friendly mode", () => {
    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));
    fireEvent.click(screen.getByText("Raw"));

    expect(screen.getByText("cmd1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Friendly"));

    expect(screen.getByText("Title for cmd1")).toBeInTheDocument();
  });

  it("handles metadata with empty description in friendly mode", () => {
    getCommandMetadataMock.mockReturnValue({
      title: "Some Title",
      description: "",
      icon: vi.fn(),
    });

    const entries: CommandExecutionEntry[] = [
      makeEntry({ id: "1", command: "cmd1", state: "success" }),
    ];
    getCommandHistorySnapshotMock.mockReturnValue(entries);

    render(<CommandHistoryPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Command history" }));

    expect(screen.getByText("Some Title")).toBeInTheDocument();
  });
});
