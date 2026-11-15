import type * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackOwnerCandidate, modifierStackOwnerIs } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { findBrush } from '@/ai/client/editor_api_lookup.js';

/** What kind of object carries a modifier stack. */
export type ModifierHolderKind = 'volume' | 'generator' | 'brush' | 'group';

/** An object that carries a modifier stack. */
export interface ModifierHolder {
  object: THREE.Object3D;
  kind: ModifierHolderKind;
}

/**
 * Resolves a brush id or scene uuid to a scene object.
 *
 * @param world Scene world group.
 * @param reference Brush id or object uuid.
 * @returns Object, or null.
 */
export function modifierObjectFind(world: THREE.Object3D, reference: string): THREE.Object3D | null {
  return findBrush(world, reference)?.brush.mesh ?? world.getObjectByProperty('uuid', reference) ?? null;
}

/**
 * Resolves an object that can carry a modifier stack: a modifier volume, a
 * generator node, a brush or a CSG group.
 *
 * @param world Scene world group.
 * @param reference Brush id or object uuid.
 * @returns Holder, or an error message.
 */
export function modifierHolderFind(world: THREE.Object3D, reference: string): ModifierHolder | string {
  const object = modifierObjectFind(world, reference);
  if (!object) return `No object ${reference}`;
  if (ModifierVolume.isVolume(object))
    return { object, kind: ModifierVolume.isGenerator(object) ? 'generator' : 'volume' };
  if (!modifierStackOwnerCandidate(object))
    return `${object.name || reference} cannot carry modifiers; use a modifier volume, generator, brush or CSG group`;
  return { object, kind: SolidBrushVisual.isBrushObject(object) ? 'brush' : 'group' };
}

/**
 * Lists every object in the scene that carries modifiers: volumes, generator
 * nodes, and brushes or groups with their own stack.
 *
 * @param world Scene world group.
 * @returns Holders in scene order.
 */
export function modifierHoldersList(world: THREE.Object3D): ModifierHolder[] {
  const holders: ModifierHolder[] = [];
  world.traverse((object) => {
    if (ModifierVolume.isVolume(object) || modifierStackOwnerIs(object)) {
      const found = modifierHolderFind(world, object.uuid);
      if (typeof found !== 'string') holders.push(found);
    }
  });
  return holders;
}
