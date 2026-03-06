import { DEFAULT_OPENCODE_SETTINGS_DIRECTORY, type OpencodeSettings } from "@/src/lib/ipc";

export type OpencodeConfigScope = "workspace" | "global";

type ParseImportResult =
  | { ok: true; settings: OpencodeSettings }
  | { ok: false; error: string };

type OpencodeConfigArtifact = {
  schema: "groove-opencode-config";
  version: 1;
  scope: OpencodeConfigScope;
  exportedAt: string;
  settings: OpencodeSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeImportedSettings(value: unknown): OpencodeSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const enabled = value.enabled;
  const defaultModel = value.defaultModel;
  const settingsDirectory = value.settingsDirectory;
  if (typeof enabled !== "boolean") {
    return null;
  }

  if (defaultModel !== undefined && defaultModel !== null && typeof defaultModel !== "string") {
    return null;
  }
  if (settingsDirectory !== undefined && settingsDirectory !== null && typeof settingsDirectory !== "string") {
    return null;
  }

  return {
    enabled,
    defaultModel: typeof defaultModel === "string" ? defaultModel.trim() || null : null,
    settingsDirectory:
      typeof settingsDirectory === "string" && settingsDirectory.trim().length > 0
        ? settingsDirectory.trim()
        : DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
  };
}

export function buildOpencodeConfigArtifact(scope: OpencodeConfigScope, settings: OpencodeSettings): OpencodeConfigArtifact {
  return {
    schema: "groove-opencode-config",
    version: 1,
    scope,
    exportedAt: new Date().toISOString(),
    settings: {
      enabled: settings.enabled,
      defaultModel: settings.defaultModel ?? null,
      settingsDirectory: settings.settingsDirectory,
    },
  };
}

export function parseImportedOpencodeSettings(rawJson: string, expectedScope: OpencodeConfigScope): ParseImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      error: "Import file is not valid JSON.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: "Import file must contain a JSON object.",
    };
  }

  const scopeValue = parsed.scope;
  if (scopeValue !== undefined && scopeValue !== expectedScope) {
    return {
      ok: false,
      error: `Import file scope mismatch. Expected ${expectedScope} config.`,
    };
  }

  const settingsCandidate = "settings" in parsed ? parsed.settings : parsed;
  const normalized = normalizeImportedSettings(settingsCandidate);
  if (!normalized) {
    return {
      ok: false,
      error: "Import file must include Opencode settings with a boolean enabled value.",
    };
  }

  return {
    ok: true,
    settings: normalized,
  };
}
