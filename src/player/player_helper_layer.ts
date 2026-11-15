import type * as THREE from 'three';

/**
 * Editor overlay layer for the player's own objects, such as the spawn figurine
 * and the play-mode character. It sits beside the level, so these objects are
 * never level content: not in the outliner, not saved, and not cleared when a
 * level is opened.
 */
export interface PlayerHelperLayer {
  /**
   * Shows an object on the overlay layer.
   *
   * @param object Player object.
   */
  helperAdd(object: THREE.Object3D): void;
  /**
   * Removes an object added with helperAdd.
   *
   * @param object Player object.
   */
  helperRemove(object: THREE.Object3D): void;
}
