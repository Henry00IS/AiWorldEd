import * as THREE from 'three';

/** UserData key set on temporary shading override materials. */
export const EDITOR_SHADING_OVERRIDE_KEY = 'editorShadingOverride';

/** Content-material snapshot for one mesh (supports multi-material arrays). */
export interface SharedMaterialSnapshot {
  materials: THREE.Material | THREE.Material[];
  wireframeFlags: boolean | boolean[];
}

/** Authoritative content materials for the shared editor scene (by mesh uuid). */
const contentSnapshotsByMeshUuid = new Map<string, SharedMaterialSnapshot>();

/**
 * Marks a material as a temporary shading override (not content).
 *
 * @param material Material created for wireframe/flat/etc.
 */
export function markShadingOverrideMaterial(material: THREE.Material): void {
  material.userData[EDITOR_SHADING_OVERRIDE_KEY] = true;
}

/**
 * Returns whether a material is a temporary shading override.
 *
 * @param material Material to test.
 * @returns True when the material must not be stored as content.
 */
export function isShadingOverrideMaterial(material: THREE.Material): boolean {
  return material.userData[EDITOR_SHADING_OVERRIDE_KEY] === true;
}

/**
 * Returns whether a mesh currently uses only shading override materials.
 *
 * @param mesh Mesh to inspect.
 * @returns True when live materials must not be snapshotted as content.
 */
export function meshUsesShadingOverrideMaterials(mesh: THREE.Mesh): boolean {
  const materials = mesh.material;
  if (!materials) return false;
  if (Array.isArray(materials)) {
    if (materials.length === 0) return false;
    return materials.every((entry) => isShadingOverrideMaterial(entry));
  }
  return isShadingOverrideMaterial(materials);
}

/**
 * Stores content materials for a mesh when the live materials are not
 * overrides.
 *
 * @param mesh Mesh whose content materials should be remembered.
 */
export function captureSharedContentMaterials(mesh: THREE.Mesh): void {
  if (meshUsesShadingOverrideMaterials(mesh)) return;
  const materials = mesh.material;
  if (!materials) return;
  if (Array.isArray(materials)) {
    if (materials.length === 0) return;
    contentSnapshotsByMeshUuid.set(mesh.uuid, {
      materials: materials.slice(),
      wireframeFlags: materials.map((entry) => readWireframeFlag(entry)),
    });
    return;
  }
  contentSnapshotsByMeshUuid.set(mesh.uuid, {
    materials,
    wireframeFlags: readWireframeFlag(materials),
  });
}

/**
 * Returns the shared content snapshot for a mesh when present.
 *
 * @param meshUuid Mesh UUID.
 * @returns Snapshot or null.
 */
export function getSharedContentMaterials(meshUuid: string): SharedMaterialSnapshot | null {
  return contentSnapshotsByMeshUuid.get(meshUuid) ?? null;
}

/**
 * Restores a mesh to its shared content materials when a snapshot exists.
 *
 * @param mesh Mesh to restore.
 * @returns True when a snapshot was applied.
 */
export function restoreSharedContentMaterials(mesh: THREE.Mesh): boolean {
  const snapshot = contentSnapshotsByMeshUuid.get(mesh.uuid);
  if (!snapshot) return false;
  mesh.material = snapshot.materials;
  if (Array.isArray(snapshot.materials)) {
    const flags = snapshot.wireframeFlags as boolean[];
    snapshot.materials.forEach((material, index) => {
      writeWireframeFlag(material, flags[index] ?? false);
    });
    return true;
  }
  writeWireframeFlag(snapshot.materials, snapshot.wireframeFlags as boolean);
  return true;
}

/**
 * Returns content materials for shading overrides (snapshot preferred).
 *
 * @param mesh Mesh to resolve.
 * @returns Content material list.
 */
export function resolveSharedContentMaterialList(mesh: THREE.Mesh): THREE.Material[] {
  const snapshot = contentSnapshotsByMeshUuid.get(mesh.uuid);
  if (snapshot) {
    return Array.isArray(snapshot.materials) ? snapshot.materials : [snapshot.materials];
  }
  if (meshUsesShadingOverrideMaterials(mesh)) return [];
  const live = mesh.material;
  if (Array.isArray(live)) return live;
  return live ? [live] : [];
}

/**
 * Returns the content materials a mesh currently shows: its live materials, or
 * the stored content snapshot while a shading mode has swapped in temporary
 * overrides. Unlike {@link resolveSharedContentMaterialList} a live content edit
 * wins over an older snapshot.
 *
 * @param mesh Mesh to resolve.
 * @returns Content material list, empty when only overrides are known.
 */
export function currentSharedContentMaterialList(mesh: THREE.Mesh): THREE.Material[] {
  if (meshUsesShadingOverrideMaterials(mesh)) {
    const snapshot = contentSnapshotsByMeshUuid.get(mesh.uuid);
    if (!snapshot) return [];
    return Array.isArray(snapshot.materials) ? snapshot.materials : [snapshot.materials];
  }
  const live = mesh.material;
  if (Array.isArray(live)) return live;
  return live ? [live] : [];
}

/**
 * Forgets the content snapshot of a mesh, so a mesh rebuilt under the same uuid
 * does not inherit stale materials.
 *
 * @param meshUuid Mesh UUID.
 */
export function releaseSharedContentMaterials(meshUuid: string): void {
  contentSnapshotsByMeshUuid.delete(meshUuid);
}

/** Clears all shared content snapshots. Intended for tests only. */
export function clearSharedContentMaterialStoreForTests(): void {
  contentSnapshotsByMeshUuid.clear();
}

/**
 * Reads the wireframe flag when the material supports it.
 *
 * @param material Material to inspect.
 * @returns Wireframe flag, default false.
 */
function readWireframeFlag(material: THREE.Material): boolean {
  if (!('wireframe' in material)) return false;
  return Boolean((material as THREE.MeshBasicMaterial).wireframe);
}

/**
 * Writes the wireframe flag when the material supports it.
 *
 * @param material Material to update.
 * @param wireframe Desired wireframe state.
 */
function writeWireframeFlag(material: THREE.Material, wireframe: boolean): void {
  if (!('wireframe' in material)) return;
  (material as THREE.MeshBasicMaterial).wireframe = wireframe;
}
