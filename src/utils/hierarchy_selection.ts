import * as THREE from 'three';
import { isDescendantOf } from './hierarchy_utils.js';

/**
 * Removes objects that are descendants of other selected objects.
 * Keeps the outermost selected nodes so grouping nests instead of flattening.
 * @param objects Selected hierarchy objects.
 * @returns Root-most objects only.
 */
export function collapseToHierarchyRoots(
  objects: THREE.Object3D[]
): THREE.Object3D[] {
  const unique = dedupeObjects(objects);
  return unique.filter((candidate) => {
    return !unique.some(
      (other) => other !== candidate && isDescendantOf(candidate, other)
    );
  });
}

/**
 * Finds the deepest common parent of the given objects.
 * @param objects Objects to inspect.
 * @param worldRoot Fallback parent when no shared parent exists.
 * @returns Common parent, or worldRoot.
 */
export function findCommonParent(
  objects: THREE.Object3D[],
  worldRoot: THREE.Object3D
): THREE.Object3D {
  if (objects.length === 0) return worldRoot;
  let ancestor: THREE.Object3D | null = objects[0].parent;
  while (ancestor) {
    if (objects.every((object) => isUnderOrEqual(object, ancestor!))) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return worldRoot;
}

/**
 * Returns whether object is the ancestor or a descendant of ancestor.
 * @param object Object to test.
 * @param ancestor Potential ancestor (or self).
 * @returns True when object is under ancestor in the hierarchy.
 */
function isUnderOrEqual(
  object: THREE.Object3D,
  ancestor: THREE.Object3D
): boolean {
  if (object === ancestor) return true;
  return isDescendantOf(object, ancestor);
}

/**
 * Deduplicates object references while preserving order.
 * @param objects Input list.
 * @returns Unique objects.
 */
function dedupeObjects(objects: THREE.Object3D[]): THREE.Object3D[] {
  const seen = new Set<THREE.Object3D>();
  const result: THREE.Object3D[] = [];
  objects.forEach((object) => {
    if (seen.has(object)) return;
    seen.add(object);
    result.push(object);
  });
  return result;
}
