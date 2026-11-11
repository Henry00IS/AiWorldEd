import * as THREE from 'three';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { EditAlignAnchor, EditAlignAxis, EditAlignRequest } from './edit_align_request.js';

/** Largest per-axis move still treated as no move at all. */
const EDIT_ALIGN_UNCHANGED_EPSILON = 1e-9;

/**
 * Returns the aligned world position of every input position. Grid alignment
 * rounds each working grid coordinate to the snap interval; axis alignment sets
 * one working grid coordinate of every position to the minimum, center or
 * maximum of the whole set.
 *
 * @param worldPositions Current world positions of the selected vertices.
 * @param request Alignment to perform.
 * @param gridSnap Working grid frame and snap interval.
 * @returns Aligned world positions in input order.
 */
export function editAlignWorldPositions(
  worldPositions: readonly THREE.Vector3[],
  request: EditAlignRequest,
  gridSnap: GridSnap,
): THREE.Vector3[] {
  const locals = worldPositions.map((world) => gridSnap.worldPositionToLocal(world, new THREE.Vector3()));
  if (request.kind === 'grid') editAlignLocalsToLattice(locals, gridSnap);
  else editAlignLocalsAlongAxis(locals, request.axis, request.anchor);
  return locals.map((local) => gridSnap.localToWorldPosition(local, new THREE.Vector3()));
}

/**
 * Returns whether any aligned position differs from its original.
 *
 * @param before Original world positions.
 * @param after Aligned world positions in the same order.
 * @returns True when at least one vertex moves.
 */
export function editAlignPositionsChanged(before: readonly THREE.Vector3[], after: readonly THREE.Vector3[]): boolean {
  return before.some((position, index) => {
    const aligned = after[index];
    return aligned !== undefined && position.distanceToSquared(aligned) > EDIT_ALIGN_UNCHANGED_EPSILON;
  });
}

/**
 * Rounds every working grid coordinate onto the snap lattice in place.
 *
 * @param locals Working grid coordinates.
 * @param gridSnap Grid holding the snap interval.
 */
function editAlignLocalsToLattice(locals: THREE.Vector3[], gridSnap: GridSnap): void {
  for (const local of locals) {
    local.set(
      gridSnap.snapValueToLattice(local.x),
      gridSnap.snapValueToLattice(local.y),
      gridSnap.snapValueToLattice(local.z),
    );
  }
}

/**
 * Sets one working grid coordinate of every position to the anchor of their
 * extent along that axis, in place.
 *
 * @param locals Working grid coordinates.
 * @param axis Axis to flatten across.
 * @param anchor Minimum, center or maximum of the extent.
 */
function editAlignLocalsAlongAxis(locals: THREE.Vector3[], axis: EditAlignAxis, anchor: EditAlignAnchor): void {
  const values = locals.map((local) => local[axis]);
  const target = editAlignAnchorValue(Math.min(...values), Math.max(...values), anchor);
  for (const local of locals) local[axis] = target;
}

/**
 * Picks the anchor value of an extent.
 *
 * @param minimum Smallest coordinate.
 * @param maximum Largest coordinate.
 * @param anchor Anchor to pick.
 * @returns Anchor coordinate.
 */
function editAlignAnchorValue(minimum: number, maximum: number, anchor: EditAlignAnchor): number {
  if (anchor === 'min') return minimum;
  if (anchor === 'max') return maximum;
  return (minimum + maximum) / 2;
}
