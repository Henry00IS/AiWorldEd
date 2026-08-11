import * as THREE from 'three';
import { PLAYER_CHARACTER_CONTROL_IDS, type PlayerCharacterControlId } from './player_character_control_ids.js';

/**
 * Character-local IK control points. Animation writes these; the control IK
 * solver reads them and rotates bones only.
 */
export class PlayerCharacterControlRig {
  private readonly points: Map<PlayerCharacterControlId, THREE.Vector3>;

  /** Creates a control rig with every effector at the origin. */
  constructor() {
    this.points = new Map();
    for (let index = 0; index < PLAYER_CHARACTER_CONTROL_IDS.length; index++) {
      const id = PLAYER_CHARACTER_CONTROL_IDS[index];
      if (id) {
        this.points.set(id, new THREE.Vector3());
      }
    }
  }

  /**
   * Returns a mutable control point for the given effector.
   *
   * @param id Control id.
   * @returns Character-local position vector.
   */
  get(id: PlayerCharacterControlId): THREE.Vector3 {
    const point = this.points.get(id);
    if (!point) {
      throw new Error(`Unknown control id: ${id}`);
    }
    return point;
  }

  /**
   * Copies a character-local position into a control point.
   *
   * @param id Control id.
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   */
  set(id: PlayerCharacterControlId, x: number, y: number, z: number): void {
    this.get(id).set(x, y, z);
  }
}
