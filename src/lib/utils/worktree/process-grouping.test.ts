import { describe, expect, it } from "vitest";

import {
  UNKNOWN_WORKTREE_LABEL,
  detectWorktreeNameFromCommand,
  detectTerminalInstanceKind,
  groupRowsByWorktree,
} from "@/src/lib/utils/worktree/process-grouping";

describe("detectWorktreeNameFromCommand", () => {
  it("detects worktree names from unix and windows command paths", () => {
    expect(
      detectWorktreeNameFromCommand("/tmp/.worktrees/feature-123/bin/run"),
    ).toBe("feature-123");
    expect(
      detectWorktreeNameFromCommand(
        "C:\\repo\\.worktree\\hotfix-2\\script.ps1",
      ),
    ).toBe("hotfix-2");
  });

  it("returns null when no .worktree path segment exists", () => {
    expect(detectWorktreeNameFromCommand("node ./scripts/start.js")).toBeNull();
  });
});

describe("groupRowsByWorktree", () => {
  it("groups by detected worktree and keeps unknown group last", () => {
    const rows = [
      { id: 1, command: "node /repo/.worktrees/bravo/dev.js" },
      { id: 2, command: "node /repo/.worktrees/alpha/dev.js" },
      { id: 3, command: "node scripts/standalone.js" },
    ];

    const grouped = groupRowsByWorktree(rows, (row) => row.command);

    expect(grouped.map((group) => group.worktree)).toEqual([
      "alpha",
      "bravo",
      UNKNOWN_WORKTREE_LABEL,
    ]);
    expect(grouped[2]?.rows.map((row) => row.id)).toEqual([3]);
  });

  it("groups multiple rows into the same worktree", () => {
    const rows = [
      { id: 1, command: "node /repo/.worktrees/alpha/a.js" },
      { id: 2, command: "node /repo/.worktrees/alpha/b.js" },
    ];

    const grouped = groupRowsByWorktree(rows, (row) => row.command);
    expect(grouped.length).toBe(1);
    expect(grouped[0].worktree).toBe("alpha");
    expect(grouped[0].rows.length).toBe(2);
  });

  it("returns empty array for empty input", () => {
    const grouped = groupRowsByWorktree(
      [],
      (row: { command: string }) => row.command,
    );
    expect(grouped).toEqual([]);
  });

  it("puts all rows in unknown group when no worktree is detected", () => {
    const rows = [
      { id: 1, command: "node server.js" },
      { id: 2, command: "python app.py" },
    ];

    const grouped = groupRowsByWorktree(rows, (row) => row.command);
    expect(grouped.length).toBe(1);
    expect(grouped[0].worktree).toBe(UNKNOWN_WORKTREE_LABEL);
    expect(grouped[0].rows.length).toBe(2);
  });
});

describe("detectWorktreeNameFromCommand (additional)", () => {
  it("returns null for empty string", () => {
    expect(detectWorktreeNameFromCommand("")).toBeNull();
  });

  it("handles quoted paths", () => {
    expect(
      detectWorktreeNameFromCommand('"/path/.worktrees/my-branch/run"'),
    ).toBe("my-branch");
  });

  it("handles .worktree singular form", () => {
    expect(
      detectWorktreeNameFromCommand("/repo/.worktree/feat/script.sh"),
    ).toBe("feat");
  });
});

describe("detectTerminalInstanceKind", () => {
  it("returns 'Terminal' for empty string", () => {
    expect(detectTerminalInstanceKind("")).toBe("Terminal");
  });

  it("returns 'Terminal' for whitespace-only string", () => {
    expect(detectTerminalInstanceKind("   ")).toBe("Terminal");
  });

  it("returns 'Node' for node command", () => {
    expect(detectTerminalInstanceKind("node server.js")).toBe("Node");
  });

  it("returns 'Node' for npm command", () => {
    expect(detectTerminalInstanceKind("npm run dev")).toBe("Node");
  });

  it("returns 'Node' for pnpm command", () => {
    expect(detectTerminalInstanceKind("pnpm install")).toBe("Node");
  });

  it("returns 'Node' for yarn command", () => {
    expect(detectTerminalInstanceKind("yarn build")).toBe("Node");
  });

  it("returns 'OpenCode' for opencode command", () => {
    expect(detectTerminalInstanceKind("opencode --flag")).toBe("OpenCode");
  });

  it("returns capitalized executable name for unknown commands", () => {
    expect(detectTerminalInstanceKind("python script.py")).toBe("Python");
  });

  it("extracts executable from full path", () => {
    expect(detectTerminalInstanceKind("/usr/bin/python script.py")).toBe(
      "Python",
    );
  });

  it("extracts executable from windows path", () => {
    expect(detectTerminalInstanceKind("C:\\Programs\\node server.js")).toBe(
      "Node",
    );
  });

  it("returns 'Terminal' when executable is empty after splitting", () => {
    // A command like "/" where the last segment after split is ""
    expect(detectTerminalInstanceKind("/")).toBe("Terminal");
  });
});
