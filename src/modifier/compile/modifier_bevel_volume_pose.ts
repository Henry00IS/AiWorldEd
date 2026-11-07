import type * as THREE from 'three';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';

/** Last compiled world pose of the volumes under a scene root. */
const rememberedVolumePoses = new WeakMap<THREE.Object3D, string>();

/**
 * Stores the world poses of the volumes under a scene root.
 *
 * @param sceneRoot Scene root.
 * @param volumes Volumes attached to that root.
 */
export function modifierBevelRememberVolumePoses(sceneRoot: THREE.Object3D, volumes: readonly THREE.Object3D[]): void {
  rememberedVolumePoses.set(sceneRoot, modifierBevelVolumePoseKey(volumes));
}

/**
 * Returns whether any attached volume has a new world pose.
 *
 * @param sceneRoot Scene root.
 * @param volumes Volumes attached to that root.
 * @returns True when the stored pose does not match.
 */
export function modifierBevelVolumePosesChanged(
  sceneRoot: THREE.Object3D,
  volumes: readonly THREE.Object3D[],
): boolean {
  return rememberedVolumePoses.get(sceneRoot) !== modifierBevelVolumePoseKey(volumes);
}

/**
 * Builds a stable key for a set of volume world matrices.
 *
 * @param volumes Volumes.
 * @returns Sorted pose key.
 */
function modifierBevelVolumePoseKey(volumes: readonly THREE.Object3D[]): string {
  return volumes.map(modifierBevelOneVolumePose).sort().join('|');
}

/**
 * Builds a pose key for one volume, including visibility and its stack.
 *
 * @param volume Modifier volume.
 * @returns Identity, visibility, quantized world matrix and stack.
 */
function modifierBevelOneVolumePose(volume: THREE.Object3D): string {
  const parts = volume.matrixWorld.elements.map((value) => Math.round(value * 1e5));
  return `${volume.uuid}:${volume.visible}:${parts.join(',')}:${JSON.stringify(volume.userData[MODIFIER_STACK_USERDATA_KEY])}`;
}
