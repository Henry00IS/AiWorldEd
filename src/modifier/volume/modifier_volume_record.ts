import type { Object3D } from 'three';

/** Scene userData key holding a modifier volume's ordered stack. */
export const MODIFIER_STACK_USERDATA_KEY = 'modifierStack';

/** Kind id of the bevel modifier inside a stack. */
export const MODIFIER_STACK_KIND_BEVEL = 'bevel';

/** Minimal stack shape the settings resolvers need. */
interface ModifierVolumeRecordStack {
  modifiers: { id: string; kind: string; parameters: Record<string, unknown> }[];
  excludedIds: string[];
}

/** Owner volume and step id an evaluation proxy reads its settings from. */
interface ModifierVolumeRecordLink {
  owner: Object3D;
  stepId: string;
}

const modifierVolumeRecordLinks = new WeakMap<Object3D, ModifierVolumeRecordLink>();

/**
 * Binds an evaluation proxy to one step of an owning modifier volume.
 *
 * @param proxy Proxy object that stands in for the step during evaluation.
 * @param owner Scene modifier volume that stores the step.
 * @param stepId Stable id of the step inside the owner's stack.
 */
export function modifierVolumeRecordLink(proxy: Object3D, owner: Object3D, stepId: string): void {
  modifierVolumeRecordLinks.set(proxy, { owner, stepId });
}

/**
 * Returns the scene volume that stores an object's settings.
 *
 * @param object Scene volume or evaluation proxy.
 * @returns Owning scene volume, or the object itself when it is not a proxy.
 */
export function modifierVolumeRecordOwner(object: Object3D): Object3D {
  return modifierVolumeRecordLinks.get(object)?.owner ?? object;
}

/**
 * Returns whether an object is an evaluation proxy bound to a stack step.
 *
 * @param object Candidate object.
 * @returns True when the object was linked with modifierVolumeRecordLink.
 */
export function modifierVolumeRecordIsProxy(object: Object3D): boolean {
  return modifierVolumeRecordLinks.has(object);
}

/**
 * Reads the raw stack stored on a scene volume.
 *
 * @param object Scene volume.
 * @returns Stored stack, or null when the object carries none.
 */
export function modifierVolumeRecordStack(object: Object3D): ModifierVolumeRecordStack | null {
  const stored: unknown = object.userData[MODIFIER_STACK_USERDATA_KEY];
  if (!stored || typeof stored !== 'object') return null;
  const stack = stored as Partial<ModifierVolumeRecordStack>;
  if (!Array.isArray(stack.modifiers) || !Array.isArray(stack.excludedIds)) return null;
  return stack as ModifierVolumeRecordStack;
}

/**
 * Returns the record that stores bevel settings for an object: the linked step
 * of a proxy, the first bevel step of a scene volume, or the object's
 * userData.
 *
 * @param object Scene volume, proxy, or plain settings carrier.
 * @returns Mutable settings record.
 */
export function modifierVolumeRecordBevel(object: Object3D): Record<string, unknown> {
  const link = modifierVolumeRecordLinks.get(object);
  if (link) return modifierVolumeRecordStep(link.owner, link.stepId) ?? {};
  const stack = modifierVolumeRecordStack(object);
  if (!stack) return object.userData;
  return stack.modifiers.find((step) => step.kind === MODIFIER_STACK_KIND_BEVEL)?.parameters ?? {};
}

/**
 * Returns whether an object carries bevel settings that evaluation can read.
 *
 * @param object Candidate object.
 * @returns True for linked proxies and scene volumes with a bevel step.
 */
export function modifierVolumeRecordHasBevel(object: Object3D): boolean {
  if (modifierVolumeRecordLinks.has(object)) return true;
  const stack = modifierVolumeRecordStack(object);
  return stack !== null && stack.modifiers.some((step) => step.kind === MODIFIER_STACK_KIND_BEVEL);
}

/**
 * Returns the excluded-object list owned by a volume, resolving proxies to
 * their owner.
 *
 * @param object Scene volume or proxy.
 * @returns Mutable owner stack, or null when the owner carries no stack.
 */
export function modifierVolumeRecordExclusionStack(object: Object3D): ModifierVolumeRecordStack | null {
  return modifierVolumeRecordStack(modifierVolumeRecordOwner(object));
}

/**
 * Finds one step's parameter record.
 *
 * @param owner Scene modifier volume.
 * @param stepId Step id.
 * @returns Parameter record, or null when the step is gone.
 */
function modifierVolumeRecordStep(owner: Object3D, stepId: string): Record<string, unknown> | null {
  const stack = modifierVolumeRecordStack(owner);
  return stack?.modifiers.find((step) => step.id === stepId)?.parameters ?? null;
}
