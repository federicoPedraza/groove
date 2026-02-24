const ALWAYS_SHOW_DIAGNOSTICS_SIDEBAR_STORAGE_KEY = "groove:always-show-diagnostics-sidebar";
const ABOUT_GROOVE_SETTINGS_UPDATED_EVENT = "groove:about-groove-settings-updated";

function parseStoredBoolean(value: string | null): boolean {
  return value === "true";
}

export function isAlwaysShowDiagnosticsSidebarEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return parseStoredBoolean(window.localStorage.getItem(ALWAYS_SHOW_DIAGNOSTICS_SIDEBAR_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function setAlwaysShowDiagnosticsSidebarEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ALWAYS_SHOW_DIAGNOSTICS_SIDEBAR_STORAGE_KEY, String(enabled));
  } catch {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(ABOUT_GROOVE_SETTINGS_UPDATED_EVENT, {
      detail: { alwaysShowDiagnosticsSidebar: enabled },
    }),
  );
}

export function subscribeToAboutGrooveSettings(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key === ALWAYS_SHOW_DIAGNOSTICS_SIDEBAR_STORAGE_KEY) {
      callback();
    }
  };

  const onSettingsUpdated = (): void => {
    callback();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(ABOUT_GROOVE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ABOUT_GROOVE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);
  };
}
