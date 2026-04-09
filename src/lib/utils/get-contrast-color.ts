/**
 * Returns "black" or "white" depending on which provides better contrast
 * against the given background hex color.
 *
 * Uses the WCAG relative luminance formula to determine perceived brightness.
 */
export function getContrastColor(hexColor: string): "black" | "white" {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const linearR = r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4;
  const linearG = g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4;
  const linearB = b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4;

  const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;

  return luminance > 0.179 ? "black" : "white";
}
