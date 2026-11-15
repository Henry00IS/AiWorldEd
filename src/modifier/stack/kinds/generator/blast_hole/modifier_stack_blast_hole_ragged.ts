import type * as THREE from 'three';
import { blastHolePolygonContains, blastHolePolygonSound } from './modifier_stack_blast_hole_quality.js';
import { blastHoleCross, blastHoleSegmentDistance } from './modifier_stack_blast_hole_simple.js';
import { blastHoleConvexDecompose, type BlastHoleDecomposition } from './modifier_stack_blast_hole_decompose.js';
import type { BlastHoleRaggedSettings } from './modifier_stack_blast_hole_ragged_depth.js';
import {
  blastHoleRaggedClean,
  blastHoleRaggedCornerRemovable,
  blastHoleRaggedRawOutline,
} from './modifier_stack_blast_hole_ragged_outline.js';
import type { BlastHoleShape } from './modifier_stack_blast_hole_outline.js';

/** Least gap between an inner point and the outline, in metres. */
const BLAST_HOLE_RAGGED_INNER_GAP = 0.05;

/**
 * Returns the area of the triangle a corner forms with its neighbours: how much
 * the outline changes when the corner goes.
 *
 * @param outline Outline.
 * @param index Corner index.
 * @returns Area.
 */
function blastHoleRaggedCornerWeight(outline: readonly THREE.Vector2[], index: number): number {
  const count = outline.length;
  return Math.abs(
    blastHoleCross(outline[(index + count - 1) % count]!, outline[index]!, outline[(index + 1) % count]!),
  );
}

/** Corners and inner points to drop before the next split. */
interface BlastHoleRaggedRepair {
  corners: number[];
  inner: Set<number>;
}

/**
 * Picks, for every part that breaks a CSG bound, the outline corner of it whose
 * removal changes the outline least and keeps it simple; a part with no such
 * corner drops its inner points instead.
 *
 * @param split Current split.
 * @param outlineCount Number of outline corners.
 * @returns What to drop.
 */
function blastHoleRaggedRepairPlan(split: BlastHoleDecomposition, outlineCount: number): BlastHoleRaggedRepair {
  const outline = split.points.slice(0, outlineCount);
  const picked = new Set<number>();
  const inner = new Set<number>();
  for (const loop of split.loops) {
    if (blastHolePolygonSound(loop.map((index) => split.points[index]!))) continue;
    const corners = loop
      .filter((index) => index < outlineCount && !picked.has(index) && blastHoleRaggedCornerRemovable(outline, index))
      .sort((a, b) => blastHoleRaggedCornerWeight(outline, a) - blastHoleRaggedCornerWeight(outline, b) || a - b);
    if (corners[0] !== undefined) picked.add(corners[0]);
    else loop.filter((index) => index >= outlineCount).forEach((index) => inner.add(index - outlineCount));
  }
  return { corners: [...picked].sort((a, b) => b - a), inner };
}

/**
 * Removes corners from the outline, last index first, skipping any that a
 * removal before it made unsafe.
 *
 * @param outline Outline.
 * @param corners Corner indices, descending.
 * @returns New outline.
 */
function blastHoleRaggedRemoveCorners(outline: readonly THREE.Vector2[], corners: readonly number[]): THREE.Vector2[] {
  const points = [...outline];
  for (const corner of corners) if (blastHoleRaggedCornerRemovable(points, corner)) points.splice(corner, 1);
  return points;
}

/**
 * Returns the inner points that sit well inside the outline, clear of its
 * edges, so no part between them and the edge is thin.
 *
 * @param outline Outline.
 * @param ring Candidate points.
 * @returns Usable points.
 */
function blastHoleRaggedInnerPoints(
  outline: readonly THREE.Vector2[],
  ring: readonly THREE.Vector2[],
): THREE.Vector2[] {
  return ring.filter(
    (point) =>
      blastHolePolygonContains(outline, point) &&
      outline.every(
        (start, index) =>
          blastHoleSegmentDistance(start, outline[(index + 1) % outline.length]!, point) >= BLAST_HOLE_RAGGED_INNER_GAP,
      ),
  );
}

/**
 * Turns a split into a shape when every part meets the CSG bounds.
 *
 * @param split Split.
 * @param outline Outline it splits.
 * @returns Shape, or null.
 */
function blastHoleRaggedShapeOf(split: BlastHoleDecomposition, outline: THREE.Vector2[]): BlastHoleShape | null {
  const parts = split.loops.map((loop) => loop.map((index) => split.points[index]!.clone()));
  return parts.every(blastHolePolygonSound) ? { outline, parts } : null;
}

/**
 * Splits an outline into convex parts that all meet the CSG bounds, removing
 * the corners (or inner points) of any part that does not until every part
 * does.
 *
 * @param start Clean, simple, counter-clockwise outline.
 * @param ring Candidate inner points.
 * @returns Outline and parts, or null when no sound split was found.
 */
function blastHoleRaggedSoundSplit(
  start: readonly THREE.Vector2[],
  ring: readonly THREE.Vector2[],
): BlastHoleShape | null {
  let outline = [...start];
  let inner = blastHoleRaggedInnerPoints(outline, ring);
  for (let attempt = 0; attempt < start.length + ring.length && outline.length >= 3; attempt++) {
    const split = blastHoleConvexDecompose(outline, inner);
    if (!split) return null;
    const repair = blastHoleRaggedRepairPlan(split, outline.length);
    if (repair.corners.length === 0 && repair.inner.size === 0) return blastHoleRaggedShapeOf(split, outline);
    const shorter = blastHoleRaggedRemoveCorners(outline, repair.corners);
    if (shorter.length === outline.length && repair.inner.size === 0) return null;
    outline = blastHoleRaggedClean(shorter);
    inner = blastHoleRaggedInnerPoints(
      outline,
      inner.filter((_, index) => !repair.inner.has(index)),
    );
  }
  return null;
}

/**
 * Builds a Jagged hole: a ragged outline that fills the box, cut in along its
 * arc length by chunks, teeth, chips and bites, then split into few convex
 * parts that tile it exactly and meet every CSG bound.
 *
 * @param settings Jagged settings.
 * @param halfWidth Half the box width.
 * @param halfHeight Half the box height.
 * @returns Shape, or null when the box is too small for a sound hole.
 */
export function blastHoleRaggedShape(
  settings: BlastHoleRaggedSettings,
  halfWidth: number,
  halfHeight: number,
): BlastHoleShape | null {
  const raw = blastHoleRaggedRawOutline(settings, halfWidth, halfHeight);
  if (!raw || raw.outline.length < 3) return null;
  return blastHoleRaggedSoundSplit(blastHoleRaggedClean(raw.outline), raw.ring);
}
