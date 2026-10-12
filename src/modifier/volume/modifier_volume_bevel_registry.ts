import type * as THREE from 'three';

/**
 * Bevel volumes registered for compile. Detached volumes stay in the list so
 * undo can parent them again; queries only return volumes under a scene root.
 */
export class ModifierVolumeBevelRegistry {
  private static volumes: THREE.Object3D[] = [];

  /**
   * Remembers a bevel volume.
   *
   * @param volume Volume object.
   */
  static register(volume: THREE.Object3D): void {
    if (ModifierVolumeBevelRegistry.volumes.includes(volume)) return;
    ModifierVolumeBevelRegistry.volumes.push(volume);
  }

  /**
   * Returns bevel volumes currently under a scene root. Detached volumes stay
   * registered so undo can parent them again.
   *
   * @param sceneRoot Scene or world root.
   * @returns Volumes in that hierarchy.
   */
  static attachedTo(sceneRoot: THREE.Object3D): THREE.Object3D[] {
    return ModifierVolumeBevelRegistry.volumes.filter((volume) =>
      ModifierVolumeBevelRegistry.isUnder(volume, sceneRoot),
    );
  }

  /**
   * Returns whether a volume is the root or sits under it.
   *
   * @param volume Candidate volume.
   * @param sceneRoot Scene root.
   * @returns True when the parent chain reaches the root.
   */
  private static isUnder(volume: THREE.Object3D, sceneRoot: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = volume;
    while (current) {
      if (current === sceneRoot) return true;
      current = current.parent;
    }
    return false;
  }
}
