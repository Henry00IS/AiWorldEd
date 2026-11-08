import type { Curve, CurveSegment, CurveVector } from '@/curve/model/curve_model.js';
import { curveBezierAt, curveSegmentControls } from '@/curve/model/curve_sample.js';
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
  let twisted = 0;
  curve.segments.forEach((segment, index) => {
    const angle = twisted + (segment.rotation ?? 0);
    const start = generatorRevolveSegmentStart(samples, angle);
    if (start) Object.assign(start, generatorRevolveSegmentSection(segment));
    samples.push(...generatorRevolveSegmentSamples(curve, index, angle));
    twisted += segment.twist ?? 0;
  });
  return samples;
}

/**
 * Returns the sample a segment starts from. When the segment is rotated
 * differently from the end of the one below, a second sample at the same place
 * starts it, so both segments keep their own orientation at the joint.
 *
 * @param samples Samples so far; may receive the second joint sample.
 * @param angle Orientation the segment starts at, in degrees.
 * @returns Starting sample, or undefined when there are no samples.
 */
function generatorRevolveSegmentStart(
  samples: GeneratorRevolveSample[],
  angle: number,
): GeneratorRevolveSample | undefined {
  const end = samples[samples.length - 1];
  if (!end || Math.abs((end.angle ?? 0) - angle) <= GENERATOR_REVOLVE_ANGLE_EPSILON) return end;
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
  if (segment.section && segment.cornerSize) {
    section.cornerSize = segment.cornerSize;
    section.cornerSides = segment.cornerSides ?? 1;
  }
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
 * @returns Samples after the start, including the end.
 */
function generatorRevolveSegmentSamples(curve: Curve, index: number, angle: number): GeneratorRevolveSample[] {
  const segment = curve.segments[index];
  if (!segment) return [];
  const twist = segment.twist ?? 0;
  const count = Math.max(
    segment.mode === 'linear' ? 1 : segment.detail,
    Math.ceil(Math.abs(twist) / GENERATOR_REVOLVE_TWIST_STEP),
  );
  const controls = curveSegmentControls(curve, index);
  const section = generatorRevolveSegmentSection(segment);
  return Array.from({ length: count }, (_, step) => ({
    ...curveBezierAt(controls, (step + 1) / count),
    angle: angle + (twist * (step + 1)) / count,
    ...(step + 1 < count ? section : {}),
  }));
}
