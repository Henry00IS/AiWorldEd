import * as THREE from 'three';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerProjectedGrid } from '@/viewports/grid/projected/manager_projected_grid.js';

/**
 * Makes a move snap on the moved object's own grid and draws that grid on
 * surfaces until the move ends.
 *
 * @param gridSnap Snap settings.
 * @param orientation World rotation of the object's axes.
 * @param origin Where the object's grid passes through.
 */
export function gridSnapLocalSpaceBegin(
  gridSnap: GridSnap,
  orientation: THREE.Quaternion,
  origin: THREE.Vector3,
): void {
  gridSnap.setTranslationBasis(orientation);
  ManagerProjectedGrid.setPlaneFrame({
    origin: origin.clone(),
    uAxis: new THREE.Vector3(1, 0, 0).applyQuaternion(orientation),
    vAxis: new THREE.Vector3(0, 0, 1).applyQuaternion(orientation),
    normal: new THREE.Vector3(0, 1, 0).applyQuaternion(orientation),
  });
}

/**
 * Returns snapping and the drawn surface grid to the working grid.
 *
 * @param gridSnap Snap settings.
 */
export function gridSnapLocalSpaceEnd(gridSnap: GridSnap): void {
  gridSnap.setTranslationBasis(null);
  ManagerProjectedGrid.setPlaneFrame(gridSnap.getPlaneFrame());
}
