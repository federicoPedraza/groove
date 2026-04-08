import { describe, expect, it } from "vitest";

import { buildOpencodeConfigArtifact, parseImportedOpencodeSettings } from "@/src/lib/opencode-config-artifact";

describe("opencode config artifact", () => {
  it("builds an export artifact with expected schema", () => {
    const artifact = buildOpencodeConfigArtifact("workspace", {
      enabled: true,
      defaultModel: "gpt-5.3-codex",
      settingsDirectory: "~/.config/opencode",
    });

    expect(artifact.schema).toBe("groove-opencode-config");
    expect(artifact.version).toBe(1);
    expect(artifact.scope).toBe("workspace");
    expect(artifact.settings).toEqual({
      enabled: true,
      defaultModel: "gpt-5.3-codex",
      settingsDirectory: "~/.config/opencode",
    });
  });

  it("parses a valid artifact for the expected scope", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({
        scope: "global",
        settings: {
          enabled: false,
          defaultModel: "gpt-5.3-codex",
          settingsDirectory: "~/.config/opencode",
        },
      }),
      "global",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual({
        enabled: false,
        defaultModel: "gpt-5.3-codex",
        settingsDirectory: "~/.config/opencode",
      });
    }
  });

  it("rejects malformed payloads", () => {
    const result = parseImportedOpencodeSettings("{not-json}", "workspace");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("valid JSON");
    }
  });

  it("rejects scope mismatches", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({
        scope: "global",
        settings: {
          enabled: true,
        },
      }),
      "workspace",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("scope mismatch");
    }
  });

  it("rejects non-object JSON payloads", () => {
    const result = parseImportedOpencodeSettings(JSON.stringify("just a string"), "workspace");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("JSON object");
    }
  });

  it("rejects when enabled is not a boolean", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: "yes" } }),
      "workspace",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("boolean enabled");
    }
  });

  it("rejects when defaultModel is not a string or null", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, defaultModel: 123 } }),
      "workspace",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("boolean enabled");
    }
  });

  it("rejects when settingsDirectory is not a string or null", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, settingsDirectory: 456 } }),
      "workspace",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("boolean enabled");
    }
  });

  it("normalizes empty defaultModel to null", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, defaultModel: "  " } }),
      "workspace",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.defaultModel).toBeNull();
    }
  });

  it("normalizes null defaultModel to null", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, defaultModel: null } }),
      "workspace",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.defaultModel).toBeNull();
    }
  });

  it("uses default settings directory when settingsDirectory is empty", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, settingsDirectory: "" } }),
      "workspace",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.settingsDirectory).toBe("~/.config/opencode");
    }
  });

  it("uses default settings directory when settingsDirectory is null", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true, settingsDirectory: null } }),
      "workspace",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.settingsDirectory).toBe("~/.config/opencode");
    }
  });

  it("parses top-level settings without settings wrapper", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ enabled: false, defaultModel: "model-x" }),
      "workspace",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.enabled).toBe(false);
      expect(result.settings.defaultModel).toBe("model-x");
    }
  });

  it("allows undefined scope to pass scope check", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: { enabled: true } }),
      "global",
    );
    expect(result.ok).toBe(true);
  });

  it("builds artifact with null defaultModel", () => {
    const artifact = buildOpencodeConfigArtifact("global", {
      enabled: false,
      defaultModel: null,
      settingsDirectory: "~/.config/opencode",
    });
    expect(artifact.settings.defaultModel).toBeNull();
  });

  it("rejects settings that are not a record", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({ settings: "not-an-object" }),
      "workspace",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("boolean enabled");
    }
  });
});
