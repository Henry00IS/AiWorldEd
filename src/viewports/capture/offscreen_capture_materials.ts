import * as THREE from 'three';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';

/** Saved material state restored after a capture that hid the checker map. */
interface CheckerMaterialSnapshot {
  material: THREE.Material;
  map: THREE.Texture | null;
  color: number;
  applyMap: (material: THREE.Material, map: THREE.Texture | null) => void;
  applyColor: (material: THREE.Material, color: number) => void;
}

/**
 * Temporarily replaces the debug checker map with solid white for clean
 * captures. Assigned textures (non-checker maps) are left unchanged. Call the
 * returned function after the render to restore materials.
 *
 * @param scene Shared editor scene to walk.
 * @returns Restore callback.
 */
export function prepareCheckerMaterialsForCapture(scene: THREE.Scene): () => void {
  const checkerTexture = getDebugCheckerTexture();
  const snapshots: CheckerMaterialSnapshot[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    for (const material of collectMeshMaterials(object)) {
      const snapshot = tryReplaceCheckerMapWithWhite(material, checkerTexture);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
  });
  return () => restoreCheckerMaterialSnapshots(snapshots);
}

/**
 * Lists materials on a mesh (single or multi-material).
 *
 * @param mesh Mesh to inspect.
 * @returns Material list.
 */
function collectMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  if (Array.isArray(mesh.material)) {
    return mesh.material;
  }
  return [mesh.material];
}

/**
 * Clears the checker map and forces white when the material uses the debug
 * checker texture. Returns a restore snapshot, or null when unchanged.
 *
 * @param material Mesh material.
 * @param checkerTexture Shared debug checker texture.
 * @returns Snapshot for restore, or null.
 */
export function tryReplaceCheckerMapWithWhite(
  material: THREE.Material,
  checkerTexture: THREE.Texture,
): CheckerMaterialSnapshot | null {
  const currentMap = readMaterialMap(material);
  if (currentMap !== checkerTexture) {
    return null;
  }
  const color = readMaterialColorHex(material);
  if (color === null) {
    return null;
  }
  const snapshot: CheckerMaterialSnapshot = {
    material,
    map: currentMap,
    color,
    applyMap: writeMaterialMap,
    applyColor: writeMaterialColorHex,
  };
  writeMaterialMap(material, null);
  writeMaterialColorHex(material, 0xffffff);
  material.needsUpdate = true;
  return snapshot;
}

/**
 * Restores maps and colors cleared for capture.
 *
 * @param snapshots Snapshots collected before the render.
 */
function restoreCheckerMaterialSnapshots(snapshots: readonly CheckerMaterialSnapshot[]): void {
  for (const snapshot of snapshots) {
    snapshot.applyMap(snapshot.material, snapshot.map);
    snapshot.applyColor(snapshot.material, snapshot.color);
    snapshot.material.needsUpdate = true;
  }
}

/**
 * Reads the albedo map from a content material.
 *
 * @param material Material to inspect.
 * @returns Map texture or null.
 */
function readMaterialMap(material: THREE.Material): THREE.Texture | null {
  if (isContentViewLitMaterial(material)) {
    return material.map;
  }
  const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
  return mapHost.map ?? null;
}

/**
 * Writes the albedo map on a content material.
 *
 * @param material Material to update.
 * @param map Texture or null.
 */
function writeMaterialMap(material: THREE.Material, map: THREE.Texture | null): void {
  if (isContentViewLitMaterial(material)) {
    material.map = map;
    return;
  }
  const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
  mapHost.map = map;
}

/**
 * Reads tint color hex from a content material.
 *
 * @param material Material to inspect.
 * @returns Hex color or null.
 */
function readMaterialColorHex(material: THREE.Material): number | null {
  if (isContentViewLitMaterial(material)) {
    return material.color.getHex();
  }
  const colorHost = material as THREE.Material & { color?: THREE.Color };
  if (colorHost.color instanceof THREE.Color) {
    return colorHost.color.getHex();
  }
  return null;
}

/**
 * Writes tint color hex on a content material.
 *
 * @param material Material to update.
 * @param colorHex Hex color.
 */
function writeMaterialColorHex(material: THREE.Material, colorHex: number): void {
  if (isContentViewLitMaterial(material)) {
    material.color.setHex(colorHex);
    return;
  }
  const colorHost = material as THREE.Material & { color?: THREE.Color };
  if (colorHost.color instanceof THREE.Color) {
    colorHost.color.setHex(colorHex);
  }
}
