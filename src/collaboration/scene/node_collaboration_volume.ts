import type * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Returns the shared part of a modifier stack as text: everything except the
 * per-user folded state of the inspector cards. Only these settings sync; every
 * client evaluates the volume itself.
 *
 * @param stack Stack settings.
 * @returns Comparable text.
 */
export function nodeVolumeStackText(stack: Partial<ModifierStackSettings>): string {
  const modifiers = (stack.modifiers ?? []).map((entry) => ({ ...entry, expanded: undefined }));
  return JSON.stringify({ ...stack, modifiers });
}

/**
 * Returns the synced settings of a modifier volume, or an empty string for any
 * other object, for change fingerprints.
 *
 * @param object Scene object.
 * @returns Settings text.
 */
export function nodeVolumeSyncText(object: THREE.Object3D): string {
  return ModifierVolume.isVolume(object) ? nodeVolumeStackText(ModifierVolume.read(object)) : '';
}

/**
 * Applies received stack settings to a volume, keeping the local folded state
 * of each card.
 *
 * @param object Existing scene object.
 * @param entry Received entry.
 * @returns True when the settings changed.
 */
export function nodeVolumeApply(object: THREE.Object3D, entry: ObjectEntry): boolean {
  if (!ModifierVolume.isVolume(object) || !entry.modifierStack) return false;
  const local = ModifierVolume.read(object);
  if (nodeVolumeStackText(local) === nodeVolumeStackText(entry.modifierStack)) return false;
  const folded = new Map(local.modifiers.map((step) => [step.id, step.expanded]));
  const incoming = structuredClone(entry.modifierStack);
  const modifiers = (incoming.modifiers ?? []).map((step) => ({
    ...step,
    expanded: folded.get(step.id) ?? step.expanded,
  }));
  ModifierVolume.write(object, { ...incoming, modifiers });
  return true;
}
