import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';

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
 * came from, in output order, or at the end of the root for generated units.
 *
 * @param virtualRoot Compile tree root.
 * @param units Derived units in output order.
 */
export function modifierStackTreePlace(virtualRoot: THREE.Object3D, units: readonly ModifierStackUnit[]): void {
  const nodes = new Map<string, THREE.Object3D>();
  virtualRoot.traverse((node) => nodes.set(node.uuid, node));
  const inserted = new Map<string, number>();
  for (const unit of units) {
    const slot = unit.origin ? nodes.get(unit.origin) : undefined;
    const parent = slot?.parent;
    if (!slot || !parent || !unit.origin) {
      virtualRoot.add(unit.tree);
      continue;
    }
    const offset = inserted.get(unit.origin) ?? 0;
    parent.add(unit.tree);
    parent.children.splice(parent.children.indexOf(unit.tree), 1);
    parent.children.splice(parent.children.indexOf(slot) + 1 + offset, 0, unit.tree);
    inserted.set(unit.origin, offset + 1);
  }
  virtualRoot.updateMatrixWorld(true);
}
