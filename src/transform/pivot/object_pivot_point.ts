import * as THREE from 'three';

/** Where Object → Origin puts an object's origin. */
export enum ObjectPivotPlacement {
  BOUNDS_CENTER = 'bounds_center',
  BOUNDS_BOTTOM = 'bounds_bottom',
  WORLD_ORIGIN = 'world_origin',
}

/**
 * Returns the menu label of a pivot placement.
 *
 * @param placement Pivot placement.
 * @returns Title Case label.
 */
export function objectPivotPlacementLabel(placement: ObjectPivotPlacement): string {
  if (placement === ObjectPivotPlacement.BOUNDS_CENTER) return 'Origin to Geometry Center';
  if (placement === ObjectPivotPlacement.BOUNDS_BOTTOM) return 'Origin to Geometry Bottom';
  return 'Origin to World Origin';
}

/**
 * Finds the world point a placement puts an object's origin at.
 *
 * @param object Object whose origin moves.
 * @param placement Pivot placement.
 * @returns World point.
 */
export function objectPivotPoint(object: THREE.Object3D, placement: ObjectPivotPlacement): THREE.Vector3 {
  if (placement === ObjectPivotPlacement.WORLD_ORIGIN) return new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (bounds.isEmpty()) return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  const center = bounds.getCenter(new THREE.Vector3());
  if (placement === ObjectPivotPlacement.BOUNDS_BOTTOM) center.y = bounds.min.y;
  return center;
}
