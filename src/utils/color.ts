/**
 * Converts a CSS hex color string (e.g., "#ff00aa" or "ff00aa") to a numeric 24-bit integer.
 * 
 * @param hex - The hex color string.
 * @returns The color represented as an integer.
 */
export function hexColorToNumber(hex: string): number {
  const cleanHex = hex.trim().replace(/^#/, "");
  
  if (cleanHex.length === 3) {
    const r = cleanHex[0] + cleanHex[0];
    const g = cleanHex[1] + cleanHex[1];
    const b = cleanHex[2] + cleanHex[2];
    return parseInt(r + g + b, 16);
  }
  
  const value = parseInt(cleanHex, 16);
  return isNaN(value) ? 0 : value & 0xffffff;
}

/**
 * Converts a numeric 24-bit integer to a CSS hex color string (e.g., "#ff00aa").
 * 
 * @param colorNumber - The color integer.
 * @returns The hex color string.
 */
export function numberToHexColor(colorNumber: number): string {
  const hex = (colorNumber & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

/**
 * Calculates the dynamic accent-foreground color (either black "#000000" or white "#ffffff")
 * based on the YIQ contrast formula of the background hex color.
 * 
 * @param hexColor - The CSS hex color string.
 * @returns The foreground color ("#000000" or "#ffffff").
 */
export function getAccentForeground(hexColor: string): string {
  const cleanHex = hexColor.trim().replace(/^#/, "");
  
  let r = 0;
  let g = 0;
  let b = 0;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else {
    const val = parseInt(cleanHex, 16);
    if (!isNaN(val)) {
      r = (val >> 16) & 0xff;
      g = (val >> 8) & 0xff;
      b = val & 0xff;
    }
  }

  // Calculate YIQ contrast ratio
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

