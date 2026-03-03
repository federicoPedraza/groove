import { describe, expect, it } from "vitest";

import { buildOpencodeConfigArtifact, parseImportedOpencodeSettings } from "@/src/lib/opencode-config-artifact";

describe("opencode config artifact", () => {
  it("builds an export artifact with expected schema", () => {
    const artifact = buildOpencodeConfigArtifact("workspace", {
      enabled: true,
      defaultModel: "gpt-5.3-codex",
    });

    expect(artifact.schema).toBe("groove-opencode-config");
    expect(artifact.version).toBe(1);
    expect(artifact.scope).toBe("workspace");
    expect(artifact.settings).toEqual({
      enabled: true,
      defaultModel: "gpt-5.3-codex",
    });
  });

  it("parses a valid artifact for the expected scope", () => {
    const result = parseImportedOpencodeSettings(
      JSON.stringify({
        scope: "global",
        settings: {
          enabled: false,
          defaultModel: "gpt-5.3-codex",
        },
      }),
      "global",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual({
        enabled: false,
        defaultModel: "gpt-5.3-codex",
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
});
