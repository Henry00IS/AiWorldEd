import * as THREE from 'three';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from './face_texture_mapping.js';
import { getFaceTextureMaps } from './face_texture_storage.js';
import { countTriangles } from './planar_uv_projector.js';
import { TextureMapCache, getTextureMapCache } from './texture_map_cache.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';
import {
  CONTENT_METALNESS,
  CONTENT_ROUGHNESS
} from '../materials/content_material_factory.js';

/**
 * Rebuilds mesh materials and geometry groups from stored face texture maps.
 * Each unique textureId becomes one material slot; triangles map via groups.
 * @param mesh Content mesh to update.
 * @param cache Optional texture map cache (defaults to shared).
 * @param colorHex Optional tint; defaults to current material color.
 */
export function rebuildSurfaceMaterials(
  mesh: THREE.Mesh,
  cache: TextureMapCache = getTextureMapCache(),
  colorHex?: number
): void {
  const color = colorHex ?? extractMeshColor(mesh);
  const triangleCount = countTriangles(mesh.geometry);
  if (triangleCount === 0) return;
  const perTriangle = buildPerTriangleTextureIds(mesh, triangleCount);
  const materialSlots = collectUniqueTextureIds(perTriangle);
  const materials = materialSlots.map((textureId) =>
    createSurfaceMaterial(color, cache.resolve(textureId))
  );
  applyGeometryGroups(mesh.geometry, perTriangle, materialSlots);
  disposeOwnedMaterials(mesh);
  mesh.material = materials.length === 1 ? materials[0] : materials;
}

/**
 * Builds a per-triangle texture id table from stored maps.
 * @param mesh Mesh with optional faceTextureMaps.
 * @param triangleCount Number of triangles.
 * @returns Texture id per triangle index.
 */
function buildPerTriangleTextureIds(
  mesh: THREE.Mesh,
  triangleCount: number
): string[] {
  const ids = new Array<string>(triangleCount).fill(DEFAULT_CHECKER_TEXTURE_ID);
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) {
    return ids;
  }
  entries.forEach((entry) => {
    const textureId =
      entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    entry.triangleIndices.forEach((triangleIndex) => {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        ids[triangleIndex] = textureId;
      }
    });
  });
  return ids;
}

/**
 * Collects unique texture ids in first-seen order.
 * @param perTriangle Per-triangle texture ids.
 * @returns Unique id list.
 */
function collectUniqueTextureIds(perTriangle: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  perTriangle.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  });
  return ordered.length > 0 ? ordered : [DEFAULT_CHECKER_TEXTURE_ID];
}

/**
 * Writes non-indexed-style groups: one group per triangle for material slots.
 * Works for both indexed and non-indexed geometries (Three uses vertex range).
 * @param geometry Mesh geometry.
 * @param perTriangle Texture id per triangle.
 * @param materialSlots Ordered unique texture ids.
 */
function applyGeometryGroups(
  geometry: THREE.BufferGeometry,
  perTriangle: string[],
  materialSlots: string[]
): void {
  geometry.clearGroups();
  const index = geometry.getIndex();
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, i) => slotIndex.set(id, i));
  perTriangle.forEach((textureId, triangleIndex) => {
    const materialIndex = slotIndex.get(textureId) ?? 0;
    if (index) {
      geometry.addGroup(triangleIndex * 3, 3, materialIndex);
    } else {
      geometry.addGroup(triangleIndex * 3, 3, materialIndex);
    }
  });
}

/**
 * Creates one surface material with the given map.
 * @param color Hex tint.
 * @param map Diffuse map texture.
 * @returns MeshStandardMaterial.
 */
function createSurfaceMaterial(
  color: number,
  map: THREE.Texture
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    metalness: CONTENT_METALNESS,
    roughness: CONTENT_ROUGHNESS,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

/**
 * Reads the first material color from a mesh.
 * @param mesh Mesh to inspect.
 * @returns Hex color.
 */
function extractMeshColor(mesh: THREE.Mesh): number {
  const material = mesh.material;
  const first = Array.isArray(material) ? material[0] : material;
  if (first && 'color' in first) {
    const color = (first as THREE.MeshStandardMaterial).color;
    if (color) return color.getHex();
  }
  return 0xffffff;
}

/**
 * Disposes previous mesh materials without disposing shared texture maps.
 * Maps are detached first so TextureMapCache / checker stay alive for peers.
 * @param mesh Mesh whose materials will be replaced.
 */
function disposeOwnedMaterials(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  materials.forEach((material) => {
    if (!material) return;
    detachSharedMaps(material);
    material.dispose();
  });
}

/**
 * Clears map slots so Material.dispose cannot free shared textures.
 * @param material Material about to be disposed.
 */
function detachSharedMaps(material: THREE.Material): void {
  const standard = material as THREE.MeshStandardMaterial;
  if ('map' in standard) standard.map = null;
  if ('lightMap' in standard) standard.lightMap = null;
  if ('aoMap' in standard) standard.aoMap = null;
  if ('emissiveMap' in standard) standard.emissiveMap = null;
  if ('bumpMap' in standard) standard.bumpMap = null;
  if ('normalMap' in standard) standard.normalMap = null;
  if ('displacementMap' in standard) standard.displacementMap = null;
  if ('roughnessMap' in standard) standard.roughnessMap = null;
  if ('metalnessMap' in standard) standard.metalnessMap = null;
  if ('alphaMap' in standard) standard.alphaMap = null;
  if ('envMap' in standard) standard.envMap = null;
}

/**
 * Returns a default mapping using the paint state's last texture when provided.
 * @param textureId Optional texture id override.
 * @returns New FaceTextureMapping.
 */
export function createMappingWithTextureId(
  textureId: string
): FaceTextureMapping {
  const mapping = createDefaultFaceTextureMapping();
  mapping.textureId = textureId;
  return mapping;
}
