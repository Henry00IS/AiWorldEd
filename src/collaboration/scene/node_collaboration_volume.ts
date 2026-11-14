import type * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackOwnerDecode, modifierStackOwnerEncode } from '@/modifier/stack/owner/modifier_stack_owner.js';

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
 * Returns the synced stack of a brush or CSG group that owns one, for change
 * fingerprints.
 *
 * @param object Brush or CSG group.
 * @returns Settings text, or empty without a stack.
 */
export function nodeOwnerStackSyncText(object: THREE.Object3D): string {
  const stack = modifierStackOwnerEncode(object);
  return stack ? nodeVolumeStackText(stack) : '';
}

/**
 * Returns the wire field of a brush or CSG group that owns a stack, with the
 * constant folded state of every card.
 *
 * @param object Brush or CSG group.
 * @returns Field to spread into the node payload, or nothing.
 */
export function nodeOwnerStackWire(object: THREE.Object3D): { modifierStack?: ModifierStackSettings } {
  const stack = modifierStackOwnerEncode(object);
  if (!stack) return {};
  return { modifierStack: { ...stack, modifiers: stack.modifiers.map((step) => ({ ...step, expanded: true })) } };
}

/**
 * Applies a received owner stack to a brush or CSG group, keeping the local
 * folded state of each card. A missing stack clears the owner's stack.
 *
 * @param object Brush or CSG group.
 * @param incoming Received stack, if any.
 * @returns True when the stack changed.
 */
export function nodeOwnerStackApply(object: THREE.Object3D, incoming: ModifierStackSettings | undefined): boolean {
  const local = modifierStackOwnerEncode(object);
  if ((local ? nodeVolumeStackText(local) : '') === (incoming ? nodeVolumeStackText(incoming) : '')) return false;
  modifierStackOwnerDecode(object, incoming ? nodeVolumeStackFolded(incoming, local) : undefined);
  return true;
}

/**
 * Copies the local folded state of each card onto a received stack.
 *
 * @param incoming Received stack.
 * @param local Local stack, if any.
 * @returns Received stack with local folding.
 */
function nodeVolumeStackFolded(
  incoming: Partial<ModifierStackSettings>,
  local: ModifierStackSettings | undefined,
): Partial<ModifierStackSettings> {
  const folded = new Map((local?.modifiers ?? []).map((step) => [step.id, step.expanded]));
  const copy = structuredClone(incoming);
  const modifiers = (copy.modifiers ?? []).map((step) => ({ ...step, expanded: folded.get(step.id) ?? step.expanded }));
  return { ...copy, modifiers };
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
  ModifierVolume.write(object, nodeVolumeStackFolded(entry.modifierStack, local));
  return true;
}

/**
 * Uses a constant folded state on the wire so local inspector layout never
 * creates shared edits. Scene-file serialization still keeps the user's
 * layout.
 *
 * @param entry Serialized shallow node entry.
 * @returns Entry with canonical modifier card layout.
 */
export function nodeVolumeWireEntry(entry: ObjectEntry): ObjectEntry {
  if (!entry.modifierStack) return entry;
  const modifiers = entry.modifierStack.modifiers?.map((step) => ({ ...step, expanded: true }));
  return { ...entry, modifierStack: { ...entry.modifierStack, modifiers } };
}
