import type * as THREE from 'three';

/** UserData string array of scene object ids a volume ignores. */
export const MODIFIER_VOLUME_BLACKLIST_KEY = 'modifierVolumeBlacklist';

/**
 * Reads the ids a volume ignores.
 *
 * @param volume Modifier volume.
 * @returns Object ids. Empty when every touching object is affected.
 */
export function modifierVolumeBlacklistRead(volume: THREE.Object3D): string[] {
  const stored = volume.userData[MODIFIER_VOLUME_BLACKLIST_KEY];
  if (!Array.isArray(stored)) return [];
  return stored.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

/**
 * Stores the ids a volume ignores.
 *
 * @param volume Modifier volume.
 * @param ids Object ids. Duplicates are dropped.
 */
export function modifierVolumeBlacklistWrite(volume: THREE.Object3D, ids: readonly string[]): void {
  volume.userData[MODIFIER_VOLUME_BLACKLIST_KEY] = [...new Set(ids)];
}

/**
 * Returns whether an object or one of its parents is ignored.
 *
 * @param volume Modifier volume.
 * @param object Scene object, or null.
 * @returns True when the object should not be affected.
 */
export function modifierVolumeBlacklistIgnores(volume: THREE.Object3D, object: THREE.Object3D | null): boolean {
  const ids = modifierVolumeBlacklistRead(volume);
  if (ids.length === 0 || !object) return false;
  return modifierVolumeBlacklistChainHits(new Set(ids), object);
}

/**
 * Returns whether any object from here to the scene root is listed.
 *
 * @param ids Ignored ids.
 * @param object Start object.
 * @returns True when this object or a parent is ignored.
 */
function modifierVolumeBlacklistChainHits(ids: ReadonlySet<string>, object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (ids.has(current.uuid)) return true;
    current = current.parent;
  }
  return false;
}
