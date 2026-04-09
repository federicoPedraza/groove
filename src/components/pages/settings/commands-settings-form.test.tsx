import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandsSettingsForm } from "@/src/components/pages/settings/commands-settings-form";
import {
  DEFAULT_PLAY_GROOVE_COMMAND,
  DEFAULT_RUN_LOCAL_COMMAND,
  GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL,
  GROOVE_PLAY_COMMAND_SENTINEL,
} from "@/src/lib/ipc";

describe("CommandsSettingsForm", () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onSave = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderForm(
    overrides: Partial<Parameters<typeof CommandsSettingsForm>[0]> = {},
  ) {
    return render(
      <CommandsSettingsForm
        playGrooveCommand={GROOVE_PLAY_COMMAND_SENTINEL}
        openTerminalAtWorktreeCommand={GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL}
        runLocalCommand={DEFAULT_RUN_LOCAL_COMMAND}
        onSave={onSave}
        {...overrides}
      />,
    );
  }

  it("renders the Commands heading when section is all", () => {
    renderForm({ section: "all" });

    expect(screen.getByText("Commands")).toBeInTheDocument();
  });

  it("does not render the Commands heading when section is commands", () => {
    renderForm({ section: "commands" });

    expect(screen.queryByText("Commands")).not.toBeInTheDocument();
  });

  it("renders play groove input with initial value", () => {
    renderForm();

    const input = document.getElementById("play-groove-command")!;
    expect(input).toHaveValue(GROOVE_PLAY_COMMAND_SENTINEL);
  });

  it("renders open terminal input", () => {
    renderForm();

    const input = document.getElementById("open-terminal-at-worktree-command")!;
    expect(input).toHaveValue(GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL);
  });

  it("renders run local input", () => {
    renderForm();

    const input = document.getElementById("run-local-command")!;
    expect(input).toHaveValue(DEFAULT_RUN_LOCAL_COMMAND);
  });

  it("auto-saves after debounce when value changes", async () => {
    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "npm run dev" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onSave).toHaveBeenCalled();
  });

  it("does not auto-save when disabled", async () => {
    renderForm({
      disabled: true,
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    expect(input).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows disabled message when disabled and disabledMessage is set", () => {
    renderForm({
      disabled: true,
      disabledMessage: "No workspace open.",
    });

    expect(screen.getByText("No workspace open.")).toBeInTheDocument();
  });

  it("shows error when play command is emptied", async () => {
    renderForm({
      playGrooveCommand: "a",
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("play-groove-command")!;
    fireEvent.change(input, { target: { value: "" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByText("Play Groove command is required."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows saving message during save", async () => {
    let resolvePromise: (value: { ok: boolean }) => void = () => {};
    onSave.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "bun run dev" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Saving command settings...")).toBeInTheDocument();

    await act(async () => {
      resolvePromise({ ok: true });
    });
  });

  it("shows error message when save fails", async () => {
    onSave.mockResolvedValue({ ok: false, error: "Save failed on backend." });

    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "bun run dev" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Save failed on backend.")).toBeInTheDocument();
  });

  it("resolves template label for play groove when matching known command", () => {
    renderForm({ playGrooveCommand: GROOVE_PLAY_COMMAND_SENTINEL });

    const trigger = screen.getByRole("button", {
      name: /select play groove terminal template/i,
    });
    expect(trigger).toHaveTextContent("Groove: Opencode");
  });

  it("shows Custom command label for play groove with unknown command", () => {
    renderForm({ playGrooveCommand: "my-custom-launcher {worktree}" });

    const trigger = screen.getByRole("button", {
      name: /select play groove terminal template/i,
    });
    expect(trigger).toHaveTextContent("Custom command");
  });

  it("resolves template label for open terminal when matching known command", () => {
    renderForm({
      openTerminalAtWorktreeCommand: GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL,
    });

    const trigger = screen.getByRole("button", {
      name: /select open terminal template/i,
    });
    expect(trigger).toHaveTextContent("Groove");
  });

  it("resolves template label for run local when matching known command", () => {
    renderForm({ runLocalCommand: DEFAULT_RUN_LOCAL_COMMAND });

    const trigger = screen.getByRole("button", {
      name: /select run local template/i,
    });
    expect(trigger).toHaveTextContent("pnpm");
  });

  it("does not save when the signature has not changed", async () => {
    renderForm({
      playGrooveCommand: "test-cmd",
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("play-groove-command")!;
    fireEvent.change(input, { target: { value: "test-cmd" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("updates saved state with response payload values", async () => {
    onSave.mockResolvedValue({
      ok: true,
      payload: {
        playGrooveCommand: "normalized-cmd",
        openTerminalAtWorktreeCommand: "normalized-terminal",
        runLocalCommand: "normalized-local",
      },
    });

    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "something" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => {
      const playInput = document.getElementById("play-groove-command")!;
      expect(playInput).toHaveValue("normalized-cmd");
    });
  });

  it("shows default error when save returns ok:false without error message", async () => {
    onSave.mockResolvedValue({ ok: false });

    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "changed" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByText("Failed to save command settings."),
    ).toBeInTheDocument();
  });

  it("resets state when props change (workspace scope change)", () => {
    const { rerender } = renderForm({
      playGrooveCommand: "cmd-a",
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("play-groove-command")!;
    fireEvent.change(input, { target: { value: "modified" } });

    rerender(
      <CommandsSettingsForm
        playGrooveCommand="cmd-b"
        openTerminalAtWorktreeCommand=""
        runLocalCommand=""
        onSave={onSave}
      />,
    );

    expect(document.getElementById("play-groove-command")!).toHaveValue(
      "cmd-b",
    );
  });

  it("disables inputs when saveState is saving", async () => {
    let resolvePromise: (value: { ok: boolean }) => void = () => {};
    onSave.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: "trigger save" } });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(document.getElementById("play-groove-command")!).toBeDisabled();
    expect(
      document.getElementById("open-terminal-at-worktree-command")!,
    ).toBeDisabled();
    expect(document.getElementById("run-local-command")!).toBeDisabled();

    await act(async () => {
      resolvePromise({ ok: true });
    });
  });

  it("updates play template when typing a matching command", () => {
    renderForm({
      playGrooveCommand: "something-custom",
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "",
    });

    const trigger = screen.getByRole("button", {
      name: /select play groove terminal template/i,
    });
    expect(trigger).toHaveTextContent("Custom command");

    const input = document.getElementById("play-groove-command")!;
    fireEvent.change(input, {
      target: { value: GROOVE_PLAY_COMMAND_SENTINEL },
    });

    expect(trigger).toHaveTextContent("Groove: Opencode");
  });

  it("updates open terminal template when typing a matching command", () => {
    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "something",
      runLocalCommand: "",
    });

    const trigger = screen.getByRole("button", {
      name: /select open terminal template/i,
    });
    expect(trigger).toHaveTextContent("Custom command");

    const input = document.getElementById("open-terminal-at-worktree-command")!;
    fireEvent.change(input, {
      target: { value: GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL },
    });

    expect(trigger).toHaveTextContent("Groove");
  });

  it("updates run local template when typing a matching command", () => {
    renderForm({
      playGrooveCommand: DEFAULT_PLAY_GROOVE_COMMAND,
      openTerminalAtWorktreeCommand: "",
      runLocalCommand: "something",
    });

    const trigger = screen.getByRole("button", {
      name: /select run local template/i,
    });
    expect(trigger).toHaveTextContent("Custom command");

    const input = document.getElementById("run-local-command")!;
    fireEvent.change(input, { target: { value: DEFAULT_RUN_LOCAL_COMMAND } });

    expect(trigger).toHaveTextContent("pnpm");
  });
});
