/** Whether a stroke adds color or removes earlier paint. */
export type PaintStrokeMode = 'paint' | 'erase';

/** Floats stored per dab: center xyz, forward xyz, up xyz (brush-local). */
export const PAINT_DAB_STRIDE = 9;

/**
 * One recorded stroke on one brush. Dabs are projectors in the brush's local
 * space; the record is immutable once created so it can be shared by copies.
 */
export interface PaintStroke {
  /** Stable id shared by every brush the stroke reached. */
  readonly id: string;
  /** Per-brush order; lower orders are applied first. */
  readonly order: number;
  /** Paint or erase. */
  readonly mode: PaintStrokeMode;
  /** Dab shape id from the shape catalog. */
  readonly shape: string;
  /**
   * Texture id whose brightness masks the stroke, tiled on the surface, or
   * empty.
   */
  readonly stencilTextureId: string;
  /** Brush-local units covered by one repeat of the stencil. */
  readonly stencilScale: number;
  /** Texture id printed by image stamps (shape `image`), or empty. */
  readonly stampTextureId: string;
  /** Display-space color as 0xRRGGBB. */
  readonly color: number;
  /** Strength of each dab, 0 to 1. */
  readonly opacity: number;
  /** Edge hardness of round dabs, 0 to 1. */
  readonly hardness: number;
  /** Dab radius in brush-local units. */
  readonly radius: number;
  /** Packed dabs, {@link PAINT_DAB_STRIDE} floats each. */
  readonly dabs: Float32Array;
}

/**
 * Returns the number of dabs in a stroke.
 *
 * @param stroke Stroke record.
 * @returns Dab count.
 */
export function paintStrokeDabCount(stroke: PaintStroke): number {
  return Math.floor(stroke.dabs.length / PAINT_DAB_STRIDE);
}

/**
 * Creates a fresh stroke id that is unique across members and sessions.
 *
 * @returns Stroke id.
 */
export function paintStrokeIdCreate(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let text = 's';
  for (const byte of bytes) text += byte.toString(36).padStart(2, '0');
  return text;
}

/**
 * Compares two strokes by order, then id, so every member sorts identically.
 *
 * @param left First stroke.
 * @param right Second stroke.
 * @returns Negative, zero or positive.
 */
export function paintStrokeCompare(left: PaintStroke, right: PaintStroke): number {
  if (left.order !== right.order) return left.order - right.order;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}
