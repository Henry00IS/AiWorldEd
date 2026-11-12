import type { Curve, CurveVector } from '@/curve/model/curve_model.js';
import { generatorRevolveSamples, type GeneratorRevolveSample } from './generator_revolve_sample.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';
import { generatorRevolveSideExtents, type GeneratorRevolveSideExtent } from './generator_revolve_side_extent.js';

/** Smallest x distance between two slices, in curve units. */
const GENERATOR_REVOLVE_SIDE_EPSILON = 1e-9;

/** One ring of a sided piece in curve units. */
export interface GeneratorRevolveSideRing {
  /** Position along the profile. */
  x: number;
  /** Main profile value. */
  y: number;
  /** Accumulated rotation in degrees. */
  angle?: number;
  /** Secondary profile value, for custom pieces. */
  left?: number;
  /** Own thickness of a tapered bar ring. */
  bar?: number;
}

/** One piece between two rings, with the section of the piece. */
export interface GeneratorRevolveSidePiece {
  /** Section fields of the piece. */
  section: Partial<GeneratorRevolveStation>;
  /** Lower ring. */
  start: GeneratorRevolveSideRing;
  /** Upper ring. */
  end: GeneratorRevolveSideRing;
}

/**
 * Gives the rings of sided pieces their own +X and -X extents and depth. Custom
 * pieces are sliced at every sample of the secondary line, so each slice joins
 * two straight lines on both sides. Curves without sided pieces come back
 * unchanged.
 *
 * @param curve Profile curve with its optional secondary line.
 * @param samples Samples of the main line, bottom to top.
 * @returns Samples with `offset` and `depthRadius` in curve units.
 */
export function generatorRevolveSideSamples(curve: Curve, samples: GeneratorRevolveSample[]): GeneratorRevolveSample[] {
  const sided = samples.slice(0, -1).some((sample) => sample.side || sample.fixedDepth);
  if (!sided) return samples;
  const secondary = curve.secondary ? generatorRevolveSamples({ ...curve.secondary }) : [];
  const pieces = samples.slice(0, -1).flatMap((sample, index) => {
    const piece = generatorRevolveSidePiece(sample, samples[index + 1] ?? sample);
    return piece.section.side === 'custom' ? generatorRevolveSideSlice(piece, secondary) : [piece];
  });
  return generatorRevolveSideEmit(pieces, generatorRevolveSideExtents(pieces));
}

/**
 * Splits two neighbouring samples into a piece.
 *
 * @param sample Lower sample carrying the piece's section.
 * @param next Upper sample.
 * @returns Piece.
 */
function generatorRevolveSidePiece(
  sample: GeneratorRevolveSample,
  next: GeneratorRevolveSample,
): GeneratorRevolveSidePiece {
  const { x, y, angle, barRing, ...section } = sample;
  const start: GeneratorRevolveSideRing = {
    x,
    y,
    angle: angle ?? 0,
    ...(barRing !== undefined ? { bar: barRing } : {}),
  };
  const end: GeneratorRevolveSideRing = { x: next.x, y: next.y, angle: next.angle ?? 0 };
  if (next.barRing !== undefined) end.bar = next.barRing;
  return { section, start, end };
}

/**
 * Slices a custom piece at the secondary line's samples inside it.
 *
 * @param piece Custom piece.
 * @param secondary Secondary line samples.
 * @returns Slices bottom to top, each ring with its secondary value.
 */
function generatorRevolveSideSlice(
  piece: GeneratorRevolveSidePiece,
  secondary: readonly CurveVector[],
): GeneratorRevolveSidePiece[] {
  const { start, end } = piece;
  const inside = secondary.filter(
    (point) => point.x > start.x + GENERATOR_REVOLVE_SIDE_EPSILON && point.x < end.x - GENERATOR_REVOLVE_SIDE_EPSILON,
  );
  const rings: GeneratorRevolveSideRing[] = [
    { ...start, left: generatorRevolvePolylineAt(secondary, start.x, true) },
    ...inside.map((point) => ({
      ...generatorRevolveSideLerp(start, end, point.x, piece.section.barThickness),
      left: point.y,
    })),
    { ...end, left: generatorRevolvePolylineAt(secondary, end.x, false) },
  ];
  return rings.slice(1).map((ring, index) => ({ section: piece.section, start: rings[index] ?? ring, end: ring }));
}

/**
 * Interpolates a ring along a straight piece.
 *
 * @param start Lower ring.
 * @param end Upper ring.
 * @param x Position along the profile.
 * @param bar Bar thickness of the piece, for rings without their own.
 * @returns Ring at x, with its own thickness inside a tapered bar.
 */
function generatorRevolveSideLerp(
  start: GeneratorRevolveSideRing,
  end: GeneratorRevolveSideRing,
  x: number,
  bar: number | undefined,
): GeneratorRevolveSideRing {
  const t = (x - start.x) / Math.max(end.x - start.x, GENERATOR_REVOLVE_SIDE_EPSILON);
  const lerp = (low: number, high: number) => low + (high - low) * t;
  const ring: GeneratorRevolveSideRing = { x, y: lerp(start.y, end.y), angle: lerp(start.angle ?? 0, end.angle ?? 0) };
  if (start.bar === undefined && end.bar === undefined) return ring;
  return { ...ring, bar: lerp(start.bar ?? bar ?? 0, end.bar ?? bar ?? 0) };
}

/**
 * Evaluates a polyline at x. At a vertical step the value just above x wins
 * when looking upward, the value just below when looking downward.
 *
 * @param polyline Samples ordered by x.
 * @param x Position.
 * @param upward True takes the value approaching from above x.
 * @returns Interpolated value; 0 for an empty polyline.
 */
export function generatorRevolvePolylineAt(polyline: readonly CurveVector[], x: number, upward: boolean): number {
  const at = upward
    ? polyline.reduce((last, point, index) => (point.x <= x + GENERATOR_REVOLVE_SIDE_EPSILON ? index : last), -1)
    : polyline.findIndex((point) => point.x >= x - GENERATOR_REVOLVE_SIDE_EPSILON);
  const anchor = polyline[at];
  if (!anchor) return (upward ? polyline[0] : polyline[polyline.length - 1])?.y ?? 0;
  const other = polyline[upward ? at + 1 : at - 1];
  if (!other || Math.abs(other.x - anchor.x) <= GENERATOR_REVOLVE_SIDE_EPSILON) return anchor.y;
  const t = Math.max(0, Math.min(1, (x - anchor.x) / (other.x - anchor.x)));
  return anchor.y + (other.y - anchor.y) * t;
}

/**
 * Writes the pieces back as samples. Neighbouring pieces whose shared ring has
 * the same shape share one sample; otherwise the ring repeats at the same
 * place, which makes a step.
 *
 * @param pieces Pieces bottom to top.
 * @param extents Extents of each piece's lower and upper ring.
 * @returns Samples in curve units.
 */
function generatorRevolveSideEmit(
  pieces: readonly GeneratorRevolveSidePiece[],
  extents: readonly [GeneratorRevolveSideExtent, GeneratorRevolveSideExtent][],
): GeneratorRevolveSample[] {
  const samples: GeneratorRevolveSample[] = [];
  pieces.forEach((piece, index) => {
    const [lower, upper] = extents[index] ?? [];
    if (!lower || !upper) return;
    const start = generatorRevolveSideSample(piece, piece.start, lower, true);
    const previous = samples[samples.length - 1];
    if (previous && generatorRevolveSideSame(previous, start)) samples.pop();
    samples.push(start, generatorRevolveSideSample(piece, piece.end, upper, false));
  });
  return samples;
}

/**
 * Builds one sample from a ring and its extents.
 *
 * @param piece Piece the ring belongs to.
 * @param ring Ring.
 * @param extent Ring extents.
 * @param lower True for the piece's lower ring, which carries the section.
 * @returns Sample.
 */
function generatorRevolveSideSample(
  piece: GeneratorRevolveSidePiece,
  ring: GeneratorRevolveSideRing,
  extent: GeneratorRevolveSideExtent,
  lower: boolean,
): GeneratorRevolveSample {
  const shape: GeneratorRevolveSample = { x: ring.x, y: (extent.right + extent.left) / 2, angle: ring.angle ?? 0 };
  if (piece.section.side) shape.offset = (extent.right - extent.left) / 2;
  if (extent.depth !== undefined) shape.depthRadius = extent.depth;
  if (ring.bar !== undefined) shape.barRing = ring.bar;
  return lower ? { ...piece.section, ...shape } : shape;
}

/**
 * Returns whether two samples describe the same ring.
 *
 * @param left First sample.
 * @param right Second sample.
 * @returns True when place, extents, depth, rotation and bar thickness match.
 */
function generatorRevolveSideSame(left: GeneratorRevolveSample, right: GeneratorRevolveSample): boolean {
  const values = (sample: GeneratorRevolveSample) => [
    sample.x,
    sample.y,
    sample.offset ?? 0,
    sample.depthRadius ?? sample.y,
    sample.angle ?? 0,
    sample.barRing ?? -1,
  ];
  const other = values(right);
  return values(left).every(
    (value, index) => Math.abs(value - (other[index] ?? value)) <= GENERATOR_REVOLVE_SIDE_EPSILON,
  );
}
