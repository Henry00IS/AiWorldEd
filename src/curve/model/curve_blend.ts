import { curveConstrain } from './curve_constrain.js';
import { CURVE_CROSS_ARM_DEFAULT } from './curve_section.js';
import { curveClone, type Curve, type CurveLayer, type CurveSegment } from './curve_model.js';

/** Smallest length or height along the curve that counts for a blend. */
const CURVE_BLEND_EPSILON = 1e-6;

/** Which ends of a segment morph from a neighbour's cross-section. */
export interface CurveBlendEnds {
  /** True when the segment morphs from the section below its first point. */
  start: boolean;
  /** True when the segment morphs into the section above its last point. */
  end: boolean;
}

/**
 * Describes the outline a segment has at one of its ends, so two segments can
 * be compared at the point they share. Twist accumulates continuously and does
 * not count; a bar's own thickness at that end does.
 *
 * @param segment Segment.
 * @param atEnd True for the segment's upper end.
 * @returns Comparable outline key.
 */
function curveBlendOutlineKey(segment: CurveSegment, atEnd: boolean): string {
  const bar = segment.section === 'bar' || segment.section === 'cross';
  const thickness = atEnd && segment.armWidthEnd !== undefined ? segment.armWidthEnd : segment.armWidth;
  return JSON.stringify([
    segment.section ?? 'round',
    segment.polygonSides ?? 0,
    segment.cornerSize ?? 0,
    segment.cornerSides ?? 0,
    bar ? (thickness ?? CURVE_CROSS_ARM_DEFAULT) : 0,
    segment.straight ?? 0,
    segment.side ?? '',
    !!segment.fixedDepth,
    segment.rotation ?? 0,
  ]);
}

/**
 * Returns whether the point between two segments is a section change that can
 * blend: both segments rise along the curve, the point has a width, and the
 * outlines on either side differ. A vertical step between them is a step on
 * purpose and never blends.
 *
 * @param layer Profile line.
 * @param point Index of the shared point; segment point - 1 lies below it.
 * @returns True for a joint that can blend.
 */
export function curveBlendJoint(layer: CurveLayer, point: number): boolean {
  const lower = layer.segments[point - 1];
  const upper = layer.segments[point];
  const before = layer.points[point - 1];
  const joint = layer.points[point];
  const after = layer.points[point + 1];
  if (!lower || !upper || !before || !joint || !after) return false;
  const rising = joint.x - before.x > CURVE_BLEND_EPSILON && after.x - joint.x > CURVE_BLEND_EPSILON;
  if (!rising || joint.y <= CURVE_BLEND_EPSILON) return false;
  return curveBlendOutlineKey(lower, true) !== curveBlendOutlineKey(upper, false);
}

/**
 * Returns whether the Blend setting changes a segment: one of its ends meets a
 * different cross-section.
 *
 * @param layer Profile line.
 * @param index Segment index.
 * @returns True when the segment has a joint that can blend.
 */
export function curveSegmentBlendable(layer: CurveLayer, index: number): boolean {
  return curveBlendJoint(layer, index) || curveBlendJoint(layer, index + 1);
}

/**
 * Returns which ends of a segment morph: those whose joint can blend while the
 * segment's Blend is on.
 *
 * @param layer Profile line.
 * @param index Segment index.
 * @returns Morphing ends.
 */
export function curveSegmentBlendEnds(layer: CurveLayer, index: number): CurveBlendEnds {
  const on = layer.segments[index]?.blend === true;
  return { start: on && curveBlendJoint(layer, index), end: on && curveBlendJoint(layer, index + 1) };
}

/**
 * Switches Blend on or off for some segments.
 *
 * @param input Curve.
 * @param indices Segment indices; out-of-range ones are ignored.
 * @param blend True lets the segments morph from differing neighbours.
 * @returns Canonical edited curve.
 */
export function curveSegmentBlendSet(input: Curve, indices: readonly number[], blend: boolean): Curve {
  const curve = curveClone(input);
  for (const index of indices) {
    const segment = curve.segments[index];
    if (!segment) continue;
    if (blend) segment.blend = true;
    else delete segment.blend;
  }
  return curveConstrain(curve);
}

/**
 * Turns Blend on where changed segments now meet a different cross-section: at
 * each such point the shorter of the two segments becomes the transition, the
 * changed one on a tie, unless one of them blends already. A long shaft that
 * changes section keeps its new section and a short tip or collar beside it
 * morphs.
 *
 * @param curve Curve whose sections were just changed, edited in place.
 * @param changed Indices of the segments whose section changed.
 */
export function curveBlendDefaultsApply(curve: Curve, changed: readonly number[]): void {
  for (const index of changed)
    for (const point of [index, index + 1]) {
      const lower = curve.segments[point - 1];
      const upper = curve.segments[point];
      if (!lower || !upper || lower.blend || upper.blend || !curveBlendJoint(curve, point)) continue;
      const other = point === index ? point - 1 : point;
      const shorter = curveBlendLength(curve, other) < curveBlendLength(curve, index) - CURVE_BLEND_EPSILON;
      const target = curve.segments[shorter ? other : index];
      if (target) target.blend = true;
    }
}

/**
 * Returns how far a segment runs along the curve's x axis.
 *
 * @param layer Profile line.
 * @param index Segment index.
 * @returns Length in curve units.
 */
function curveBlendLength(layer: CurveLayer, index: number): number {
  return (layer.points[index + 1]?.x ?? 0) - (layer.points[index]?.x ?? 0);
}
