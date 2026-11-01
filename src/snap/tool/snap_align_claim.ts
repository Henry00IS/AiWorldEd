import * as THREE from 'three';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { selectionCoversObjects } from '@/selection/object/selection_object_cover.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';

/**
 * Makes the roots an align tool is about to move part of the selection. The
 * tool then moves only what the user holds: offline the click simply selects
 * it, and in a shared room the selection admission takes the locks
 * all-or-nothing and refuses (with the holder in the status bar) when another
 * member edits the object, its contents or a container around it.
 *
 * @param selection Selection manager.
 * @param roots Roots the tool will move.
 * @returns True when every root is selected afterwards.
 */
export function snapAlignClaimRoots(selection: ManagerSelection, roots: readonly THREE.Object3D[]): boolean {
  if (roots.length === 0) return false;
  if (selectionCoversObjects(selection, roots)) return true;
  const meshes = roots.flatMap((root) => (root instanceof THREE.Mesh ? [root] : collectMeshesUnder(root)));
  if (!selection.setSelection(meshes, [...roots])) return false;
  return selectionCoversObjects(selection, roots);
}
