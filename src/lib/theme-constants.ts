export type ThemeMode = "light" | "groove" | "dark-groove" | "dark";

export const DEFAULT_THEME_MODE: ThemeMode = "groove";
export const THEME_STORAGE_KEY = "groove.theme-mode";

export const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string; description: string }> = [
  {
    value: "light",
    label: "Light",
    description: "Neutral light palette with subtle contrast.",
  },
  {
    value: "groove",
    label: "Groove",
    description: "Signature Groove palette with yellow-green accents.",
  },
  {
    value: "dark-groove",
    label: "Dark Groove",
    description: "Dark surfaces paired with Groove hue accents.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Neutral dark palette for low-light environments.",
  },
];
