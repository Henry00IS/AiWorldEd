import * as THREE from 'three';

/** Captured editor camera pose restored when leaving play mode. */
export interface PlayerCameraPoseSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  up: THREE.Vector3;
}

/**
 * Captures the live camera pose into a new snapshot object.
 *
 * @param camera Camera to capture.
 * @returns Snapshot of position, quaternion, and up.
 */
export function playerCameraCapturePose(camera: THREE.PerspectiveCamera): PlayerCameraPoseSnapshot {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
  };
}

/**
 * Restores a previously captured camera pose.
 *
 * @param camera Camera to restore.
 * @param snapshot Stored pose.
 */
export function playerCameraRestorePose(camera: THREE.PerspectiveCamera, snapshot: PlayerCameraPoseSnapshot): void {
  camera.position.copy(snapshot.position);
  camera.quaternion.copy(snapshot.quaternion);
  camera.up.copy(snapshot.up);
  camera.updateMatrixWorld(true);
}
