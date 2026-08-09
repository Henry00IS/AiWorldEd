import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Builds a world translation matrix for a delta vector.
 *
 * @param worldDelta Translation in world space.
 * @returns 4×4 translation matrix.
 */
export function buildWorldTranslationMatrix(worldDelta: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(worldDelta.x, worldDelta.y, worldDelta.z);
}

/**
 * Applies a UV move so the texture tracks a world-space mouse delta on the face
 * plane. Positions are translated by -delta before projection.
 *
 * @param baseline UV matrix before the move.
 * @param worldDelta World-space cursor delta on the drag plane.
 * @returns Updated UV matrix.
 */
export function applyUvMoveToMatrix(baseline: SurfaceUvMatrix, worldDelta: THREE.Vector3): SurfaceUvMatrix {
  const negated = new THREE.Vector3(-worldDelta.x, -worldDelta.y, -worldDelta.z);
  return baseline.multiplyMatrix4(buildWorldTranslationMatrix(negated));
}

/**
 * Computes the world delta from a start intersection to a current intersection.
 *
 * @param worldStart Start plane intersection.
 * @param worldCurrent Current plane intersection.
 * @returns Current minus start.
 */
export function computeWorldDeltaBetweenPoints(worldStart: THREE.Vector3, worldCurrent: THREE.Vector3): THREE.Vector3 {
  return worldCurrent.clone().sub(worldStart);
}
