import { describe, it, expect } from "vitest";

vi.mock("lucide-react", () => {
  const stub = () => null;
  return {
    Apple: stub,
    Banana: stub,
    Bean: stub,
    Beef: stub,
    Candy: stub,
    Carrot: stub,
    Coffee: stub,
    Cookie: stub,
    Croissant: stub,
    Grape: stub,
    Hamburger: stub,
    IceCreamCone: stub,
    Pizza: stub,
    Sandwich: stub,
  };
});

import { vi } from "vitest";

import { getCommandMetadata } from "@/src/lib/command-metadata";

describe("getCommandMetadata", () => {
  it("returns mapped metadata for known commands", () => {
    const result = getCommandMetadata("groove_restore");
    expect(result.title).toBe("Restore Groove");
    expect(result.description).toBe(
      "Reopens a worktree session and restores its context.",
    );
    expect(result.icon).toBeDefined();
  });

  it("returns correct metadata for groove_new", () => {
    expect(getCommandMetadata("groove_new").title).toBe("Create Worktree");
  });

  it("returns correct metadata for groove_rm", () => {
    expect(getCommandMetadata("groove_rm").title).toBe("Cut Groove");
  });

  it("returns correct metadata for groove_stop", () => {
    expect(getCommandMetadata("groove_stop").title).toBe("Stop Groove");
  });

  it("returns correct metadata for diagnostics_stop_process", () => {
    expect(getCommandMetadata("diagnostics_stop_process").title).toBe(
      "Diagnostics: Stop Process",
    );
  });

  it("returns correct metadata for diagnostics_list_worktree_node_apps", () => {
    expect(
      getCommandMetadata("diagnostics_list_worktree_node_apps").title,
    ).toBe("Diagnostics: Node Apps");
  });

  it("returns correct metadata for diagnostics_clean_all_dev_servers", () => {
    expect(getCommandMetadata("diagnostics_clean_all_dev_servers").title).toBe(
      "Diagnostics: Clean Dev Servers",
    );
  });

  it("returns correct metadata for diagnostics_get_msot_consuming_programs", () => {
    expect(
      getCommandMetadata("diagnostics_get_msot_consuming_programs").title,
    ).toBe("Diagnostics: Heavy Processes");
  });

  it("returns correct metadata for diagnostics_get_system_overview", () => {
    expect(getCommandMetadata("diagnostics_get_system_overview").title).toBe(
      "Diagnostics: System Overview",
    );
  });

  it("returns correct metadata for workspace_pick_and_open", () => {
    expect(getCommandMetadata("workspace_pick_and_open").title).toBe(
      "Open Workspace",
    );
  });

  it("returns correct metadata for workspace_open", () => {
    expect(getCommandMetadata("workspace_open").title).toBe("Rescan Workspace");
  });

  it("returns correct metadata for workspace_clear_active", () => {
    expect(getCommandMetadata("workspace_clear_active").title).toBe(
      "Close Workspace",
    );
  });

  it("returns correct metadata for workspace_update_terminal_settings", () => {
    expect(getCommandMetadata("workspace_update_terminal_settings").title).toBe(
      "Update Terminal Settings",
    );
  });

  it("falls back to humanized command id for unknown commands", () => {
    const result = getCommandMetadata("unknown_fancy_command");
    expect(result.title).toBe("Unknown Fancy Command");
    expect(result.description).toBe(
      "Runs an application command through the IPC bridge.",
    );
  });

  it("humanizes single-word command", () => {
    expect(getCommandMetadata("deploy").title).toBe("Deploy");
  });

  it("handles empty segments from leading underscores", () => {
    expect(getCommandMetadata("_leading_underscore").title).toBe(
      "Leading Underscore",
    );
  });
});
