export type ThemeMode = "light" | "groove" | "ice" | "lava" | "earth" | "wind" | "dark-groove" | "dark";

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
    value: "ice",
    label: "Ice",
    description: "Crisp cool palette with glacial blue highlights.",
  },
  {
    value: "lava",
    label: "Lava",
    description: "Volcanic dark palette with ember-orange contrast.",
  },
  {
    value: "earth",
    label: "Earth",
    description: "Grounded dark palette with moss and clay tones.",
  },
  {
    value: "wind",
    label: "Wind",
    description: "Airy light palette with soft sky-blue neutrals.",
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
