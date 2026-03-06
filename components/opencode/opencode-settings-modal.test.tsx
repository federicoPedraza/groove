import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OpencodeSettingsModal } from "@/components/opencode/opencode-settings-modal";

const opencodeListSkillsMock = vi.fn();
const validateOpencodeSettingsDirectoryMock = vi.fn();
const opencodeUpdateWorkspaceSettingsMock = vi.fn();
const opencodeUpdateGlobalSettingsMock = vi.fn();

vi.mock("@/src/lib/ipc", () => ({
  DEFAULT_OPENCODE_SETTINGS_DIRECTORY: "~/.config/opencode",
  opencodeListSkills: (...args: unknown[]) => opencodeListSkillsMock(...args),
  validateOpencodeSettingsDirectory: (...args: unknown[]) => validateOpencodeSettingsDirectoryMock(...args),
  opencodeUpdateWorkspaceSettings: (...args: unknown[]) => opencodeUpdateWorkspaceSettingsMock(...args),
  opencodeUpdateGlobalSettings: (...args: unknown[]) => opencodeUpdateGlobalSettingsMock(...args),
}));

describe("OpencodeSettingsModal", () => {
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

    render(
      <OpencodeSettingsModal
        open
        workspaceRoot="/repo"
        effectiveScope="workspace"
        workspaceSettings={{ enabled: true, defaultModel: null, settingsDirectory: "~/.config/opencode" }}
        globalSettings={{ enabled: true, defaultModel: null, settingsDirectory: "~/.config/opencode" }}
        statusMessage={null}
        errorMessage={null}
        onSettingsSaved={() => {}}
        onOpenChange={() => {}}
      />,
    );

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

    render(
      <OpencodeSettingsModal
        open
        workspaceRoot="/repo"
        effectiveScope="global"
        workspaceSettings={{ enabled: false, defaultModel: null, settingsDirectory: "~/.config/opencode" }}
        globalSettings={{ enabled: true, defaultModel: null, settingsDirectory: "~/.config/opencode" }}
        statusMessage={null}
        errorMessage={null}
        onSettingsSaved={() => {}}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Global scope")).toBeTruthy();
      expect(screen.getByText(/Workspace scope appears only/)).toBeTruthy();
    });
  });
});
