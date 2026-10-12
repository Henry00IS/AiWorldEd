import * as THREE from 'three';
import { computeViewportConstantScreenScale } from '@/viewports/scale/viewport_constant_screen_scale.js';

/** Local caret half-length before camera scale. */
export const EDGE_CUT_CARET_LOCAL_HALF_LENGTH = 0.35;

/** World endpoints of an edge-cut I-beam caret. */
export interface EdgeCutCaretWorldEnds {
  /** First caret endpoint. */
  start: THREE.Vector3;
  /** Second caret endpoint. */
  end: THREE.Vector3;
}

/**
 * Builds a short I-beam across an edge in the camera view plane.
 *
 * @param worldPoint World point on the hovered edge.
 * @param edgeDirection World edge direction.
 * @param camera Active camera.
 * @returns World caret endpoints.
 */
export function computeEdgeCutCaretWorldEnds(
  worldPoint: THREE.Vector3,
  edgeDirection: THREE.Vector3,
  camera: THREE.Camera,
): EdgeCutCaretWorldEnds {
  const across = computeViewPlaneEdgePerpendicular(edgeDirection, camera);
  const scale = computeViewportConstantScreenScale(camera, worldPoint);
  const half = across.multiplyScalar(scale * EDGE_CUT_CARET_LOCAL_HALF_LENGTH);
  return {
    start: worldPoint.clone().sub(half),
    end: worldPoint.clone().add(half),
  };
}

/**
 * Returns a unit vector perpendicular to an edge inside the camera view plane.
 *
 * @param edgeDirection World edge direction.
 * @param camera Active camera.
 * @returns Unit perpendicular.
 */
export function computeViewPlaneEdgePerpendicular(edgeDirection: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
  camera.updateMatrixWorld(true);
  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const across = new THREE.Vector3().crossVectors(edgeDirection, cameraForward);
  if (across.lengthSq() < 1e-10) {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  }
  return across.normalize();
}
