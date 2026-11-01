import type * as THREE from 'three';
import type { ManagerSelection } from './manager_selection.js';

/**
 * Returns whether every object is selected, directly or through a selected
 * ancestor, so a tool acting on them only touches what the user holds.
 *
 * @param selection Selection manager.
 * @param objects Objects a tool is about to change.
 * @returns True when all are covered.
 */
export function selectionCoversObjects(selection: ManagerSelection, objects: readonly THREE.Object3D[]): boolean {
  const selected = new Set<THREE.Object3D>([
    ...selection.getAllSelectedObjectsAsArray(),
    ...selection.getInspectorObjects(),
  ]);
  return objects.every((object) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (selected.has(node)) return true;
    return false;
  });
}
