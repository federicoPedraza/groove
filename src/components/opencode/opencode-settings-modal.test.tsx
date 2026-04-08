import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpencodeSettingsModal } from "@/src/components/opencode/opencode-settings-modal";

const opencodeListSkillsMock = vi.fn();
const validateOpencodeSettingsDirectoryMock = vi.fn();
const opencodeUpdateWorkspaceSettingsMock = vi.fn();
const opencodeUpdateGlobalSettingsMock = vi.fn();
const opencodeCopySkillsMock = vi.fn();

vi.mock("@/src/lib/ipc", () => ({
  DEFAULT_OPENCODE_SETTINGS_DIRECTORY: "~/.config/opencode",
  opencodeListSkills: (...args: unknown[]) => opencodeListSkillsMock(...args),
  opencodeCopySkills: (...args: unknown[]) => opencodeCopySkillsMock(...args),
  validateOpencodeSettingsDirectory: (...args: unknown[]) => validateOpencodeSettingsDirectoryMock(...args),
  opencodeUpdateWorkspaceSettings: (...args: unknown[]) => opencodeUpdateWorkspaceSettingsMock(...args),
  opencodeUpdateGlobalSettings: (...args: unknown[]) => opencodeUpdateGlobalSettingsMock(...args),
}));

const defaultProps = {
  open: true,
  workspaceRoot: "/repo" as string | null,
  effectiveScope: "workspace" as const,
  workspaceSettings: { enabled: true, defaultModel: null, settingsDirectory: "~/.config/opencode" },
  globalSettings: { enabled: true, defaultModel: null, settingsDirectory: "~/.config/opencode" },
  statusMessage: null as string | null,
  errorMessage: null as string | null,
  onSettingsSaved: vi.fn(),
  onOpenChange: vi.fn(),
};

describe("OpencodeSettingsModal", () => {
  beforeEach(() => {
    opencodeListSkillsMock.mockReset();
    validateOpencodeSettingsDirectoryMock.mockReset();
    opencodeUpdateWorkspaceSettingsMock.mockReset();
    opencodeUpdateGlobalSettingsMock.mockReset();
    opencodeCopySkillsMock.mockReset();
    defaultProps.onSettingsSaved.mockClear();
    defaultProps.onOpenChange.mockClear();
    window.localStorage.clear();
  });

  it("renders global and workspace skills when both scopes are available", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "react-19", path: "/home/test/.opencode/skills/react-19", isDirectory: true, hasSkillMarkdown: true }],
      },
      workspaceScope: {
        scope: "workspace",
        rootPath: "/repo/.opencode",
        skillsPath: "/repo/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "sdd-apply", path: "/repo/.opencode/skills/sdd-apply", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    expect(screen.getByText("Skills visualizer")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Global scope")).toBeTruthy();
      expect(screen.getByText("Workspace scope")).toBeTruthy();
      expect(screen.getByText(/react-19/)).toBeTruthy();
      expect(screen.getByText(/sdd-apply/)).toBeTruthy();
    });
  });

  it("shows workspace unavailable message when workspace scope is missing", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: false,
        skills: [],
      },
      workspaceScope: undefined,
    });

    render(<OpencodeSettingsModal {...defaultProps} effectiveScope="global" />);

    await waitFor(() => {
      expect(screen.getByText("Global scope")).toBeTruthy();
      expect(screen.getByText(/Workspace scope appears only/)).toBeTruthy();
    });
  });

  it("validates directory successfully", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockResolvedValueOnce({
      ok: true,
      resolvedPath: "/home/test/.config/opencode",
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText(/Validated Opencode settings directory at/)).toBeTruthy();
    });
  });

  it("shows validation error when directory is invalid", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockResolvedValueOnce({
      ok: false,
      error: "Directory not found",
      directoryExists: false,
      opencodeConfigExists: false,
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText(/Directory not found/)).toBeTruthy();
    });
  });

  it("shows validation error when directory exists but config missing", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockResolvedValueOnce({
      ok: false,
      error: "Invalid directory",
      directoryExists: true,
      opencodeConfigExists: false,
      resolvedPath: "/some/path",
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText(/opencode.json is missing/)).toBeTruthy();
    });
  });

  it("handles validation exception", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockRejectedValueOnce(new Error("Net"));

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText("Failed to validate Opencode settings directory.")).toBeTruthy();
    });
  });

  it("saves workspace settings directory", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateWorkspaceSettingsMock.mockResolvedValueOnce({ ok: true });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(opencodeUpdateWorkspaceSettingsMock).toHaveBeenCalled();
      expect(screen.getByText("Opencode settings directory saved.")).toBeTruthy();
    });
    expect(defaultProps.onSettingsSaved).toHaveBeenCalledWith("Opencode settings updated.");
  });

  it("saves global settings directory when effectiveScope is global", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateGlobalSettingsMock.mockResolvedValueOnce({ ok: true });

    render(<OpencodeSettingsModal {...defaultProps} effectiveScope="global" />);

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(opencodeUpdateGlobalSettingsMock).toHaveBeenCalled();
      expect(screen.getByText("Opencode settings directory saved.")).toBeTruthy();
    });
  });

  it("shows error when workspace save fails", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateWorkspaceSettingsMock.mockResolvedValueOnce({
      ok: false,
      error: "Save error",
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(screen.getByText(/Save error/)).toBeTruthy();
    });
  });

  it("shows error when global save fails", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateGlobalSettingsMock.mockResolvedValueOnce({
      ok: false,
      error: "Global save error",
    });

    render(<OpencodeSettingsModal {...defaultProps} effectiveScope="global" />);

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(screen.getByText(/Global save error/)).toBeTruthy();
    });
  });

  it("handles save exception", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateWorkspaceSettingsMock.mockRejectedValueOnce(new Error("Net"));

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(screen.getByText("Failed to save Opencode settings directory.")).toBeTruthy();
    });
  });

  it("clears validation state when directory input changes", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockResolvedValueOnce({
      ok: true,
      resolvedPath: "/test",
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText(/Validated/)).toBeTruthy();
    });

    const input = screen.getByLabelText("Directory path");
    fireEvent.change(input, { target: { value: "/new/path" } });

    expect(screen.queryByText(/Validated/)).toBeFalsy();
  });

  it("shows skills error when load fails", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: false,
      error: "Skills load error",
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Skills load error")).toBeTruthy();
    });
  });

  it("shows generic skills error when load throws", async () => {
    opencodeListSkillsMock.mockRejectedValueOnce(new Error("Net"));

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load Opencode skills.")).toBeTruthy();
    });
  });

  it("shows status and error messages from props", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });

    render(
      <OpencodeSettingsModal
        {...defaultProps}
        statusMessage="Status from parent"
        errorMessage="Error from parent"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Status from parent")).toBeTruthy();
      expect(screen.getByText("Error from parent")).toBeTruthy();
    });
  });

  it("calls onOpenChange when Close button is clicked", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
    });

    // Click the last Close button (the one in the DialogFooter)
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render when not open", () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    render(<OpencodeSettingsModal {...defaultProps} open={false} />);
    expect(screen.queryByText("Opencode integration")).toBeFalsy();
  });

  it("shows no skills directory found message", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: false,
        skills: [],
      },
      workspaceScope: {
        scope: "workspace",
        rootPath: "/repo/.opencode",
        skillsPath: "/repo/.opencode/skills",
        skillsDirectoryExists: false,
        skills: [],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByText("No skills directory found.").length).toBeGreaterThan(0);
    });
  });

  it("shows no skills found when directory exists but empty", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("No skills found in this scope.")).toBeTruthy();
    });
  });

  it("reloads skills when clicking Reload skills button", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Reload skills")).toBeTruthy();
    });

    // Setup the second call
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-b", path: "/skills/skill-b", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    fireEvent.click(screen.getByText("Reload skills"));

    await waitFor(() => {
      expect(opencodeListSkillsMock).toHaveBeenCalledTimes(2);
    });
  });

  it("validates without resolvedPath", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    validateOpencodeSettingsDirectoryMock.mockResolvedValueOnce({
      ok: true,
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Validate")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Validate"));

    await waitFor(() => {
      expect(screen.getByText("Validated Opencode settings directory.")).toBeTruthy();
    });
  });

  it("marks global skill and shows green color", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/skill-a/)).toBeTruthy();
    });

    // Click on the skill to mark it
    fireEvent.click(screen.getByText(/skill-a/));

    // The skill should now have green styling (marked for copy to workspace)
    const skillElement = screen.getByText(/skill-a/).closest("li");
    expect(skillElement).toBeTruthy();
    expect(skillElement!.className).toContain("text-green-600");
  });

  it("unmarks global skill on second click", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/skill-a/)).toBeTruthy();
    });

    // Click to mark
    fireEvent.click(screen.getByText(/skill-a/));
    // Click to unmark
    fireEvent.click(screen.getByText(/skill-a/));

    const skillElement = screen.getByText(/skill-a/).closest("li");
    expect(skillElement!.className).toContain("text-foreground");
  });

  it("copies marked skills when reload is clicked", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/skill-a/)).toBeTruthy();
    });

    // Mark global skill for copy to workspace
    fireEvent.click(screen.getByText(/skill-a/));

    opencodeCopySkillsMock.mockResolvedValueOnce({
      ok: true,
      copiedToWorkspace: 1,
      copiedToGlobal: 0,
    });
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    fireEvent.click(screen.getByText("Reload skills"));

    await waitFor(() => {
      expect(opencodeCopySkillsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          globalToWorkspace: ["skill-a"],
          workspaceToGlobal: [],
        }),
      );
    });
  });

  it("shows error when copy skills fails", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/skill-a/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/skill-a/));

    opencodeCopySkillsMock.mockResolvedValueOnce({
      ok: false,
      error: "Copy failed",
    });

    fireEvent.click(screen.getByText("Reload skills"));

    await waitFor(() => {
      expect(screen.getByText("Copy failed")).toBeTruthy();
    });
  });

  it("shows generic error when copy skills throws", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [{ name: "skill-a", path: "/skills/skill-a", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/skill-a/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/skill-a/));

    opencodeCopySkillsMock.mockRejectedValueOnce(new Error("Net"));

    fireEvent.click(screen.getByText("Reload skills"));

    await waitFor(() => {
      expect(screen.getByText("Failed to copy selected skills.")).toBeTruthy();
    });
  });

  it("marks workspace skill and shows green color", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({
      ok: true,
      globalScope: {
        scope: "global",
        rootPath: "/home/test/.opencode",
        skillsPath: "/home/test/.opencode/skills",
        skillsDirectoryExists: true,
        skills: [],
      },
      workspaceScope: {
        scope: "workspace",
        rootPath: "/repo/.opencode",
        skillsPath: "/repo/.opencode/skill",
        skillsDirectoryExists: true,
        skills: [{ name: "ws-skill", path: "/repo/.opencode/skill/ws-skill", isDirectory: true, hasSkillMarkdown: true }],
      },
    });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/ws-skill/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/ws-skill/));

    const skillElement = screen.getByText(/ws-skill/).closest("li");
    expect(skillElement!.className).toContain("text-green-600");
  });

  it("updates global skills path input", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Global skills path")).toBeTruthy();
    });

    const input = screen.getByLabelText("Global skills path");
    fireEvent.change(input, { target: { value: "/custom/global/skills" } });
    expect((input as HTMLInputElement).value).toBe("/custom/global/skills");
  });

  it("updates workspace skills path input", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });

    render(<OpencodeSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Workspace skills path")).toBeTruthy();
    });

    const input = screen.getByLabelText("Workspace skills path");
    fireEvent.change(input, { target: { value: "/custom/workspace/skills" } });
    expect((input as HTMLInputElement).value).toBe("/custom/workspace/skills");
  });

  it("saves global settings when workspace scope but no workspaceRoot", async () => {
    opencodeListSkillsMock.mockResolvedValueOnce({ ok: true });
    opencodeUpdateGlobalSettingsMock.mockResolvedValueOnce({ ok: true });

    render(
      <OpencodeSettingsModal
        {...defaultProps}
        effectiveScope="workspace"
        workspaceRoot={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Save path")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Save path"));

    await waitFor(() => {
      expect(opencodeUpdateGlobalSettingsMock).toHaveBeenCalled();
    });
  });
});
