import type * as THREE from 'three';
import type { E2eSceneObjectSummary, E2eSceneSummary } from './test_bridge_types.js';

/**
 * Collects a serializable summary of the world root children. Only direct
 * children are listed, matching how the outliner presents top-level objects.
 *
 * @param worldObject World root that owns editor objects.
 * @returns Summary specs can assert against without touching Three objects.
 */
export function collectSceneSummary(worldObject: THREE.Group): E2eSceneSummary {
  const objects: E2eSceneObjectSummary[] = worldObject.children.map((child) => ({
    name: child.name,
    type: child.type,
  }));
  return { objects };
}

/**
 * Creates a summary entry for a single object, mirroring collectSceneSummary.
 *
 * @param object Object to summarize.
 * @returns Summary entry with the live name and Three.js type.
 */
export function summarizeObject(object: THREE.Object3D): E2eSceneObjectSummary {
  return { name: object.name, type: object.type };
}

/**
 * Finds the first direct world child with the given name.
 *
 * @param worldObject World root that owns editor objects.
 * @param name Object name to look up.
 * @returns The matching mesh, or null when no direct child has that name.
 */
export function findWorldMeshByName(worldObject: THREE.Group, name: string): THREE.Mesh | null {
  for (const child of worldObject.children) {
    if (child.name === name && (child as THREE.Mesh).isMesh) {
      return child as THREE.Mesh;
    }
  }
  return null;
}
