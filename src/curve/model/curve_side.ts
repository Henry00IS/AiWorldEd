import { curveConstrain } from './curve_constrain.js';
import { curveClone, curveLayerClone, type Curve, type CurveLayer } from './curve_model.js';
import type { CurveSideChoice } from './curve_section.js';

/** Which profile line of a curve the editor edits. */
export type CurveLayerKind = 'primary' | 'secondary';

/**
 * Returns whether any segment shapes its -X side with the secondary line.
 *
 * @param curve Curve.
 * @returns True when a segment uses the custom side mode.
 */
export function curveUsesCustomSide(curve: Curve): boolean {
  return curve.segments.some((segment) => segment.side === 'custom');
}

/**
 * Builds a secondary line that starts as a copy of the main line, so switching
 * a segment to custom changes nothing until the line is edited.
 *
 * @param curve Curve.
 * @returns Secondary line with plain segments.
 */
export function curveSecondaryFromPrimary(curve: Curve): CurveLayer {
  const copy = curveLayerClone(curve);
  return { points: copy.points, segments: copy.segments.map(({ mode, detail }) => ({ mode, detail })) };
}

/**
 * Sets the side mode of some segments. The first custom segment creates the
 * secondary line from the main one; an existing secondary line is kept.
 *
 * @param input Curve.
 * @param indices Segment indices; out-of-range ones are ignored.
 * @param side Side choice; mirror clears the side mode.
 * @returns Canonical edited curve.
 */
export function curveSegmentSideSet(input: Curve, indices: readonly number[], side: CurveSideChoice): Curve {
  const curve = curveClone(input);
  for (const index of indices) {
    const segment = curve.segments[index];
    if (!segment) continue;
    if (side === 'mirror') delete segment.side;
    else segment.side = side;
  }
  if (side === 'custom' && !curve.secondary) curve.secondary = curveSecondaryFromPrimary(curve);
  return curveConstrain(curve);
}

/**
 * Keeps or frees the depth of some segments.
 *
 * @param input Curve.
 * @param indices Segment indices; out-of-range ones are ignored.
 * @param fixed True keeps the depth fixed.
 * @returns Canonical edited curve.
 */
export function curveSegmentFixedDepthSet(input: Curve, indices: readonly number[], fixed: boolean): Curve {
  const curve = curveClone(input);
  for (const index of indices) {
    const segment = curve.segments[index];
    if (!segment) continue;
    if (fixed) segment.fixedDepth = true;
    else delete segment.fixedDepth;
  }
  return curveConstrain(curve);
}

/**
 * Returns the curve an editor edits for one line: the curve itself, or the
 * secondary line sharing the curve's markers.
 *
 * @param curve Full curve.
 * @param layer Edited line.
 * @returns Editable curve of that line.
 */
export function curveLayerView(curve: Curve, layer: CurveLayerKind): Curve {
  if (layer === 'primary' || !curve.secondary) return curve;
  return { ...curve.secondary, ...(curve.markers ? { markers: curve.markers } : {}) };
}

/**
 * Puts an edited line back into the full curve. The main line view is the whole
 * curve, so it replaces it; markers edited on the secondary line belong to the
 * whole curve.
 *
 * @param full Full curve before the edit.
 * @param layer Edited line.
 * @param view Edited curve of that line.
 * @returns Full curve with the edit.
 */
export function curveLayerCompose(full: Curve, layer: CurveLayerKind, view: Curve): Curve {
  if (layer === 'primary') return view;
  if (!full.secondary) return full;
  const { points, segments, markers } = view;
  const { markers: _old, ...rest } = full;
  return { ...rest, ...(markers ? { markers } : {}), secondary: { points, segments } };
}
