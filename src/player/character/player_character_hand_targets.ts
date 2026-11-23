import type * as THREE from 'three';

/**
 * Supplies world-space wrist targets that override the locomotion arms (palms
 * down, fingers forward).
 */
export interface PlayerCharacterHandTargets {
  /**
   * Copies the wanted wrist positions.
   *
   * @param left Left wrist destination.
   * @param right Right wrist destination.
   * @returns False when the hands are free.
   */
  copyHandTargetsTo(left: THREE.Vector3, right: THREE.Vector3): boolean;
}
