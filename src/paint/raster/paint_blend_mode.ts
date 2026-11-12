/** How a layer combines with the color below it. */
export type PaintBlendMode = 'normal' | 'multiply' | 'add' | 'screen';

/** Every blend mode with its Title Case label, in menu order. */
export const PAINT_BLEND_MODES: readonly { value: PaintBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'add', label: 'Add' },
  { value: 'screen', label: 'Screen' },
];

/**
 * Parses a blend mode, falling back to normal.
 *
 * @param value Candidate.
 * @returns Blend mode.
 */
export function paintBlendModeParse(value: unknown): PaintBlendMode {
  return PAINT_BLEND_MODES.some((mode) => mode.value === value) ? (value as PaintBlendMode) : 'normal';
}

/**
 * Writes the affine form `base·A + B` of one layer sample for one channel.
 *
 * @param mode Blend mode.
 * @param color Layer color channel 0..1.
 * @param alpha Layer coverage times opacity, 0..1.
 * @param target Receives [A, B].
 */
export function paintBlendAffine(mode: PaintBlendMode, color: number, alpha: number, target: Float32Array): void {
  if (mode === 'multiply') {
    target[0] = 1 - alpha + alpha * color;
    target[1] = 0;
    return;
  }
  if (mode === 'add') {
    target[0] = 1;
    target[1] = color * alpha;
    return;
  }
  if (mode === 'screen') {
    target[0] = 1 - color * alpha;
    target[1] = color * alpha;
    return;
  }
  target[0] = 1 - alpha;
  target[1] = color * alpha;
}

/**
 * Applies a layer on top of an accumulated affine map in place: (A, B) becomes
 * (A_layer·A, A_layer·B + B_layer).
 *
 * @param affineA Accumulated multipliers.
 * @param affineB Accumulated offsets.
 * @param index Float index of the channel.
 * @param layerA Layer multiplier.
 * @param layerB Layer offset.
 */
export function paintAffineCompose(
  affineA: Float32Array,
  affineB: Float32Array,
  index: number,
  layerA: number,
  layerB: number,
): void {
  affineA[index] = (affineA[index] ?? 1) * layerA;
  affineB[index] = (affineB[index] ?? 0) * layerA + layerB;
}

/**
 * Applies an affine map to a base color channel.
 *
 * @param base Base channel 0..1.
 * @param multiplier A.
 * @param offset B.
 * @returns Result clamped to 0..1.
 */
export function paintAffineApply(base: number, multiplier: number, offset: number): number {
  return Math.max(0, Math.min(1, base * multiplier + offset));
}
