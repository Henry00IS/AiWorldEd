import type { Curve, CurveSegment, CurveVector } from '@/curve/model/curve_model.js';
import { curveBezierAt, curveSegmentControls } from '@/curve/model/curve_sample.js';
import { CURVE_CROSS_ARM_DEFAULT, CURVE_STADIUM_STRAIGHT_DEFAULT } from '@/curve/model/curve_section.js';
import { curveSegmentBlendEnds } from '@/curve/model/curve_blend.js';
import type { GeneratorRevolveStation } from './generator_revolve_profile.js';

/** Sample with the cross-section of its outgoing band and accumulated rotation. */
export type GeneratorRevolveSample = CurveVector & Partial<GeneratorRevolveStation>;

/** Largest change of orientation between adjacent twist rings, in degrees. */
export const GENERATOR_REVOLVE_TWIST_STEP = 5;

/** Largest orientation difference, in degrees, treated as the same. */
const GENERATOR_REVOLVE_ANGLE_EPSILON = 1e-9;

/**
 * Samples a curve with enough rings for both its profile detail and its twist.
 *
 * @param curve Profile curve.
 * @returns Samples ordered bottom to top.
 */
export function generatorRevolveSamples(curve: Curve): GeneratorRevolveSample[] {
  const first = curve.points[0];
  if (!first) return [];
  const samples: GeneratorRevolveSample[] = [{ x: first.x, y: first.y, angle: curve.segments[0]?.rotation ?? 0 }];
  const blends = generatorRevolveBlendFields(curve);
  let twisted = 0;
  curve.segments.forEach((segment, index) => {
    const angle = twisted + (segment.rotation ?? 0);
    const section = { ...generatorRevolveSegmentSection(segment), ...blends[index] };
    const start = generatorRevolveSegmentStart(samples, angle, generatorRevolveBarStart(segment));
    if (start) Object.assign(start, section);
    samples.push(...generatorRevolveSegmentSamples(curve, index, angle, section));
    twisted += segment.twist ?? 0;
  });
  return samples;
}

/**
 * Returns the blend fields of every segment's pieces. Curves where no segment
 * morphs get none, so they sample exactly as without blending; otherwise every
 * piece names its segment and the ends that morph.
 *
 * @param curve Profile curve.
 * @returns Fields per segment.
 */
function generatorRevolveBlendFields(curve: Curve): Partial<GeneratorRevolveStation>[] {
  const ends = curve.segments.map((_, index) => curveSegmentBlendEnds(curve, index));
  if (!ends.some((end) => end.start || end.end)) return curve.segments.map(() => ({}));
  return ends.map((end, index) => ({
    segment: index,
    ...(end.start ? { blendStart: true } : {}),
    ...(end.end ? { blendEnd: true } : {}),
  }));
}

/**
 * Returns the sample a segment starts from. When the segment is rotated
 * differently from the end of the one below, or is a bar starting at another
 * thickness than a tapered bar below ends at, a second sample at the same place
 * starts it, so both segments keep their own ring at the joint.
 *
 * @param samples Samples so far; may receive the second joint sample.
 * @param angle Orientation the segment starts at, in degrees.
 * @param bar Start thickness when the segment is a bar.
 * @returns Starting sample, or undefined when there are no samples.
 */
function generatorRevolveSegmentStart(
  samples: GeneratorRevolveSample[],
  angle: number,
  bar: number | undefined,
): GeneratorRevolveSample | undefined {
  const end = samples[samples.length - 1];
  const turned = Math.abs((end?.angle ?? 0) - angle) > GENERATOR_REVOLVE_ANGLE_EPSILON;
  const thinned = end?.barRing !== undefined && bar !== undefined && Math.abs(end.barRing - bar) > 1e-9;
  if (!end || (!turned && !thinned)) return end;
  const start: GeneratorRevolveSample = { x: end.x, y: end.y, angle };
  samples.push(start);
  return start;
}

/**
 * Copies only the section fields represented by a curve segment.
 *
 * @param segment Profile segment.
 * @returns Outgoing band fields.
 */
function generatorRevolveSegmentSection(segment: CurveSegment): Partial<GeneratorRevolveStation> {
  const section: Partial<GeneratorRevolveStation> = {};
  if (segment.section === 'square') section.square = true;
  if (segment.section === 'polygon') section.polygonSides = segment.polygonSides ?? 6;
  if (segment.section === 'cross') section.crossArm = segment.armWidth ?? CURVE_CROSS_ARM_DEFAULT;
  if (segment.section === 'bar') section.barThickness = segment.armWidth ?? CURVE_CROSS_ARM_DEFAULT;
  if (segment.section === 'stadium') section.stadiumStraight = segment.straight ?? CURVE_STADIUM_STRAIGHT_DEFAULT;
  if (segment.section && segment.cornerSize) {
    section.cornerSize = segment.cornerSize;
    section.cornerSides = segment.cornerSides ?? 1;
  }
  if (segment.side) section.side = segment.side;
  if (segment.fixedDepth) section.fixedDepth = true;
  if (segment.twist) section.twisted = true;
  if (segment.rotation) section.rotation = segment.rotation;
  return section;
}

/**
 * Samples one segment and accumulates its specified rotation.
 *
 * @param curve Profile curve.
 * @param index Segment index.
 * @param angle Rotation at the segment start.
 * @param section Section and blend fields of the segment's pieces.
 * @returns Samples after the start, including the end.
 */
function generatorRevolveSegmentSamples(
  curve: Curve,
  index: number,
  angle: number,
  section: Partial<GeneratorRevolveStation>,
): GeneratorRevolveSample[] {
  const segment = curve.segments[index];
  if (!segment) return [];
  const twist = segment.twist ?? 0;
  const count = Math.max(
    segment.mode === 'linear' ? 1 : segment.detail,
    Math.ceil(Math.abs(twist) / GENERATOR_REVOLVE_TWIST_STEP),
  );
  const controls = curveSegmentControls(curve, index);
  return Array.from({ length: count }, (_, step) => ({
    ...curveBezierAt(controls, (step + 1) / count),
    angle: angle + (twist * (step + 1)) / count,
    ...generatorRevolveBarRing(segment, (step + 1) / count),
    ...(step + 1 < count ? section : {}),
  }));
}

/**
 * Returns the start thickness of a bar segment.
 *
 * @param segment Segment.
 * @returns Thickness, or undefined for other sections.
 */
function generatorRevolveBarStart(segment: CurveSegment): number | undefined {
  return segment.section === 'bar' ? (segment.armWidth ?? CURVE_CROSS_ARM_DEFAULT) : undefined;
}

/**
 * Returns the ring thickness of a tapered bar at a place along the segment,
 * changing linearly from its start to its end thickness.
 *
 * @param segment Segment.
 * @param t Place along the segment, 0 to 1.
 * @returns Ring thickness field, or nothing for even bars and other sections.
 */
function generatorRevolveBarRing(segment: CurveSegment, t: number): Partial<GeneratorRevolveStation> {
  const start = generatorRevolveBarStart(segment);
  if (start === undefined || segment.armWidthEnd === undefined) return {};
  return { barRing: start + (segment.armWidthEnd - start) * t };
}
