import * as THREE from 'three';
import { GIZMO_SCALE_FREE_BILLBOARD_USERDATA } from './gizmo_visual_style.js';

/**
 * Orients every free-scale billboard root under a gizmo group to face the
 * camera (camera-facing scale ring).
 *
 * @param group Master or viewport gizmo group.
 * @param camera Active pane camera.
 */
export function applyGizmoScaleFreeBillboards(group: THREE.Object3D, camera: THREE.Camera): void {
  camera.updateMatrixWorld(true);
  group.traverse((child) => {
    if (child.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] !== true) {
      return;
    }
    child.quaternion.copy(camera.quaternion);
  });
  group.updateMatrixWorld(true);
}
