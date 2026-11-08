import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { hierarchyNameAllocator, isHierarchyNamedObject } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * Gives copied hierarchy objects fresh suffixes while preserving their name
 * stems.
 *
 * @param root Copied hierarchy root.
 */
export function allocateCopiedHierarchyNames(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object === root || isHierarchyNamedObject(object))
      object.name = hierarchyNameAllocator.allocateFromSourceName(object.name);
  });
  root.traverse(synchronizeCopiedBrushNames);
}

/**
 * Synchronizes a copied solid model's brush names with its renamed previews.
 *
 * @param object Potential solid model root.
 */
function synchronizeCopiedBrushNames(object: THREE.Object3D): void {
  if (!SolidModel.isSolidModelObject(object)) return;
  const model = SolidModel.fromObject(object);
  if (model?.root !== object) return;
  for (const brush of model.getBrushes()) if (brush.mesh) brush.name = brush.mesh.name;
}
