import type { Object3D } from 'three';

/**
 * Identifies editor selectors without loading any generator strategies. @param
 * object Candidate.
 */
export function modifierVolumeIs(object: Object3D): boolean {
  return object.userData['isModifierVolume'] === true || object.userData['modifierGenerator'] !== undefined;
}
