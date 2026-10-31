import * as THREE from 'three';

/**
 * Writes a world-space rotation about a pivot, then an extra world translation,
 * back into an object's local position and quaternion.
 *
 * @param object Object to update.
 * @param startLocalPosition Local position before the operation.
 * @param startLocalQuaternion Local quaternion before the operation.
 * @param worldPivot World point the rotation spins around.
 * @param worldRotation World rotation applied to the start pose.
 * @param worldTranslation Extra world translation applied after the rotation.
 */
export function applyWorldPivotRotation(
  object: THREE.Object3D,
  startLocalPosition: THREE.Vector3,
  startLocalQuaternion: THREE.Quaternion,
  worldPivot: THREE.Vector3,
  worldRotation: THREE.Quaternion,
  worldTranslation: THREE.Vector3,
): void {
  const parent = object.parent;
  if (!parent) {
    applyRootWorldPivotRotation(
      object,
      startLocalPosition,
      startLocalQuaternion,
      worldPivot,
      worldRotation,
      worldTranslation,
    );
    return;
  }
  applyParentedWorldPivotRotation(
    object,
    parent,
    startLocalPosition,
    startLocalQuaternion,
    worldPivot,
    worldRotation,
    worldTranslation,
  );
}

/**
 * Applies the world pose when the object has no parent.
 *
 * @param object Object to update.
 * @param startPosition Start position.
 * @param startQuaternion Start quaternion.
 * @param worldPivot World pivot.
 * @param worldRotation World rotation.
 * @param worldTranslation Extra world translation.
 */
function applyRootWorldPivotRotation(
  object: THREE.Object3D,
  startPosition: THREE.Vector3,
  startQuaternion: THREE.Quaternion,
  worldPivot: THREE.Vector3,
  worldRotation: THREE.Quaternion,
  worldTranslation: THREE.Vector3,
): void {
  const rotated = startPosition.clone().sub(worldPivot).applyQuaternion(worldRotation).add(worldPivot);
  object.position.copy(rotated.add(worldTranslation));
  object.quaternion.copy(worldRotation).multiply(startQuaternion);
  object.updateMatrixWorld(true);
}

/**
 * Applies the world pose under a transformed parent.
 *
 * @param object Object to update.
 * @param parent Parent object.
 * @param startLocalPosition Start local position.
 * @param startLocalQuaternion Start local quaternion.
 * @param worldPivot World pivot.
 * @param worldRotation World rotation.
 * @param worldTranslation Extra world translation.
 */
function applyParentedWorldPivotRotation(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  startLocalPosition: THREE.Vector3,
  startLocalQuaternion: THREE.Quaternion,
  worldPivot: THREE.Vector3,
  worldRotation: THREE.Quaternion,
  worldTranslation: THREE.Vector3,
): void {
  parent.updateMatrixWorld(true);
  const parentWorldQuaternion = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQuaternion);
  const startWorldPosition = startLocalPosition.clone().applyMatrix4(parent.matrixWorld);
  const rotatedWorldPosition = startWorldPosition
    .clone()
    .sub(worldPivot)
    .applyQuaternion(worldRotation)
    .add(worldPivot)
    .add(worldTranslation);
  writeParentedPose(object, parent, parentWorldQuaternion, startLocalQuaternion, worldRotation, rotatedWorldPosition);
}

/**
 * Converts a world pose into the parent's local space.
 *
 * @param object Object to update.
 * @param parent Parent object.
 * @param parentWorldQuaternion Parent world quaternion.
 * @param startLocalQuaternion Start local quaternion.
 * @param worldRotation World rotation.
 * @param rotatedWorldPosition World position after the operation.
 */
function writeParentedPose(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  parentWorldQuaternion: THREE.Quaternion,
  startLocalQuaternion: THREE.Quaternion,
  worldRotation: THREE.Quaternion,
  rotatedWorldPosition: THREE.Vector3,
): void {
  const startWorldQuaternion = parentWorldQuaternion.clone().multiply(startLocalQuaternion);
  const rotatedWorldQuaternion = worldRotation.clone().multiply(startWorldQuaternion);
  const parentInverse = parent.matrixWorld.clone().invert();
  object.position.copy(rotatedWorldPosition).applyMatrix4(parentInverse);
  object.quaternion.copy(parentWorldQuaternion.clone().invert().multiply(rotatedWorldQuaternion));
  object.updateMatrixWorld(true);
}
