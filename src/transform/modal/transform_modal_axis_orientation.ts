import * as THREE from 'three';
import type { GridSnap } from '@/transform/snap/grid_snap.js';

/**
 * Copies the quaternion keyboard X/Y/Z locks should use.
 *
 * @param gridSnap Snap store holding the workspace basis and local-space flag.
 * @param objectOrientation Object or gizmo orientation used in Local space.
 * @param target Quaternion to fill.
 * @returns The target quaternion.
 */
export function resolveKeyboardAxisOrientation(
  gridSnap: GridSnap,
  objectOrientation: THREE.Quaternion,
  target: THREE.Quaternion,
): THREE.Quaternion {
  if (gridSnap.keyboardAxisUsesObjectOrientation()) {
    return target.copy(objectOrientation);
  }
  return gridSnap.copyWorkspaceBasisQuaternionTo(target);
}
