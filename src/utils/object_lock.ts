import * as THREE from 'three';

/**
 * userData key marking an object as locked in the outliner.
 * Locked objects cannot be transformed, deleted, duplicated, or reparented.
 */
export const EDITOR_LOCKED_USERDATA_KEY = 'editorLocked';

/**
 * Returns whether the object itself is locked.
 * @param object Scene object to test.
 * @returns True when the object carries the lock flag.
 */
export function isObjectLocked(object: THREE.Object3D): boolean {
  return object.userData[EDITOR_LOCKED_USERDATA_KEY] === true;
}

/**
 * Sets or clears the lock flag on an object.
 * @param object Scene object to update.
 * @param locked Desired lock state.
 */
export function setObjectLocked(object: THREE.Object3D, locked: boolean): void {
  object.userData[EDITOR_LOCKED_USERDATA_KEY] = locked;
}

/**
 * Returns whether the object or any ancestor is locked.
 * @param object Scene object to test.
 * @returns True when the object is protected by lock inheritance.
 */
export function isObjectOrAncestorLocked(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (isObjectLocked(current)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Filters out objects that are locked or under a locked ancestor.
 * @param objects Objects to filter.
 * @returns Unlocked objects only.
 */
export function filterUnlockedObjects<T extends THREE.Object3D>(
  objects: readonly T[]
): T[] {
  return objects.filter((object) => !isObjectOrAncestorLocked(object));
}

/**
 * Toggles the lock flag on an object and returns the new state.
 * @param object Scene object to toggle.
 * @returns True when the object is now locked.
 */
export function toggleObjectLocked(object: THREE.Object3D): boolean {
  const nextLocked = !isObjectLocked(object);
  setObjectLocked(object, nextLocked);
  return nextLocked;
}
