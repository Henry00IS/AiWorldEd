/** Linear sRGB channels in 0..1 (may fall outside before gamut mapping). */
export type ColorCollaborationLinear = [number, number, number];

/** Chroma steps of the gamut search. */
const COLOR_COLLABORATION_GAMUT_STEPS = 16;

/**
 * Converts an OKLCH color to linear sRGB (Björn Ottosson's OKLab matrices).
 *
 * @param lightness OKLab lightness in 0..1.
 * @param chroma OKLCH chroma.
 * @param hue Hue in degrees.
 * @returns Linear sRGB channels, possibly out of gamut.
 */
export function colorCollaborationOklchLinear(
  lightness: number,
  chroma: number,
  hue: number,
): ColorCollaborationLinear {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * Returns whether linear sRGB channels lie inside the sRGB gamut.
 *
 * @param linear Linear channels.
 * @returns True when every channel is in 0..1.
 */
export function colorCollaborationInGamut(linear: ColorCollaborationLinear): boolean {
  return linear.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}

/**
 * Maps an OKLCH color into sRGB by lowering chroma until it fits, which keeps
 * lightness and hue (and so the perceived difference between members).
 *
 * @param lightness OKLab lightness in 0..1.
 * @param chroma Wanted chroma.
 * @param hue Hue in degrees.
 * @returns Packed 0xRRGGBB color.
 */
export function colorCollaborationOklch(lightness: number, chroma: number, hue: number): number {
  let low = 0;
  let high = chroma;
  if (colorCollaborationInGamut(colorCollaborationOklchLinear(lightness, high, hue))) low = high;
  for (let step = 0; step < COLOR_COLLABORATION_GAMUT_STEPS && low < high; step++) {
    const middle = (low + high) / 2;
    if (colorCollaborationInGamut(colorCollaborationOklchLinear(lightness, middle, hue))) low = middle;
    else high = middle;
  }
  return colorCollaborationPack(colorCollaborationOklchLinear(lightness, low, hue));
}

/**
 * Packs linear sRGB channels into a gamma-encoded 0xRRGGBB color.
 *
 * @param linear Linear channels.
 * @returns Packed color.
 */
export function colorCollaborationPack(linear: ColorCollaborationLinear): number {
  return linear.reduce((packed, channel) => packed * 256 + colorCollaborationByte(channel), 0);
}

/**
 * Gamma-encodes one linear channel to a byte.
 *
 * @param linear Linear channel.
 * @returns Byte 0..255.
 */
function colorCollaborationByte(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}
