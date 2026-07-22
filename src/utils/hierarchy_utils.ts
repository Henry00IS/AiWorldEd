import * as THREE from 'three';

/**
 * Recursively collects all descendants of an object, including nested children.
 * @param obj The root object whose descendants should be collected.
 * @returns An array of all descendant Three.js objects.
 */
export function getDescendants(obj: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  collectDescendants(obj, result);
  return result;
}

/**
 * Recursively appends all descendants to the accumulator array.
 * @param obj The current object to inspect.
 * @param result The accumulator array receiving descendants.
 */
function collectDescendants(obj: THREE.Object3D, result: THREE.Object3D[]): void {
  obj.children.forEach((child) => {
    result.push(child);
    collectDescendants(child, result);
  });
}

/**
 * Returns the chain of ancestor objects from immediate parent to root.
 * @param obj The object whose ancestors should be collected.
 * @returns An array of ancestor objects starting from the immediate parent.
 */
export function getAncestors(obj: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  let current = obj.parent;
  while (current) {
    result.push(current);
    current = current.parent;
  }
  return result;
}

/**
 * Searches the object hierarchy for an object by name.
 * @param root The root object to start searching from.
 * @param name The name to search for.
 * @returns The matching object, or null if not found.
 */
export function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

/**
 * Safely reparents a child to a new parent without creating cycles.
 * @param child The object to reparent.
 * @param newParent The new parent object.
 * @returns True if reparenting succeeded, false if it would create a cycle.
 */
export function reparentSafely(child: THREE.Object3D, newParent: THREE.Object3D): boolean {
  if (newParent === child) return false;
  if (isDescendantOf(newParent, child)) return false;
  const oldParent = child.parent;
  if (oldParent) {
    oldParent.remove(child);
  }
  newParent.add(child);
  return true;
}

/**
 * Checks whether a candidate object is a descendant of the ancestor.
 * @param candidate The object to check.
 * @param ancestor The potential ancestor object.
 * @returns True if candidate is a descendant of ancestor.
 */
export function isDescendantOf(
  candidate: THREE.Object3D,
  ancestor: THREE.Object3D
): boolean {
  let current = candidate.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Collects every mesh under an object, including the object when it is a mesh.
 * @param root Object to traverse.
 * @returns Mesh list for viewport selection sync.
 */
export function collectMeshesUnder(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  if (root instanceof THREE.Mesh) {
    meshes.push(root);
  }
  root.traverse((child) => {
    if (child !== root && child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

/**
 * Collects all meshes from an object and its descendants.
 * @param root The root object to traverse.
 * @returns An array of all Three.js Mesh objects found.
 */
export function getAllMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      result.push(child);
    }
  });
  return result;
}

/**
 * Collects all top-level children that are groups from the root.
 * @param root The root object to inspect.
 * @returns An array of direct group children.
 */
export function getGroupChildren(root: THREE.Object3D): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.children.forEach((child) => {
    if (child instanceof THREE.Group) {
      groups.push(child);
    }
  });
  return groups;
}

/**
 * Collects all top-level children that are meshes from the root.
 * @param root The root object to inspect.
 * @returns An array of direct mesh children.
 */
export function getMeshChildren(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

/**
 * Returns the depth level of an object relative to a given root.
 * @param obj The object whose depth should be calculated.
 * @param root The root object to measure depth from.
 * @returns The number of ancestor levels between obj and root.
 */
export function getDepth(obj: THREE.Object3D, root: THREE.Object3D): number {
  let depth = 0;
  let current = obj.parent;
  while (current && current !== root) {
    depth++;
    current = current.parent;
  }
  return depth;
}
