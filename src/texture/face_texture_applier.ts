import * as THREE from 'three';
import { FaceSelection } from '../selection/face_selection_manager.js';
import { groupSelectionsIntoFaceRegions } from '../selection/face_region_grouper.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from './face_texture_mapping.js';
import { upsertFaceTextureMap, getFaceTextureMaps, setFaceTextureMaps } from './face_texture_storage.js';
import {
  bakeFaceUVs,
  bakeAllFacesDefaultUVs,
  countTriangles,
  rebakeStoredFaceTextureMaps
} from './planar_uv_projector.js';
import { applyCylinderSideUnwrapOffsets } from './cylinder_side_unwrap.js';
import { captureGeometrySourceIfNeeded } from './geometry_source.js';
import { rebuildSurfaceMaterials } from './surface_material_builder.js';
import { getTexturePaintState } from './texture_paint_state.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';

/**
 * Describes one mesh region that will receive a texture mapping update.
 */
export interface TextureApplyTarget {
  mesh: THREE.Mesh;
  triangleIndices: number[];
  previousMapping: FaceTextureMapping | null;
}

/**
 * Builds apply targets from face selections (coplanar regions).
 * @param selections Current face selection entries.
 * @returns Targets ready for mapping updates.
 */
export function buildTargetsFromFaceSelection(
  selections: FaceSelection[]
): TextureApplyTarget[] {
  const regions = groupSelectionsIntoFaceRegions(selections);
  return regions.map((region) => ({
    mesh: region.mesh,
    triangleIndices: region.faceIndices.slice(),
    previousMapping: findExistingMapping(region.mesh, region.faceIndices)
  }));
}

/**
 * Builds apply targets covering every triangle on each mesh.
 * @param meshes Selected content meshes.
 * @returns One target per coplanar region across all meshes.
 */
export function buildTargetsFromMeshes(meshes: THREE.Mesh[]): TextureApplyTarget[] {
  const targets: TextureApplyTarget[] = [];
  meshes.forEach((mesh) => {
    const triangleCount = countTriangles(mesh.geometry);
    const indices: number[] = [];
    for (let i = 0; i < triangleCount; i++) indices.push(i);
    const selections: FaceSelection[] = indices.map((faceIndex) => ({
      mesh,
      faceIndex
    }));
    targets.push(...buildTargetsFromFaceSelection(selections));
  });
  return targets;
}

/**
 * Finds a stored mapping for a triangle region.
 * Prefers exact triangle-set match, then a covering entry, then any overlap.
 * @param mesh Mesh to search.
 * @param triangleIndices Region indices.
 * @returns Existing mapping or null.
 */
function findExistingMapping(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): FaceTextureMapping | null {
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  const key = sorted.join(',');
  const indexSet = new Set(sorted);
  const entries = getFaceTextureMaps(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entryKey = entries[i].triangleIndices.slice().sort((a, b) => a - b).join(',');
    if (entryKey === key) return cloneFaceTextureMapping(entries[i].mapping);
  }
  for (let i = 0; i < entries.length; i++) {
    if (regionFullyCoveredByEntry(sorted, entries[i].triangleIndices)) {
      return cloneFaceTextureMapping(entries[i].mapping);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].triangleIndices.some((index) => indexSet.has(index))) {
      return cloneFaceTextureMapping(entries[i].mapping);
    }
  }
  return null;
}

/**
 * Returns whether every target triangle appears in the entry.
 * @param sortedTarget Sorted target triangle indices.
 * @param entryIndices Entry triangle indices.
 * @returns True when the entry covers the whole target region.
 */
function regionFullyCoveredByEntry(
  sortedTarget: number[],
  entryIndices: number[]
): boolean {
  const entrySet = new Set(entryIndices);
  return sortedTarget.every((index) => entrySet.has(index));
}

/**
 * Resolves the effective mapping for a target (live storage, then snapshot, then default).
 * @param target Apply target.
 * @returns Mapping to edit.
 */
export function resolveTargetMapping(
  target: TextureApplyTarget
): FaceTextureMapping {
  const live = findExistingMapping(target.mesh, target.triangleIndices);
  if (live) return live;
  if (target.previousMapping) {
    return cloneFaceTextureMapping(target.previousMapping);
  }
  return createDefaultFaceTextureMapping();
}

/**
 * Applies UV editor fields to each target while preserving each region's
 * textureId (and any omitted identity). Bakes UVs afterward.
 * @param targets Regions to update.
 * @param mapping Mapping parameters to write.
 */
export function applyMappingToTargets(
  targets: TextureApplyTarget[],
  mapping: FaceTextureMapping
): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const fullMapping = mergeMappingPreservingTexture(target, mapping);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, fullMapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, fullMapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildSurfaceMaterials(mesh));
}

/**
 * Assigns a texture id without rebaking UVs.
 * Projection params and the baked UV buffer stay untouched so cylinder unwrap
 * and per-face offsets survive paint operations.
 * @param targets Regions to update.
 * @param textureId Texture identity to apply.
 */
export function applyTextureIdToTargets(
  targets: TextureApplyTarget[],
  textureId: string
): void {
  const resolvedId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    patchTextureIdOnRegion(target.mesh, target.triangleIndices, resolvedId);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildSurfaceMaterials(mesh));
}

/**
 * Sets only the align preset on targets, keeping scale/offset/rotation/texture.
 * @param targets Regions to update.
 * @param align Align preset.
 */
export function applyAlignToTargets(
  targets: TextureApplyTarget[],
  align: FaceTextureAlign
): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const mapping = resolveTargetMapping(target);
    mapping.align = align;
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildSurfaceMaterials(mesh));
}

/**
 * Resets UV projection to smart defaults while keeping texture ids.
 * Restores face-plane auto projection (scale 1, rotation 0). When every
 * triangle of a cylinder is included, re-applies circumferential U unwrap
 * so the shell matches create-time layout.
 * @param targets Regions to reset.
 */
export function resetUvParamsOnTargets(targets: TextureApplyTarget[]): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const mapping = createDefaultFaceTextureMapping(existing.textureId);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => {
    const meshTargets = targets.filter((target) => target.mesh === mesh);
    if (targetsCoverEntireMesh(mesh, meshTargets)) {
      restoreGeometryAwareUvDefaults(mesh);
      rebakeStoredFaceTextureMaps(mesh);
    } else {
      meshTargets.forEach((target) => {
        const mapping = resolveTargetMapping(target);
        bakeFaceUVs(mesh, target.triangleIndices, mapping);
      });
    }
    rebuildSurfaceMaterials(mesh);
  });
}

/**
 * Returns whether the targets include every triangle on the mesh.
 * @param mesh Mesh to test.
 * @param meshTargets Targets belonging to that mesh.
 * @returns True when the whole surface is covered.
 */
function targetsCoverEntireMesh(
  mesh: THREE.Mesh,
  meshTargets: TextureApplyTarget[]
): boolean {
  const covered = new Set<number>();
  meshTargets.forEach((target) => {
    target.triangleIndices.forEach((index) => covered.add(index));
  });
  return covered.size === countTriangles(mesh.geometry);
}

/**
 * Patches textureId on stored entries that overlap a region (no UV rewrite).
 * @param mesh Mesh owning face maps.
 * @param triangleIndices Region triangles.
 * @param textureId New texture identity.
 */
function patchTextureIdOnRegion(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  textureId: string
): void {
  const indexSet = new Set(triangleIndices);
  const entries = getFaceTextureMaps(mesh);
  let hitCount = 0;
  entries.forEach((entry) => {
    const overlaps = entry.triangleIndices.some((index) => indexSet.has(index));
    if (!overlaps) return;
    entry.mapping.textureId = textureId;
    hitCount += 1;
  });
  if (hitCount === 0) {
    entries.push({
      triangleIndices: triangleIndices.slice().sort((a, b) => a - b),
      mapping: createDefaultFaceTextureMapping(textureId)
    });
  }
  setFaceTextureMaps(mesh, entries);
}

/**
 * Re-applies geometry-specific UV layout (cylinder unwrap) after a reset.
 * @param mesh Mesh whose face maps were reset to defaults.
 */
function restoreGeometryAwareUvDefaults(mesh: THREE.Mesh): void {
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
}

/**
 * @deprecated Use resetUvParamsOnTargets — name kept for older call sites.
 * @param targets Regions to reset.
 */
export function resetTargetsToDefault(targets: TextureApplyTarget[]): void {
  resetUvParamsOnTargets(targets);
}

/**
 * Initializes default UVs, face maps, and surface materials on a content mesh.
 * Uses the last painted texture id when available.
 * @param mesh Mesh to prepare.
 * @param textureId Optional texture id override.
 * @param align Optional projection align override (e.g. floor for terrain).
 */
export function initializeMeshTextureUVs(
  mesh: THREE.Mesh,
  textureId?: string,
  align?: FaceTextureAlign
): void {
  captureGeometrySourceIfNeeded(mesh);
  const paintId =
    textureId ?? getTexturePaintState().getLastTextureId();
  const mapping = createDefaultFaceTextureMapping(paintId);
  if (align) {
    mapping.align = align;
  }
  const triangleCount = countTriangles(mesh.geometry);
  const allIndices: number[] = [];
  for (let i = 0; i < triangleCount; i++) allIndices.push(i);
  const targets = buildTargetsFromFaceSelection(
    allIndices.map((faceIndex) => ({ mesh, faceIndex }))
  );
  if (targets.length === 0) {
    bakeAllFacesDefaultUVs(mesh, mapping);
    rebuildSurfaceMaterials(mesh);
    return;
  }
  const entries = targets.map((target) => ({
    triangleIndices: target.triangleIndices.slice(),
    mapping: cloneFaceTextureMapping(mapping)
  }));
  // Unwrap cylinder sides so U walks continuously around the shell.
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
  rebakeStoredFaceTextureMaps(mesh);
  rebuildSurfaceMaterials(mesh);
}

/**
 * Reads a common mapping across targets when all values match.
 * @param targets Selection targets.
 * @returns Shared mapping, or null when mixed / empty.
 */
export function getCommonMapping(
  targets: TextureApplyTarget[]
): FaceTextureMapping | null {
  if (targets.length === 0) return null;
  const first = resolveTargetMapping(targets[0]);
  for (let i = 1; i < targets.length; i++) {
    const next = resolveTargetMapping(targets[i]);
    if (!mappingsEqual(first, next)) return null;
  }
  return first;
}

/**
 * Compares two mappings for equality.
 * @param a First mapping.
 * @param b Second mapping.
 * @returns True when all fields match.
 */
function mappingsEqual(a: FaceTextureMapping, b: FaceTextureMapping): boolean {
  return (
    a.align === b.align &&
    a.scaleU === b.scaleU &&
    a.scaleV === b.scaleV &&
    a.offsetU === b.offsetU &&
    a.offsetV === b.offsetV &&
    a.rotationDeg === b.rotationDeg &&
    (a.textureId || DEFAULT_CHECKER_TEXTURE_ID) ===
      (b.textureId || DEFAULT_CHECKER_TEXTURE_ID)
  );
}

/**
 * Merges UV params from mapping onto the target, keeping textureId when omitted.
 * @param target Region being updated.
 * @param mapping Incoming mapping (may omit textureId).
 * @returns Complete mapping with textureId.
 */
function mergeMappingPreservingTexture(
  target: TextureApplyTarget,
  mapping: FaceTextureMapping
): FaceTextureMapping {
  const clone = cloneFaceTextureMapping(mapping);
  if (!mapping.textureId) {
    clone.textureId = resolveTargetMapping(target).textureId;
  }
  if (!clone.textureId) {
    clone.textureId = DEFAULT_CHECKER_TEXTURE_ID;
  }
  return clone;
}
