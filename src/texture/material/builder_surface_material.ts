import * as THREE from 'three';
import { getFaceTextureMaps, getFaceTextureMapsLive, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { countTriangles } from '@/texture/uv/planar_uv_projector.js';
import { TextureMapCache, getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { createContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import type { ContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { invalidateFacePickAcceleration } from '@/selection/pick/mesh_pick_acceleration.js';
import {
  captureSharedContentMaterials,
  getSharedContentMaterials,
  isShadingOverrideMaterial,
  meshUsesShadingOverrideMaterials,
} from '@/viewports/shared/shared_content_material_store.js';
import { invalidateSharedShadingPass } from '@/viewports/shared/shared_shading_pass.js';
import { readContentMeshTextureId, readUniformTextureIdFromFaceMaps } from '@/texture/uv/content_mesh_texture.js';

/**
 * UserData key for per-triangle brush surface sources on solid result meshes.
 * Kept as a string to avoid a solid_model import cycle.
 */
const TRIANGLE_SOURCES_USERDATA_KEY = 'solidTriangleSources';

/** Options for rebuildSurfaceMaterials. */
export interface RebuildSurfaceMaterialsOptions {
  /**
   * When true, never permutes triangle buffers. Groups follow current order
   * (may produce more draw calls). Required for solid result partial mesh
   * patches.
   */
  preserveTriangleOrder?: boolean;
}

/**
 * Rebuilds mesh materials and geometry groups from stored face texture maps. By
 * default triangles are sorted by material so each texture is one draw call.
 *
 * @param mesh Content mesh to update.
 * @param cache Optional texture map cache (defaults to shared).
 * @param colorHex Optional tint; defaults to current material color.
 * @param options Optional layout controls.
 */
export function rebuildSurfaceMaterials(
  mesh: THREE.Mesh,
  cache: TextureMapCache = getTextureMapCache(),
  colorHex?: number,
  options: RebuildSurfaceMaterialsOptions = {},
): void {
  const color = colorHex ?? extractMeshColor(mesh);
  const triangleCount = countTriangles(mesh.geometry);
  if (triangleCount === 0) return;
  const uniformTextureId = resolveUniformContentTextureId(mesh);
  if (uniformTextureId !== null) {
    applyUniformSurfaceMaterial(mesh, uniformTextureId, color, cache);
    return;
  }
  const perTriangle = buildPerTriangleTextureIds(mesh, triangleCount);
  const materialSlots = collectUniqueTextureIds(perTriangle);
  const materials = materialSlots.map((textureId) => createSurfaceMaterial(color, cache.resolve(textureId)));
  applyMaterialLayout(mesh, perTriangle, materialSlots, options.preserveTriangleOrder === true);
  disposeOwnedMaterials(mesh);
  mesh.material = pickMaterialAssignment(materials);
  publishContentMaterials(mesh);
}

/**
 * Returns a single texture id when the mesh is uniform (mesh-level id,
 * whole-mesh map, or all map entries share one id). Multi-texture free meshes
 * are not used.
 *
 * @param mesh Content mesh.
 * @returns Texture id when a single material is enough, else null.
 */
function resolveUniformContentTextureId(mesh: THREE.Mesh): string | null {
  const entries = getFaceTextureMapsLive(mesh);
  if (entries.length === 0) {
    return readContentMeshTextureId(mesh);
  }
  if (entries.length === 1 && (entries[0]?.triangleIndices.length ?? 0) === 0) {
    return entries[0]?.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }
  return readUniformTextureIdFromFaceMaps(mesh);
}

/**
 * Assigns one material for the whole mesh without per-triangle tables or
 * groups.
 *
 * @param mesh Content mesh.
 * @param textureId Texture identity.
 * @param color Tint hex.
 * @param cache Texture map cache.
 */
function applyUniformSurfaceMaterial(mesh: THREE.Mesh, textureId: string, color: number, cache: TextureMapCache): void {
  mesh.geometry.clearGroups();
  const material = createSurfaceMaterial(color, cache.resolve(textureId || DEFAULT_CHECKER_TEXTURE_ID));
  disposeOwnedMaterials(mesh);
  mesh.material = material;
  publishContentMaterials(mesh);
}

/** Region input for solid-result material rebuild (avoids map clone thrash). */
export interface SolidResultTextureRegion {
  /** Triangle indices in the result mesh. */
  triangleIndices: number[];
  /** Texture id for those triangles. */
  textureId: string;
}

/**
 * Rebuilds solid result materials from surface regions without cloning map
 * tables. Uses a compact slot array and run-length groups (critical for large
 * VMF meshes).
 *
 * @param mesh Solid result mesh.
 * @param regions Surface regions with texture ids.
 * @param cache Optional texture map cache.
 * @param colorHex Optional tint.
 */
export function rebuildSolidResultMaterials(
  mesh: THREE.Mesh,
  regions: readonly SolidResultTextureRegion[],
  cache: TextureMapCache = getTextureMapCache(),
  colorHex?: number,
): void {
  const color = colorHex ?? extractMeshColor(mesh);
  const triangleCount = countTriangles(mesh.geometry);
  if (triangleCount === 0) return;
  const materialSlots = collectRegionTextureIds(regions);
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  const slotPerTriangle = new Uint16Array(triangleCount);
  for (const region of regions) {
    const slot = slotIndex.get(region.textureId || DEFAULT_CHECKER_TEXTURE_ID) ?? 0;
    for (const triangleIndex of region.triangleIndices) {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        slotPerTriangle[triangleIndex] = slot;
      }
    }
  }
  mesh.geometry.clearGroups();
  if (materialSlots.length > 1) {
    applySlotRunGroups(mesh.geometry, slotPerTriangle, materialSlots.length);
  }
  const materials = materialSlots.map((textureId) => createSurfaceMaterial(color, cache.resolve(textureId)));
  disposeOwnedMaterials(mesh);
  mesh.material = pickMaterialAssignment(materials);
  publishContentMaterials(mesh);
}

/**
 * Collects unique texture ids from solid regions in first-seen order.
 *
 * @param regions Solid texture regions.
 * @returns Unique texture id list.
 */
function collectRegionTextureIds(regions: readonly SolidResultTextureRegion[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const region of regions) {
    const id = region.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered.length > 0 ? ordered : [DEFAULT_CHECKER_TEXTURE_ID];
}

/**
 * Writes merged geometry groups from per-triangle material slot indices.
 *
 * @param geometry Target geometry.
 * @param slotPerTriangle Material slot per triangle.
 * @param slotCount Number of material slots.
 */
function applySlotRunGroups(geometry: THREE.BufferGeometry, slotPerTriangle: Uint16Array, slotCount: number): void {
  void slotCount;
  let runStart = 0;
  while (runStart < slotPerTriangle.length) {
    const materialIndex = slotPerTriangle[runStart];
    let runEnd = runStart + 1;
    while (runEnd < slotPerTriangle.length && slotPerTriangle[runEnd] === materialIndex) {
      runEnd += 1;
    }
    geometry.addGroup(runStart * 3, (runEnd - runStart) * 3, materialIndex);
    runStart = runEnd;
  }
}

/**
 * Sorts triangles by material and writes compact geometry groups.
 *
 * @param mesh Content mesh.
 * @param perTriangle Texture id per original triangle index.
 * @param materialSlots Ordered unique texture ids.
 * @param preserveTriangleOrder When true, skip reordering and group in place.
 */
function applyMaterialLayout(
  mesh: THREE.Mesh,
  perTriangle: string[],
  materialSlots: string[],
  preserveTriangleOrder: boolean,
): void {
  mesh.geometry.clearGroups();
  if (materialSlots.length <= 1) {
    return;
  }
  if (preserveTriangleOrder) {
    applyMergedGeometryGroups(mesh.geometry, perTriangle, materialSlots);
    return;
  }
  const order = buildMaterialSortedOrder(perTriangle, materialSlots);
  if (!isIdentityOrder(order)) {
    reorderGeometryTriangles(mesh.geometry, order);
    remapFaceTextureMaps(mesh, order);
    remapTriangleSources(mesh, order);
  }
  const sortedIds = order.map((oldIndex) => perTriangle[oldIndex] ?? DEFAULT_CHECKER_TEXTURE_ID);
  applyMergedGeometryGroups(mesh.geometry, sortedIds, materialSlots);
}

/**
 * Builds a per-triangle texture id table from stored maps.
 *
 * @param mesh Mesh with optional faceTextureMaps.
 * @param triangleCount Number of triangles.
 * @returns Texture id per triangle index.
 */
function buildPerTriangleTextureIds(mesh: THREE.Mesh, triangleCount: number): string[] {
  const ids = new Array<string>(triangleCount).fill(DEFAULT_CHECKER_TEXTURE_ID);
  const entries = getFaceTextureMapsLive(mesh);
  if (entries.length === 0) {
    const meshTextureId = readContentMeshTextureId(mesh);
    if (meshTextureId !== DEFAULT_CHECKER_TEXTURE_ID) {
      ids.fill(meshTextureId);
    }
    return ids;
  }
  for (const entry of entries) {
    const textureId = entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    if (entry.triangleIndices.length === 0) {
      ids.fill(textureId);
      continue;
    }
    for (const triangleIndex of entry.triangleIndices) {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        ids[triangleIndex] = textureId;
      }
    }
  }
  return ids;
}

/**
 * Collects unique texture ids in first-seen order.
 *
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
 * Builds a stable triangle order grouped by material slot.
 *
 * @param perTriangle Texture id per triangle.
 * @param materialSlots Ordered unique texture ids.
 * @returns New-order list of original triangle indices.
 */
function buildMaterialSortedOrder(perTriangle: string[], materialSlots: string[]): number[] {
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  const buckets: number[][] = materialSlots.map(() => []);
  for (let triangleIndex = 0; triangleIndex < perTriangle.length; triangleIndex++) {
    const textureId = perTriangle[triangleIndex] ?? DEFAULT_CHECKER_TEXTURE_ID;
    const slot = slotIndex.get(textureId) ?? 0;
    const bucket = buckets[slot];
    if (bucket) bucket.push(triangleIndex);
  }
  const order: number[] = [];
  buckets.forEach((bucket) => {
    bucket.forEach((triangleIndex) => order.push(triangleIndex));
  });
  return order;
}

/**
 * Returns whether an order is already 0..n-1.
 *
 * @param order Triangle permutation.
 * @returns True when no reordering is required.
 */
function isIdentityOrder(order: number[]): boolean {
  for (let index = 0; index < order.length; index++) {
    if (order[index] !== index) return false;
  }
  return true;
}

/**
 * Reorders triangle vertex data so material slots become contiguous.
 *
 * @param geometry Mesh geometry (indexed or non-indexed).
 * @param order New-order list of original triangle indices.
 */
function reorderGeometryTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const index = geometry.getIndex();
  if (index) {
    reorderIndexedTriangles(geometry, order);
  } else {
    reorderNonIndexedTriangles(geometry, order);
  }
  // Triangle order changed: face-pick BVH AABBs must be rebuilt or picks hit the
  // wrong surfaces after multi-texture material sorting.
  invalidateFacePickAcceleration(geometry);
}

/**
 * Reorders an indexed geometry's index buffer by triangle order.
 *
 * @param geometry Indexed geometry.
 * @param order New-order list of original triangle indices.
 */
function reorderIndexedTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const index = geometry.getIndex();
  if (!index) return;
  const source = Array.from(index.array as ArrayLike<number>);
  const next = new Array<number>(source.length);
  for (let newTriangle = 0; newTriangle < order.length; newTriangle++) {
    const oldTriangle = order[newTriangle];
    if (oldTriangle === undefined) continue;
    const dst = newTriangle * 3;
    const src = oldTriangle * 3;
    next[dst] = source[src] ?? 0;
    next[dst + 1] = source[src + 1] ?? 0;
    next[dst + 2] = source[src + 2] ?? 0;
  }
  geometry.setIndex(next);
}

/**
 * Reorders non-indexed attribute buffers by triangle order.
 *
 * @param geometry Non-indexed geometry.
 * @param order New-order list of original triangle indices.
 */
function reorderNonIndexedTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const names = Object.keys(geometry.attributes);
  names.forEach((name) => {
    const attribute = geometry.getAttribute(name);
    if (!attribute || isInterleavedAttribute(attribute)) return;
    geometry.setAttribute(name, reorderAttributeByTriangles(attribute, order));
  });
}

/**
 * Returns whether a geometry attribute is interleaved.
 *
 * @param attribute Attribute to inspect.
 * @returns True for InterleavedBufferAttribute.
 */
function isInterleavedAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): attribute is THREE.InterleavedBufferAttribute {
  return (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
}

/**
 * Builds a reordered copy of a buffer attribute for triangle permutation.
 *
 * @param attribute Source attribute.
 * @param order New-order list of original triangle indices.
 * @returns New buffer attribute with reordered vertex triples.
 */
function reorderAttributeByTriangles(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  order: number[],
): THREE.BufferAttribute {
  const itemSize = attribute.itemSize;
  const source = attribute.array as ArrayLike<number>;
  const next = new Float32Array(source.length);
  for (let newTriangle = 0; newTriangle < order.length; newTriangle++) {
    const oldTriangle = order[newTriangle];
    if (oldTriangle === undefined) continue;
    copyTriangleAttribute(source, next, oldTriangle, newTriangle, itemSize);
  }
  const rebuilt = new THREE.BufferAttribute(next, itemSize);
  rebuilt.normalized = attribute.normalized;
  return rebuilt;
}

/**
 * Copies one triangle's attribute components from old to new index.
 *
 * @param source Source attribute array.
 * @param destination Destination attribute array.
 * @param oldTriangle Original triangle index.
 * @param newTriangle Destination triangle index.
 * @param itemSize Components per vertex.
 */
function copyTriangleAttribute(
  source: ArrayLike<number>,
  destination: Float32Array,
  oldTriangle: number,
  newTriangle: number,
  itemSize: number,
): void {
  const dstVertex = newTriangle * 3;
  const srcVertex = oldTriangle * 3;
  for (let corner = 0; corner < 3; corner++) {
    const dst = (dstVertex + corner) * itemSize;
    const src = (srcVertex + corner) * itemSize;
    for (let component = 0; component < itemSize; component++) {
      destination[dst + component] = source[src + component] ?? 0;
    }
  }
}

/**
 * Remaps stored face texture map triangle indices after geometry reorder.
 *
 * @param mesh Mesh owning face texture maps.
 * @param order New-order list of original triangle indices.
 */
function remapFaceTextureMaps(mesh: THREE.Mesh, order: number[]): void {
  const oldToNew = buildOldToNewMap(order);
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  const remapped = entries.map((entry) => ({
    triangleIndices: entry.triangleIndices
      .map((oldIndex) => oldToNew[oldIndex])
      .filter((index) => index !== undefined)
      .sort((a, b) => a - b),
    mapping: entry.mapping,
  }));
  setFaceTextureMaps(mesh, remapped);
}

/**
 * Remaps solid-model triangle source table after geometry reorder.
 *
 * @param mesh Mesh that may store solidTriangleSources.
 * @param order New-order list of original triangle indices.
 */
function remapTriangleSources(mesh: THREE.Mesh, order: number[]): void {
  const sources = mesh.userData[TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(sources) || sources.length === 0) return;
  mesh.userData[TRIANGLE_SOURCES_USERDATA_KEY] = order.map((oldIndex) => sources[oldIndex]);
}

/**
 * Builds old-triangle-index → new-triangle-index lookup.
 *
 * @param order New-order list of original triangle indices.
 * @returns Lookup table.
 */
function buildOldToNewMap(order: number[]): number[] {
  const oldToNew = new Array<number>(order.length);
  for (let newIndex = 0; newIndex < order.length; newIndex++) {
    const oldIndex = order[newIndex];
    if (oldIndex === undefined) continue;
    oldToNew[oldIndex] = newIndex;
  }
  return oldToNew;
}

/**
 * Writes one contiguous geometry group per material slot.
 *
 * @param geometry Mesh geometry.
 * @param sortedPerTriangle Texture ids after material sorting.
 * @param materialSlots Ordered unique texture ids.
 */
function applyMergedGeometryGroups(
  geometry: THREE.BufferGeometry,
  sortedPerTriangle: string[],
  materialSlots: string[],
): void {
  geometry.clearGroups();
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  let runStartTriangle = 0;
  while (runStartTriangle < sortedPerTriangle.length) {
    const runTextureId = sortedPerTriangle[runStartTriangle] ?? DEFAULT_CHECKER_TEXTURE_ID;
    const materialIndex = slotIndex.get(runTextureId) ?? 0;
    let runEndTriangle = runStartTriangle + 1;
    while (runEndTriangle < sortedPerTriangle.length) {
      const nextTextureId = sortedPerTriangle[runEndTriangle] ?? DEFAULT_CHECKER_TEXTURE_ID;
      if ((slotIndex.get(nextTextureId) ?? 0) !== materialIndex) break;
      runEndTriangle += 1;
    }
    geometry.addGroup(runStartTriangle * 3, (runEndTriangle - runStartTriangle) * 3, materialIndex);
    runStartTriangle = runEndTriangle;
  }
}

/**
 * Picks a single material or the full array for mesh assignment.
 *
 * @param materials Built surface materials (non-empty when geometry has tris).
 * @returns Material or material array suitable for mesh.material.
 */
function pickMaterialAssignment(materials: ContentViewLitMaterial[]): THREE.Material | THREE.Material[] {
  const first = materials[0];
  if (materials.length === 1 && first !== undefined) return first;
  return materials;
}

/**
 * Creates one surface material with the given map and view-direction lighting.
 *
 * @param color Hex tint.
 * @param map Diffuse map texture.
 * @returns Content view-lit material.
 */
function createSurfaceMaterial(color: number, map: THREE.Texture): ContentViewLitMaterial {
  return createContentViewLitMaterial(color, map, { flatShading: true, side: THREE.FrontSide });
}

/**
 * Reads the first material color from a mesh. Prefers the shared content
 * snapshot when the mesh is wearing temporary shading overrides (e.g. 2D
 * wireframe black/colorWrite-false materials). Reading overrides would bake
 * pure black into rebuilt content materials after multi-view layout switches.
 *
 * @param mesh Mesh to inspect.
 * @returns Hex color.
 */
function extractMeshColor(mesh: THREE.Mesh): number {
  const snapshotColor = readColorFromSnapshot(mesh.uuid);
  if (snapshotColor !== null) return snapshotColor;
  if (meshUsesShadingOverrideMaterials(mesh)) return 0xffffff;
  const material = mesh.material;
  const first = Array.isArray(material) ? material[0] : material;
  if (first && !isShadingOverrideMaterial(first) && 'color' in first) {
    const color = (first as { color?: THREE.Color }).color;
    if (color) return color.getHex();
  }
  return 0xffffff;
}

/**
 * Reads tint color from the shared content material snapshot when present.
 *
 * @param meshUuid Mesh UUID.
 * @returns Hex color, or null when no usable snapshot exists.
 */
function readColorFromSnapshot(meshUuid: string): number | null {
  const snapshot = getSharedContentMaterials(meshUuid);
  if (!snapshot) return null;
  const first = Array.isArray(snapshot.materials) ? snapshot.materials[0] : snapshot.materials;
  if (!first || !('color' in first)) return null;
  const color = (first as { color?: THREE.Color }).color;
  return color ? color.getHex() : null;
}

/**
 * Disposes previous content materials without disposing shared texture maps.
 * When the mesh is wearing shading overrides, live materials are owned by the
 * shading pass and must not be disposed here; only the snapshotted content
 * materials are freed.
 *
 * @param mesh Mesh whose materials will be replaced.
 */
function disposeOwnedMaterials(mesh: THREE.Mesh): void {
  if (meshUsesShadingOverrideMaterials(mesh)) {
    disposeSnapshottedContentMaterials(mesh.uuid);
    return;
  }
  disposeMaterialList(Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
}

/**
 * Disposes content materials stored in the shared snapshot for a mesh.
 *
 * @param meshUuid Mesh UUID.
 */
function disposeSnapshottedContentMaterials(meshUuid: string): void {
  const snapshot = getSharedContentMaterials(meshUuid);
  if (!snapshot) return;
  disposeMaterialList(Array.isArray(snapshot.materials) ? snapshot.materials : [snapshot.materials]);
}

/**
 * Disposes materials after detaching shared maps.
 *
 * @param materials Materials to dispose.
 */
function disposeMaterialList(materials: readonly (THREE.Material | undefined | null)[]): void {
  materials.forEach((material) => {
    if (!material) return;
    if (isShadingOverrideMaterial(material)) return;
    detachSharedMaps(material);
    material.dispose();
  });
}

/**
 * Records rebuilt materials as the authoritative content snapshot and forces
 * the next multi-view shading pass to re-apply (so wireframe panes do not keep
 * stale black overrides as if they were content).
 *
 * @param mesh Mesh that just received new content materials.
 */
function publishContentMaterials(mesh: THREE.Mesh): void {
  captureSharedContentMaterials(mesh);
  invalidateSharedShadingPass();
}

/**
 * Clears map slots so Material.dispose cannot free shared textures.
 *
 * @param material Material about to be disposed.
 */
function detachSharedMaps(material: THREE.Material): void {
  const mapHost = material as THREE.Material & { map?: THREE.Texture | null; matcap?: THREE.Texture | null };
  if ('map' in mapHost) mapHost.map = null;
  if ('matcap' in mapHost) mapHost.matcap = null;
}
