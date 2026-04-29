import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyThemeToDom,
  persistTheme,
  resolveStoredTheme,
  setTheme,
} from "@/src/lib/theme";

const THEME_STORAGE_KEY = "groove.theme-mode";
const DEFAULT_THEME_MODE = "groove";

describe("resolveStoredTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the stored theme when it is a valid ThemeMode", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "ice");
    expect(resolveStoredTheme()).toBe("ice");
  });

  it("returns default when nothing is stored", () => {
    expect(resolveStoredTheme()).toBe(DEFAULT_THEME_MODE);
  });

  it("returns default when an invalid value is stored", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(resolveStoredTheme()).toBe(DEFAULT_THEME_MODE);
  });

  it("returns default when stored value is empty string", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "");
    expect(resolveStoredTheme()).toBe(DEFAULT_THEME_MODE);
  });

  it("recognises every valid ThemeMode", () => {
    const validModes = [
      "light",
      "groove",
      "ice",
      "gum",
      "lava",
      "earth",
      "wind",
      "dark-groove",
      "dark",
    ] as const;
    for (const mode of validModes) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      expect(resolveStoredTheme()).toBe(mode);
    }
  });

  it("returns default when localStorage.getItem throws", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(resolveStoredTheme()).toBe(DEFAULT_THEME_MODE);
    getItemSpy.mockRestore();
  });
});

describe("applyThemeToDom", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("sets data-theme attribute on the root element", () => {
    applyThemeToDom("ice");
    expect(document.documentElement.dataset.theme).toBe("ice");
  });

  it("adds 'dark' class for dark themes", () => {
    for (const darkMode of ["lava", "earth", "dark", "dark-groove"] as const) {
      applyThemeToDom(darkMode);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    }
  });

  it("removes 'dark' class for light themes", () => {
    document.documentElement.classList.add("dark");
    applyThemeToDom("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does not add 'dark' for non-dark themes", () => {
    for (const lightMode of [
      "light",
      "groove",
      "ice",
      "gum",
      "wind",
    ] as const) {
      document.documentElement.classList.remove("dark");
      applyThemeToDom(lightMode);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    }
  });
});

describe("persistTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("writes the theme to localStorage", () => {
    persistTheme("lava");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("lava");
  });

  it("does not throw when localStorage.setItem throws", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => persistTheme("gum")).not.toThrow();
    setItemSpy.mockRestore();
  });
});

describe("setTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("applies theme to DOM and persists it", () => {
    setTheme("earth");
    expect(document.documentElement.dataset.theme).toBe("earth");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("earth");
  });

  it("applies a light theme correctly", () => {
    setTheme("wind");
    expect(document.documentElement.dataset.theme).toBe("wind");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("wind");
  });
});
