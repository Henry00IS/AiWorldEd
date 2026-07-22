/**
 * Converts a hex color number to an RGB CSS string.
 * @param hex The hex color value as a number.
 * @returns An RGB CSS color string.
 */
export function hexToRgb(hex: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgb(${r}, ${g}, ${b})`;
}
