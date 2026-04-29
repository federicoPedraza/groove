import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalSettingsForm } from "@/src/components/pages/settings/terminal-settings-form";

describe("TerminalSettingsForm", () => {
  let onDefaultTerminalChange: ReturnType<typeof vi.fn>;
  let onTerminalCustomCommandChange: ReturnType<typeof vi.fn>;
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onDefaultTerminalChange = vi.fn();
    onTerminalCustomCommandChange = vi.fn();
    onSave = vi.fn();
  });

  function renderForm(
    overrides: Partial<Parameters<typeof TerminalSettingsForm>[0]> = {},
  ) {
    return render(
      <TerminalSettingsForm
        defaultTerminal="auto"
        terminalCustomCommand=""
        saveState="idle"
        saveMessage={null}
        onDefaultTerminalChange={onDefaultTerminalChange}
        onTerminalCustomCommandChange={onTerminalCustomCommandChange}
        onSave={onSave}
        {...overrides}
      />,
    );
  }

  it("renders the terminal label and dropdown trigger", () => {
    renderForm();

    expect(
      screen.getByText("Terminal for Open Terminal and testing actions"),
    ).toBeInTheDocument();
    expect(screen.getByText("Auto (recommended)")).toBeInTheDocument();
  });

  it("renders the custom command input disabled when terminal is not custom", () => {
    renderForm({ defaultTerminal: "auto" });

    const customInput = screen.getByLabelText("Custom command fallback");
    expect(customInput).toBeDisabled();
  });

  it("renders the custom command input enabled when terminal is custom", () => {
    renderForm({ defaultTerminal: "custom" });

    const customInput = screen.getByLabelText("Custom command fallback");
    expect(customInput).not.toBeDisabled();
  });

  it("calls onTerminalCustomCommandChange when typing in custom command input", () => {
    renderForm({ defaultTerminal: "custom", terminalCustomCommand: "" });

    const customInput = screen.getByLabelText("Custom command fallback");
    fireEvent.change(customInput, { target: { value: "my-term" } });

    expect(onTerminalCustomCommandChange).toHaveBeenCalledWith("my-term");
  });

  it("calls onSave when Save button is clicked", () => {
    renderForm();

    const saveButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables Save button when saveState is saving", () => {
    renderForm({ saveState: "saving" });

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it("displays success message when saveState is success", () => {
    renderForm({ saveState: "success", saveMessage: "Settings saved!" });

    expect(screen.getByText("Settings saved!")).toBeInTheDocument();
  });

  it("displays error message when saveState is error", () => {
    renderForm({ saveState: "error", saveMessage: "Failed to save." });

    expect(screen.getByText("Failed to save.")).toBeInTheDocument();
  });

  it("does not display messages when saveMessage is null", () => {
    renderForm({ saveState: "success", saveMessage: null });

    expect(screen.queryByText("Settings saved!")).not.toBeInTheDocument();
  });

  it("shows the selected terminal label for a non-auto terminal", () => {
    renderForm({ defaultTerminal: "kitty" });

    expect(screen.getByText("Kitty")).toBeInTheDocument();
  });

  it("shows Select terminal when no matching option is found", () => {
    renderForm({
      defaultTerminal: "unknown_terminal" as Parameters<
        typeof TerminalSettingsForm
      >[0]["defaultTerminal"],
    });

    expect(screen.getByText("Select terminal")).toBeInTheDocument();
  });

  it("renders custom command helper text", () => {
    renderForm();

    expect(
      screen.getByText(/Used when terminal is set to Custom command/),
    ).toBeInTheDocument();
  });

  it("disables custom command input when saveState is saving", () => {
    renderForm({ defaultTerminal: "custom", saveState: "saving" });

    const customInput = screen.getByLabelText("Custom command fallback");
    expect(customInput).toBeDisabled();
  });

  it("disables dropdown trigger when saveState is saving", () => {
    renderForm({ saveState: "saving" });

    const trigger = screen.getByText("Auto (recommended)").closest("button")!;
    expect(trigger).toBeDisabled();
  });

  it("shows Custom command label for custom terminal", () => {
    renderForm({ defaultTerminal: "custom" });

    expect(screen.getByText("Custom command")).toBeInTheDocument();
  });

  it("shows correct label for each supported terminal", () => {
    const terminalLabels: Array<{
      value: Parameters<typeof TerminalSettingsForm>[0]["defaultTerminal"];
      label: string;
    }> = [
      { value: "auto", label: "Auto (recommended)" },
      { value: "ghostty", label: "Ghostty" },
      { value: "warp", label: "Warp" },
      { value: "kitty", label: "Kitty" },
      { value: "gnome", label: "GNOME Terminal" },
      { value: "xterm", label: "xterm" },
      { value: "none", label: "None" },
      { value: "custom", label: "Custom command" },
    ];

    for (const { value, label } of terminalLabels) {
      const { unmount } = renderForm({ defaultTerminal: value });
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the custom command value", () => {
    renderForm({
      defaultTerminal: "custom",
      terminalCustomCommand: "alacritty",
    });

    const customInput = screen.getByLabelText("Custom command fallback");
    expect(customInput).toHaveValue("alacritty");
  });
});
