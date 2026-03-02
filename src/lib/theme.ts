import { DEFAULT_THEME_MODE, THEME_STORAGE_KEY, type ThemeMode } from "@/src/lib/theme-constants";

const DARK_THEME_MODES: ReadonlySet<ThemeMode> = new Set(["lava", "earth", "dark", "dark-groove"]);

function isThemeMode(value: string): value is ThemeMode {
  return (
    value === "light" ||
    value === "groove" ||
    value === "ice" ||
    value === "lava" ||
    value === "earth" ||
    value === "wind" ||
    value === "dark-groove" ||
    value === "dark"
  );
}

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function resolveStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_MODE;
  }

  const storedTheme = readStoredTheme();
  if (!storedTheme || !isThemeMode(storedTheme)) {
    return DEFAULT_THEME_MODE;
  }

  return storedTheme;
}

export function applyThemeToDom(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.dataset.theme = mode;
  rootElement.classList.toggle("dark", DARK_THEME_MODES.has(mode));
}

export function persistTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function setTheme(mode: ThemeMode): void {
  applyThemeToDom(mode);
  persistTheme(mode);
}
