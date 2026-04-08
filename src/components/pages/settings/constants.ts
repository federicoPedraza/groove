import type { DefaultTerminal } from "@/src/lib/ipc";

export const SUPPORTED_TERMINAL_OPTIONS: Array<{ value: DefaultTerminal; label: string }> = [
  { value: "auto", label: "Auto (recommended)" },
  { value: "ghostty", label: "Ghostty" },
  { value: "warp", label: "Warp" },
  { value: "kitty", label: "Kitty" },
  { value: "gnome", label: "GNOME Terminal" },
  { value: "xterm", label: "xterm" },
  { value: "none", label: "None" },
  { value: "custom", label: "Custom command" },
];
