import type * as THREE from 'three';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { gridSnapInvertedByShift } from '@/transform/snap/grid_snap_shift_precision.js';
import { snapLoopCutParameterToGridPlanes } from './edit_loop_cut_slide_snap.js';

/**
 * Snaps a knife cut parameter to grid planes the edge crosses. Shift inverts
 * the user grid-snap setting for this sample. The point stays on the edge.
 *
 * @param worldA Edge start in world space.
 * @param worldB Edge end in world space.
 * @param parameter Unsnapped parameter along A→B.
 * @param userSnapEnabled User grid-snap preference.
 * @param shiftHeld True when Shift is held.
 * @param snapInterval Grid interval in working-grid units.
 * @param frame Working grid plane. Axes must be unit length.
 * @returns Interior parameter. Unchanged when snapping is off or no plane is
 *   crossed.
 */
export function snapKnifeParameterToGrid(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  parameter: number,
  userSnapEnabled: boolean,
  shiftHeld: boolean,
  snapInterval: number,
  frame: EditorPlaneFrame,
): number {
  return snapLoopCutParameterToGridPlanes(
    worldA,
    worldB,
    parameter,
    gridSnapInvertedByShift(userSnapEnabled, shiftHeld),
    snapInterval,
    frame,
    null,
  );
}
