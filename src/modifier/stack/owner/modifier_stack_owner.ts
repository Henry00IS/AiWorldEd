import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import { ModifierVolume, modifierVolumeVisible } from '@/modifier/stack/modifier_volume.js';
import { modifierStackSettingsNormalize } from '@/modifier/stack/modifier_stack_settings.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Returns whether an object may carry its own modifier stack: a solid brush or
 * a CSG group, which then acts on itself like a generator node acts on its
 * pieces.
 *
 * @param object Candidate object.
 * @returns True for brushes and CSG groups.
 */
export function modifierStackOwnerCandidate(object: THREE.Object3D): boolean {
  if (ModifierVolume.isVolume(object)) return false;
  return SolidBrushVisual.isBrushObject(object) || isSolidCsgGroup(object);
}

/**
 * Returns whether a brush or CSG group carries at least one modifier.
 *
 * @param object Candidate object.
 * @returns True when the object owns a non-empty stack.
 */
export function modifierStackOwnerIs(object: THREE.Object3D): boolean {
  if (!modifierStackOwnerCandidate(object)) return false;
  const stored = object.userData[MODIFIER_STACK_USERDATA_KEY] as Partial<ModifierStackSettings> | undefined;
  return Array.isArray(stored?.modifiers) && stored.modifiers.length > 0;
}

/**
 * Reads the stack a brush or CSG group owns, for saving and syncing.
 *
 * @param object Brush or CSG group.
 * @returns Normalized stack, or undefined when it owns no modifier.
 */
export function modifierStackOwnerEncode(object: THREE.Object3D | null | undefined): ModifierStackSettings | undefined {
  if (!object || !modifierStackOwnerIs(object)) return undefined;
  return ModifierVolume.read(object);
}

/**
 * Stores or clears the stack a brush or CSG group owns. An empty or missing
 * stack removes the key, so objects without modifiers stay unchanged.
 *
 * @param object Brush or CSG group.
 * @param settings Stack to store, or undefined to clear.
 */
export function modifierStackOwnerDecode(
  object: THREE.Object3D,
  settings: Partial<ModifierStackSettings> | undefined,
): void {
  const normalized = settings ? modifierStackSettingsNormalize(structuredClone(settings)) : undefined;
  if (!normalized || normalized.modifiers.length === 0) {
    delete object.userData[MODIFIER_STACK_USERDATA_KEY];
    return;
  }
  ModifierVolume.write(object, normalized);
}

/**
 * Copies the stack a brush or CSG group owns onto its duplicate.
 *
 * @param source Original object.
 * @param copy Duplicate object.
 */
export function modifierStackOwnerCopy(source: THREE.Object3D | null | undefined, copy: THREE.Object3D): void {
  modifierStackOwnerDecode(copy, modifierStackOwnerEncode(source));
}

/**
 * Lists the visible brushes and CSG groups of a solid that run an enabled stack
 * of their own, in scene order.
 *
 * @param solidRoot Solid model root.
 * @returns Owner objects.
 */
export function modifierStackOwnersActive(solidRoot: THREE.Object3D): THREE.Object3D[] {
  const owners: THREE.Object3D[] = [];
  solidRoot.traverse((object) => {
    if (modifierStackOwnerIs(object) && modifierVolumeVisible(object) && ModifierVolume.read(object).enabled)
      owners.push(object);
  });
  return owners;
}

/**
 * Measures the brushes under an owner in the owner's local coordinates, the box
 * its modifiers place and bevel against.
 *
 * @param owner Brush or CSG group.
 * @returns Local box; empty when no brush is found.
 */
export function modifierStackOwnerLocalBox(owner: THREE.Object3D): THREE.Box3 {
  owner.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const inverse = owner.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  owner.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(node)) return;
    const position = node.geometry.getAttribute('position');
    if (!position) return;
    const toOwner = inverse.clone().multiply(node.matrixWorld);
    for (let index = 0; index < position.count; index++)
      box.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(toOwner));
  });
  return box;
}

/** Half extent of the bevel reach of an owned stack: everything it holds. */
const MODIFIER_STACK_OWNER_BEVEL_REACH = 1e5;

let modifierStackOwnerBevelBox: THREE.BufferGeometry | null = null;

/**
 * Returns the box a bevel of an owned stack is limited to. An owner bevels
 * everything in its working set, its own brushes and every copy an earlier
 * modifier made, so the box reaches far beyond any level.
 *
 * @returns Shared box geometry.
 */
export function modifierStackOwnerBevelGeometry(): THREE.BufferGeometry {
  if (modifierStackOwnerBevelBox) return modifierStackOwnerBevelBox;
  const size = MODIFIER_STACK_OWNER_BEVEL_REACH * 2;
  modifierStackOwnerBevelBox = new THREE.BoxGeometry(size, size, size);
  modifierStackOwnerBevelBox.computeBoundingBox();
  return modifierStackOwnerBevelBox;
}
