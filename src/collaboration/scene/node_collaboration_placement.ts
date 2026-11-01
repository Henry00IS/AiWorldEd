import * as THREE from 'three';
import { orderCompare, orderLongestIncreasingPositions } from '@/collaboration/scene/key_collaboration_order.js';

/**
 * Returns the order key of a synchronized child, or null for helper children
 * that keep their slot.
 */
export type PlacementKeyLookup = (object: THREE.Object3D) => string | null;

/**
 * Reorders the synchronized children of a parent by (key, id) while helper
 * children keep their slots, so every client shows the same sibling order.
 *
 * @param parent Parent whose children are sorted.
 * @param keyOf Key lookup for synchronized children.
 * @param idOf Wire id lookup for synchronized children.
 * @returns Children that moved relative to the others, empty when the order did
 *   not change.
 */
export function placementOrderEnforce(
  parent: THREE.Object3D,
  keyOf: PlacementKeyLookup,
  idOf: (object: THREE.Object3D) => string,
): THREE.Object3D[] {
  const slots: number[] = [];
  const nodes: { object: THREE.Object3D; key: string; id: string; slotIndex: number }[] = [];
  parent.children.forEach((child, index) => {
    const key = keyOf(child);
    if (key === null) return;
    nodes.push({ object: child, key, id: idOf(child), slotIndex: slots.length });
    slots.push(index);
  });
  nodes.sort((a, b) => orderCompare(a.key, a.id, b.key, b.id));
  let changed = false;
  slots.forEach((slot, index) => {
    const node = nodes[index];
    if (node === undefined || parent.children[slot] === node.object) return;
    parent.children[slot] = node.object;
    changed = true;
  });
  if (!changed) return [];
  const keptPositions = orderLongestIncreasingPositions(
    nodes.map((node) => node.slotIndex),
    (a, b) => a < b,
  );
  return nodes.filter((_node, position) => !keptPositions.has(position)).map((node) => node.object);
}

/**
 * Returns whether attaching an object under a parent would create a cycle.
 *
 * @param object Object to attach.
 * @param parent Prospective parent.
 * @returns True when the parent is the object or one of its descendants.
 */
export function placementCreatesCycle(object: THREE.Object3D, parent: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = parent;
  while (current !== null) {
    if (current === object) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Moves an object under a parent unless it already is a direct child.
 *
 * @param object Object to move.
 * @param parent New parent.
 */
export function placementAttach(object: THREE.Object3D, parent: THREE.Object3D): void {
  if (object.parent === parent) return;
  object.removeFromParent();
  parent.add(object);
}

/**
 * Disposes geometry and materials of every mesh in a detached subtree.
 *
 * @param root Detached subtree root.
 */
export function placementDisposeSubtree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}
