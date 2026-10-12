import type { LoopCutBeltParameterRange } from '@/edit/topology/topology_loop_cut_belt_range.js';
import {
  clampLoopCutParameterToBelt,
  isLoopCutParameterInsideBelt,
} from '@/edit/topology/topology_loop_cut_belt_range.js';
import type { TopologyLoopCutPreview } from '@/edit/topology/topology_loop_cut.js';

/**
 * Chooses a slide parameter that stays on the locked belt.
 *
 * @param rawParameter Unsnapped camera-ray parameter.
 * @param snappedParameter Grid-snapped parameter.
 * @param range Valid interior range for every locked belt edge.
 * @returns Parameter that keeps the belt intact.
 */
export function resolveLoopCutSlideParameter(
  rawParameter: number,
  snappedParameter: number,
  range: LoopCutBeltParameterRange,
): number {
  if (isLoopCutParameterInsideBelt(snappedParameter, range)) {
    return snappedParameter;
  }
  if (isLoopCutParameterInsideBelt(rawParameter, range)) {
    return rawParameter;
  }
  return clampLoopCutParameterToBelt(rawParameter, range);
}

/**
 * Chooses which loop-cut preview to show after a rebuild attempt.
 *
 * @param nextPreview Newly computed preview, or null.
 * @param lastPreview Last visible preview, or null.
 * @param keepLastOnFailure True when the current edge or locked belt should
 *   stay.
 * @returns Preview to display, or null to hide.
 */
export function chooseLoopCutPreviewToShow(
  nextPreview: TopologyLoopCutPreview | null,
  lastPreview: TopologyLoopCutPreview | null,
  keepLastOnFailure: boolean,
): TopologyLoopCutPreview | null {
  if (nextPreview) {
    return nextPreview;
  }
  if (keepLastOnFailure) {
    return lastPreview;
  }
  return null;
}
