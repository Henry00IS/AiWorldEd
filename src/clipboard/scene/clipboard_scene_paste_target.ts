import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { isValidSolidTreeParent } from '@/solid/model/solid_group.js';

/**
 * Where pasted brushes and generators go. They only live inside a solid model,
 * so the paste follows Duplicate: same parent as the most recent selection,
 * right after it.
 */
export interface ClipboardScenePasteTarget {
  /** Model to paste into, or null to create one on paste. */
  model: SolidModel | null;
  /** Solid root or CSG group of that model. */
  parent: THREE.Object3D | null;
  /** Sibling the paste follows, or null to append. */
  after: THREE.Object3D | null;
}

/**
 * No model in sight: brushes go back to their own model, generators to a new
 * one.
 */
export const CLIPBOARD_SCENE_PASTE_TARGET_NONE: ClipboardScenePasteTarget = { model: null, parent: null, after: null };

/**
 * Resolves the paste target from the most recent selection, else the active
 * model.
 *
 * @param world Scene world root.
 * @param anchor Most recently selected object, if any.
 * @param active Active solid model, if any.
 * @returns Paste target.
 */
export function clipboardScenePasteTargetResolve(
  world: THREE.Object3D,
  anchor: THREE.Object3D | null,
  active: SolidModel | null,
): ClipboardScenePasteTarget {
  const model = anchor && clipboardScenePasteAttached(world, anchor) ? SolidModel.fromObject(anchor) : null;
  if (model && anchor) {
    const parent = anchor.parent;
    if (anchor === model.root || !parent || !isValidSolidTreeParent(model.root, parent, model.root))
      return { model, parent: model.root, after: null };
    return { model, parent, after: anchor };
  }
  if (active && clipboardScenePasteAttached(world, active.root))
    return { model: active, parent: active.root, after: null };
  return CLIPBOARD_SCENE_PASTE_TARGET_NONE;
}

/**
 * Returns whether an object hangs under the world.
 *
 * @param world Scene world root.
 * @param object Candidate object.
 * @returns True when attached.
 */
function clipboardScenePasteAttached(world: THREE.Object3D, object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (current === world) return true;
  }
  return false;
}
