import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { ModifierStackUnit, ModifierStackUnitSlot } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Makes a hierarchy-only clone of a solid tree for compile. Nothing is
 * registered and no buffers are copied; uuids match the authored nodes.
 *
 * @param source Authored solid root.
 * @returns Clone whose root carries the solid's world matrix.
 */
export function modifierStackTreeClone(source: THREE.Object3D): THREE.Object3D {
  const copy = modifierStackTreeNodeClone(source);
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(source.matrixWorld);
  return copy;
}

/**
 * Clones one node and its brush and group children.
 *
 * @param source Authored node.
 * @returns Clone.
 */
function modifierStackTreeNodeClone(source: THREE.Object3D): THREE.Object3D {
  const copy = new THREE.Group();
  copy.uuid = source.uuid;
  copy.userData = { ...source.userData };
  copy.visible = source.visible;
  for (const child of source.children) {
    if (SolidBrushVisual.isBrushObject(child) || child instanceof THREE.Group)
      copy.add(modifierStackTreeNodeClone(child));
  }
  return copy;
}

/**
 * Places derived units in a compile tree: right after the authored node they
 * came from, at the owning volume's place for generated units, in output order,
 * or at the end of the root when neither exists.
 *
 * @param virtualRoot Compile tree root.
 * @param units Derived units in output order.
 */
export function modifierStackTreePlace(virtualRoot: THREE.Object3D, units: readonly ModifierStackUnit[]): void {
  const nodes = new Map<string, THREE.Object3D>();
  virtualRoot.traverse((node) => nodes.set(node.uuid, node));
  const inserted = new Map<string, number>();
  for (const unit of units) {
    const anchor = modifierStackTreeAnchor(unit, nodes);
    if (!anchor) {
      virtualRoot.add(unit.tree);
      continue;
    }
    const offset = inserted.get(anchor.key) ?? 0;
    modifierStackTreeInsert(anchor.parent, unit.tree, anchor.index + offset);
    inserted.set(anchor.key, offset + 1);
  }
  virtualRoot.updateMatrixWorld(true);
}

/**
 * Resolves where a unit goes in a tree.
 *
 * @param unit Derived unit.
 * @param nodes Tree nodes by uuid.
 * @returns Parent, first index and a key shared by units placed together, or
 *   null.
 */
export function modifierStackTreeAnchor(
  unit: ModifierStackUnit,
  nodes: ReadonlyMap<string, THREE.Object3D>,
): { parent: THREE.Object3D; index: number; key: string } | null {
  if (unit.origin) {
    const slot = nodes.get(unit.origin);
    if (!slot?.parent) return null;
    return { parent: slot.parent, index: slot.parent.children.indexOf(slot) + 1, key: unit.origin };
  }
  if (!unit.slot) return null;
  const parent = nodes.get(unit.slot.parent);
  if (!parent) return null;
  const after = unit.slot.after ? nodes.get(unit.slot.after) : undefined;
  const index = after && after.parent === parent ? parent.children.indexOf(after) + 1 : 0;
  return { parent, index, key: `slot:${unit.slot.parent}:${unit.slot.after ?? ''}` };
}

/**
 * Inserts a node as a child at an index.
 *
 * @param parent Parent node.
 * @param child Node to insert.
 * @param index Sibling index.
 */
export function modifierStackTreeInsert(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
  parent.add(child);
  parent.children.splice(parent.children.indexOf(child), 1);
  parent.children.splice(Math.min(index, parent.children.length), 0, child);
}

/**
 * Returns where a volume sits in its solid's scene order, or undefined when the
 * volume is not inside that solid.
 *
 * @param volume Modifier volume.
 * @param solidRoot Solid root.
 * @returns Slot of the volume.
 */
export function modifierStackVolumeSlot(
  volume: THREE.Object3D,
  solidRoot: THREE.Object3D,
): ModifierStackUnitSlot | undefined {
  const parent = volume.parent;
  if (!parent) return undefined;
  let inside = false;
  for (let current: THREE.Object3D | null = parent; current; current = current.parent)
    if (current === solidRoot) inside = true;
  if (!inside) return undefined;
  const before = parent.children.slice(0, parent.children.indexOf(volume));
  const after = before.reverse().find((node) => SolidBrushVisual.isBrushObject(node) || node instanceof THREE.Group);
  return { parent: parent.uuid, after: after?.uuid ?? null };
}
