import * as THREE from 'three';
import { FaceSelection } from '@/selection/face/manager_face_selection.js';
import { groupSelectionsIntoFaceRegions } from '@/selection/face/face_region_grouper.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
  createFaceTextureMappingFromTrs,
  getFaceTextureMappingTrs,
} from './face_texture_mapping.js';
import {
  upsertFaceTextureMap,
  getFaceTextureMaps,
  getFaceTextureMapsLive,
  setFaceTextureMaps,
} from './face_texture_storage.js';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import {
  bakeFaceUVs,
  bakeAllFacesDefaultUVs,
  computeRegionWorldNormal,
  countTriangles,
  rebakeStoredFaceTextureMaps,
  resolveProjectionNormal,
  splitMeshIntoCoplanarRegions,
} from './planar_uv_projector.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { applyCylinderSideUnwrapOffsets } from './cylinder_side_unwrap.js';
import { captureGeometrySourceIfNeeded } from './geometry_source.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import {
  applyPartialFieldsToTrs,
  applyRelativeOpToTrs,
  isAlignCompatibleWithFace,
  readMappingTrs,
  rebuildMappingWithTrs,
  type UvRelativeTrsOp,
} from './uv_trs_ops.js';
import type { FaceTextureMappingTrs } from './face_texture_mapping.js';
import { buildTargetsFromSolidBrushMesh, isSolidBrushPreviewMesh } from './solid_brush_texture_targets.js';

/** Describes one mesh region that will receive a texture mapping update. */
export interface TextureApplyTarget {
  mesh: THREE.Mesh;
  triangleIndices: number[];
  previousMapping: FaceTextureMapping | null;
}

/**
 * Builds apply targets from face selections (coplanar regions).
 *
 * @param selections Current face selection entries.
 * @returns Targets ready for mapping updates.
 */
export function buildTargetsFromFaceSelection(selections: FaceSelection[]): TextureApplyTarget[] {
  const regions = groupSelectionsIntoFaceRegions(selections);
  return regions.map((region) => ({
    mesh: region.mesh,
    triangleIndices: region.faceIndices.slice(),
    previousMapping: findExistingMapping(region.mesh, region.faceIndices),
  }));
}

/**
 * Builds apply targets covering every triangle on each mesh. Solid brush
 * preview meshes resolve to their CSG result faces instead of the brush hull.
 *
 * @param meshes Selected content meshes and/or solid brush previews.
 * @returns One target per coplanar region across all meshes.
 */
export function buildTargetsFromMeshes(meshes: THREE.Mesh[]): TextureApplyTarget[] {
  const targets: TextureApplyTarget[] = [];
  meshes.forEach((mesh) => {
    if (isSolidBrushPreviewMesh(mesh)) {
      targets.push(...buildTargetsFromSolidBrushMesh(mesh));
      return;
    }
    targets.push(...buildTargetsFromWholeContentMesh(mesh));
  });
  return targets;
}

/**
 * Builds apply targets covering every triangle on one ordinary content mesh.
 * Prefers stored face maps when present; otherwise uses linear-time coplanar
 * regionization (never O(n²) seed flood).
 *
 * @param mesh Content mesh (not a solid brush preview).
 * @returns One target per coplanar region on the mesh.
 */
function buildTargetsFromWholeContentMesh(mesh: THREE.Mesh): TextureApplyTarget[] {
  const storedTargets = buildTargetsFromStoredFaceMaps(mesh);
  if (storedTargets) {
    return storedTargets;
  }
  return buildTargetsFromCoplanarMeshRegions(mesh);
}

/**
 * Builds targets from stored face texture maps when the mesh already has them.
 *
 * @param mesh Content mesh.
 * @returns Targets, or null when no maps are stored.
 */
function buildTargetsFromStoredFaceMaps(mesh: THREE.Mesh): TextureApplyTarget[] | null {
  const entries = getFaceTextureMapsLive(mesh);
  if (entries.length === 0) {
    return null;
  }
  return entries.map((entry) => ({
    mesh,
    triangleIndices: entry.triangleIndices.slice(),
    previousMapping: cloneFaceTextureMapping(entry.mapping),
  }));
}

/**
 * Builds one target per coplanar region across the full mesh triangle set.
 *
 * @param mesh Content mesh.
 * @returns Coplanar apply targets.
 */
function buildTargetsFromCoplanarMeshRegions(mesh: THREE.Mesh): TextureApplyTarget[] {
  const regions = splitMeshIntoCoplanarRegions(mesh);
  return regions.map((faceIndices) => ({
    mesh,
    triangleIndices: faceIndices,
    previousMapping: null,
  }));
}

/**
 * Finds a stored mapping for a triangle region. Prefers solid brush-surface
 * identity when present (O(entries) without cloning). Ordinary meshes use exact
 * set / cover / overlap matching.
 *
 * @param mesh Mesh to search.
 * @param triangleIndices Region indices.
 * @returns Existing mapping or null.
 */
function findExistingMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping | null {
  if (triangleIndices.length === 0) return null;
  const seedIndex = triangleIndices[0];
  if (seedIndex === undefined) return null;
  const solidMapping = findSolidSurfaceMapping(mesh, seedIndex);
  if (solidMapping) return solidMapping;
  return findOrdinaryMeshMapping(mesh, triangleIndices);
}

/**
 * Resolves a solid-result face mapping via triangle source identity without
 * cloning the entire face-map table.
 *
 * @param mesh Solid result mesh.
 * @param seedFaceIndex Any triangle on the brush surface.
 * @returns Cloned mapping or null when not a solid result / not found.
 */
function findSolidSurfaceMapping(mesh: THREE.Mesh, seedFaceIndex: number): FaceTextureMapping | null {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const seed = sources[seedFaceIndex] as { brushId?: string; surfaceIndex?: number } | undefined;
  if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') return null;
  const entries = getFaceTextureMapsLive(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const sampleIndex = entry.triangleIndices[0];
    if (sampleIndex === undefined) continue;
    const sample = sources[sampleIndex] as { brushId?: string; surfaceIndex?: number } | undefined;
    if (!sample) continue;
    if (sample.brushId === seed.brushId && sample.surfaceIndex === seed.surfaceIndex) {
      return cloneFaceTextureMapping(entry.mapping);
    }
  }
  return null;
}

/**
 * Finds a stored mapping for ordinary (non-solid) mesh regions.
 *
 * @param mesh Mesh to search.
 * @param triangleIndices Region indices.
 * @returns Existing mapping or null.
 */
function findOrdinaryMeshMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping | null {
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  const key = sorted.join(',');
  const indexSet = new Set(sorted);
  const entries = getFaceTextureMapsLive(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const entryKey = entry.triangleIndices
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    if (entryKey === key) return cloneFaceTextureMapping(entry.mapping);
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (regionFullyCoveredByEntry(sorted, entry.triangleIndices)) {
      return cloneFaceTextureMapping(entry.mapping);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.triangleIndices.some((index) => indexSet.has(index))) {
      return cloneFaceTextureMapping(entry.mapping);
    }
  }
  return null;
}

/**
 * Returns whether every target triangle appears in the entry.
 *
 * @param sortedTarget Sorted target triangle indices.
 * @param entryIndices Entry triangle indices.
 * @returns True when the entry covers the whole target region.
 */
function regionFullyCoveredByEntry(sortedTarget: number[], entryIndices: number[]): boolean {
  const entrySet = new Set(entryIndices);
  return sortedTarget.every((index) => entrySet.has(index));
}

/**
 * Resolves the effective mapping for a target (live storage, then snapshot,
 * then default).
 *
 * @param target Apply target.
 * @returns Mapping to edit.
 */
export function resolveTargetMapping(target: TextureApplyTarget): FaceTextureMapping {
  const live = findExistingMapping(target.mesh, target.triangleIndices);
  if (live) return live;
  if (target.previousMapping) {
    return cloneFaceTextureMapping(target.previousMapping);
  }
  return createDefaultFaceTextureMapping();
}

/**
 * Applies UV editor fields to each target while preserving each region's
 * textureId. Rebuilds the UV matrix from TRS using each region's face normal so
 * rotation/scale never use a wrong plane (e.g. Y-up for a Z face).
 *
 * @param targets Regions to update.
 * @param mapping Mapping parameters (TRS source; matrix is rebuilt per face).
 */
export function applyMappingToTargets(targets: TextureApplyTarget[], mapping: FaceTextureMapping): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const fullMapping = buildFaceOrientedMapping(target, mapping);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, fullMapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, fullMapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Builds a face-oriented UV matrix mapping from editor TRS fields.
 *
 * @param target Region receiving the mapping.
 * @param mapping Incoming mapping (TRS extracted from its matrix).
 * @returns Mapping with UV matrix on the face plane.
 */
function buildFaceOrientedMapping(target: TextureApplyTarget, mapping: FaceTextureMapping): FaceTextureMapping {
  const textureId = resolveTextureIdForMerge(target, mapping);
  const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
  const align = mapping.align ?? 'face';
  const projectionNormal = resolveProjectionNormal(faceNormal, align);
  const trs = getFaceTextureMappingTrs(mapping, resolveSourceMatrixNormal(mapping, projectionNormal));
  return createFaceTextureMappingFromTrs(textureId, projectionNormal, trs, align);
}

/**
 * Extracts TRS from a source mapping in that matrix's authored plane. Does not
 * re-align to each target face, so the same editor scale/rotation is stamped
 * onto every face (negative scale stays negative for all).
 *
 * @param mapping Incoming mapping.
 * @param fallbackNormal Used when the matrix plane is degenerate.
 * @returns Unit normal for TRS decompose.
 */
function resolveSourceMatrixNormal(mapping: FaceTextureMapping, fallbackNormal: THREE.Vector3): THREE.Vector3 {
  if (mapping.uv instanceof SurfaceUvMatrix) {
    const planeNormal = mapping.uv.planeNormal();
    if (planeNormal.lengthSq() > 1e-20) {
      return planeNormal;
    }
  }
  return fallbackNormal.clone().normalize();
}

/**
 * Resolves texture id when merging editor fields onto a target. An empty or
 * missing textureId on the incoming mapping keeps each region's existing
 * texture. A non-empty id replaces the region's texture.
 *
 * @param target Region being updated.
 * @param mapping Incoming mapping.
 * @returns Texture identity string.
 */
function resolveTextureIdForMerge(target: TextureApplyTarget, mapping: FaceTextureMapping): string {
  if (mapping.textureId !== undefined && mapping.textureId !== '') {
    return mapping.textureId;
  }
  const existing = resolveTargetMapping(target).textureId;
  return existing || DEFAULT_CHECKER_TEXTURE_ID;
}

/**
 * Assigns a texture id without rebaking UVs. Projection params and the baked UV
 * buffer stay untouched.
 *
 * @param targets Regions to update.
 * @param textureId Texture identity to apply.
 */
export function applyTextureIdToTargets(targets: TextureApplyTarget[], textureId: string): void {
  const resolvedId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    patchTextureIdOnRegion(target.mesh, target.triangleIndices, resolvedId);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Sets only the align preset on targets, keeping scale/offset/rotation/texture.
 * Rebuilds each UV matrix on the align projection plane from TRS extracted
 * against the existing matrix plane. Faces where the align would degenerate
 * (e.g. Ceiling on a wall) are skipped.
 *
 * @param targets Regions to update.
 * @param align Align preset.
 * @returns Number of regions actually changed.
 */
export function applyAlignToTargets(targets: TextureApplyTarget[], align: FaceTextureAlign): number {
  const meshes = new Set<THREE.Mesh>();
  let changedCount = 0;
  targets.forEach((target) => {
    if (!applyAlignToSingleTarget(target, align)) return;
    changedCount += 1;
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
  return changedCount;
}

/**
 * Applies a relative TRS op independently to every target (multi-select safe).
 *
 * @param targets Regions to update.
 * @param op Relative scale/offset/rotation operation.
 */
export function applyRelativeTrsToTargets(targets: TextureApplyTarget[], op: UvRelativeTrsOp): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
    const trs = applyRelativeOpToTrs(readMappingTrs(existing, faceNormal), op);
    const mapping = rebuildMappingWithTrs(existing, faceNormal, trs);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Writes absolute TRS fields onto every target. Only keys present in fields are
 * changed; missing keys keep each region's existing value.
 *
 * @param targets Regions to update.
 * @param fields Partial absolute TRS fields.
 */
export function applyPartialTrsToTargets(targets: TextureApplyTarget[], fields: Partial<FaceTextureMappingTrs>): void {
  if (Object.keys(fields).length === 0) return;
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
    const trs = applyPartialFieldsToTrs(readMappingTrs(existing, faceNormal), fields);
    const mapping = rebuildMappingWithTrs(existing, faceNormal, trs);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Applies align to one target when compatible with its face normal.
 *
 * @param target Region to update.
 * @param align Align preset.
 * @returns True when the region was modified.
 */
function applyAlignToSingleTarget(target: TextureApplyTarget, align: FaceTextureAlign): boolean {
  const existing = resolveTargetMapping(target);
  const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
  if (!isAlignCompatibleWithFace(faceNormal, align)) return false;
  const projectionNormal = resolveProjectionNormal(faceNormal, align);
  const trs = readMappingTrs(existing, faceNormal);
  const mapping = createFaceTextureMappingFromTrs(existing.textureId, projectionNormal, trs, align);
  upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
  bakeFaceUVs(target.mesh, target.triangleIndices, mapping);
  return true;
}

/**
 * Resets UV projection to smart defaults while keeping texture ids. Restores
 * face-plane auto projection (scale 1, rotation 0) with a face-oriented UV
 * matrix (not identity). When every triangle of a cylinder is included,
 * re-applies circumferential U unwrap so the shell matches create-time layout.
 *
 * @param targets Regions to reset.
 */
export function resetUvParamsOnTargets(targets: TextureApplyTarget[]): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const mapping = createFaceOrientedDefaultMapping(target, existing.textureId);
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
    rebuildMaterialsPreservingSolidOrder(mesh);
  });
}

/**
 * Builds a default face-plane UV mapping (1 m tiles, 0 rotation) oriented to
 * the target region's world normal under auto align.
 *
 * @param target Region receiving the default mapping.
 * @param textureId Texture identity to keep; empty falls back to the default
 *   checker.
 * @returns Face-oriented default mapping.
 */
function createFaceOrientedDefaultMapping(target: TextureApplyTarget, textureId: string): FaceTextureMapping {
  const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
  const projectionNormal = resolveProjectionNormal(faceNormal, 'auto');
  return createFaceTextureMappingFromTrs(
    textureId || DEFAULT_CHECKER_TEXTURE_ID,
    projectionNormal,
    { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 },
    'auto',
  );
}

/**
 * Rebuilds surface materials without reordering solid result triangles. Solid
 * CSG result meshes keep their existing triangle order. Brush preview hulls are
 * not rebuilt.
 *
 * @param mesh Mesh receiving material layout.
 */
function rebuildMaterialsPreservingSolidOrder(mesh: THREE.Mesh): void {
  if (isSolidBrushPreviewMesh(mesh)) {
    return;
  }
  rebuildSurfaceMaterials(mesh, undefined, undefined, {
    preserveTriangleOrder: isResultMesh(mesh),
  });
}

/**
 * Returns whether the targets include every triangle on the mesh.
 *
 * @param mesh Mesh to test.
 * @param meshTargets Targets belonging to that mesh.
 * @returns True when the whole surface is covered.
 */
function targetsCoverEntireMesh(mesh: THREE.Mesh, meshTargets: TextureApplyTarget[]): boolean {
  const covered = new Set<number>();
  meshTargets.forEach((target) => {
    target.triangleIndices.forEach((index) => covered.add(index));
  });
  return covered.size === countTriangles(mesh.geometry);
}

/**
 * Patches textureId on stored entries that overlap a region (no UV rewrite).
 *
 * @param mesh Mesh owning face maps.
 * @param triangleIndices Region triangles.
 * @param textureId New texture identity.
 */
function patchTextureIdOnRegion(mesh: THREE.Mesh, triangleIndices: number[], textureId: string): void {
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
      mapping: createDefaultFaceTextureMapping(textureId),
    });
  }
  setFaceTextureMaps(mesh, entries);
}

/**
 * Re-applies geometry-specific UV layout (cylinder unwrap) after a reset.
 *
 * @param mesh Mesh whose face maps were reset to defaults.
 */
function restoreGeometryAwareUvDefaults(mesh: THREE.Mesh): void {
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
}

/** Optional UV initialization overrides. */
export interface InitializeMeshTextureUvOptions {
  /**
   * When true, uses centered UV translation (+0.5) so unit faces map one full
   * tile with the texture centered on each side.
   */
  centerTexture?: boolean;
}

/**
 * Initializes default UVs, face maps, and surface materials on a content mesh.
 * Uses the last painted texture id when available.
 *
 * @param mesh Mesh to prepare.
 * @param textureId Optional texture id override.
 * @param align Optional projection align override (e.g. floor for terrain).
 * @param options Optional UV init flags (e.g. centered texture).
 */
export function initializeMeshTextureUVs(
  mesh: THREE.Mesh,
  textureId?: string,
  align?: FaceTextureAlign,
  options?: InitializeMeshTextureUvOptions,
): void {
  captureGeometrySourceIfNeeded(mesh);
  const paintId = textureId ?? getStateTexturePaint().getLastTextureId();
  const triangleCount = countTriangles(mesh.geometry);
  const allIndices: number[] = [];
  for (let i = 0; i < triangleCount; i++) allIndices.push(i);
  const targets = buildTargetsFromFaceSelection(allIndices.map((faceIndex) => ({ mesh, faceIndex })));
  if (targets.length === 0) {
    bakeAllFacesDefaultUVs(mesh, createDefaultFaceTextureMapping(paintId));
    rebuildSurfaceMaterials(mesh);
    return;
  }
  const trs = resolveDefaultMeshTextureTrs(paintId, options?.centerTexture === true);
  const entries = targets.map((target) => {
    const faceNormal = computeRegionWorldNormal(mesh, target.triangleIndices);
    const projectionNormal = resolveProjectionNormal(faceNormal, align ?? 'auto');
    return {
      triangleIndices: target.triangleIndices.slice(),
      mapping: createFaceTextureMappingFromTrs(paintId, projectionNormal, trs, align ?? 'auto'),
    };
  });
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
  rebakeStoredFaceTextureMaps(mesh);
  rebuildSurfaceMaterials(mesh);
}

/**
 * Resolves default TRS for mesh UV init.
 *
 * @param paintId Texture id for default mapping.
 * @param centerTexture Whether to use centered UV translation from a default
 *   mapping.
 * @returns Scale, offset, and rotation degrees for the default mapping.
 */
function resolveDefaultMeshTextureTrs(
  paintId: string,
  centerTexture: boolean,
): { scaleU: number; scaleV: number; offsetU: number; offsetV: number; rotationDeg: number } {
  if (!centerTexture) {
    return { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 };
  }
  return getFaceTextureMappingTrs(createDefaultFaceTextureMapping(paintId), new THREE.Vector3(0, 1, 0));
}

/**
 * Reads a common mapping across targets when texture id and TRS match.
 * Face-oriented UV matrices differ per normal, so compare decomposed TRS.
 *
 * @param targets Selection targets.
 * @returns Shared mapping (first target), or null when mixed / empty.
 */
export function getCommonMapping(targets: TextureApplyTarget[]): FaceTextureMapping | null {
  if (targets.length === 0) return null;
  const firstTarget = targets[0];
  if (!firstTarget) return null;
  const first = resolveTargetMapping(firstTarget);
  const firstNormal = computeRegionWorldNormal(firstTarget.mesh, firstTarget.triangleIndices);
  const firstTrs = readMappingTrs(first, firstNormal);
  const firstTextureId = first.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  for (let i = 1; i < targets.length; i++) {
    const target = targets[i];
    if (!target) continue;
    const next = resolveTargetMapping(target);
    if ((next.textureId || DEFAULT_CHECKER_TEXTURE_ID) !== firstTextureId) return null;
    const nextNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
    const nextTrs = readMappingTrs(next, nextNormal);
    if (!faceTextureTrsEqual(firstTrs, nextTrs)) return null;
  }
  return first;
}

/** Per-field UV editor state; null means mixed multi-selection for that field. */
export interface UvEditorTrsFieldState {
  scaleU: number | null;
  scaleV: number | null;
  offsetU: number | null;
  offsetV: number | null;
  rotationDeg: number | null;
  align: FaceTextureAlign | null;
  targetCount: number;
}

/**
 * Collects shared TRS field values across targets. Fields that differ are null.
 *
 * @param targets Selection targets.
 * @returns Per-field shared or mixed state.
 */
export function getCommonTrsFieldState(targets: TextureApplyTarget[]): UvEditorTrsFieldState {
  if (targets.length === 0) {
    return {
      scaleU: null,
      scaleV: null,
      offsetU: null,
      offsetV: null,
      rotationDeg: null,
      align: null,
      targetCount: 0,
    };
  }
  const samples = targets.map((target) => {
    const mapping = resolveTargetMapping(target);
    const normal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
    return {
      trs: readMappingTrs(mapping, normal),
      align: mapping.align ?? 'auto',
    };
  });
  const first = samples[0]!;
  return {
    scaleU: sharedNumber(samples.map((sample) => sample.trs.scaleU)),
    scaleV: sharedNumber(samples.map((sample) => sample.trs.scaleV)),
    offsetU: sharedNumber(samples.map((sample) => sample.trs.offsetU)),
    offsetV: sharedNumber(samples.map((sample) => sample.trs.offsetV)),
    rotationDeg: sharedNumber(
      samples.map((sample) => sample.trs.rotationDeg),
      1e-3,
    ),
    align: samples.every((sample) => sample.align === first.align) ? first.align : null,
    targetCount: targets.length,
  };
}

/**
 * Compares two TRS field sets within a small epsilon.
 *
 * @param a First TRS.
 * @param b Second TRS.
 * @returns True when equal.
 */
function faceTextureTrsEqual(a: FaceTextureMappingTrs, b: FaceTextureMappingTrs): boolean {
  return (
    Math.abs(a.scaleU - b.scaleU) < 1e-4 &&
    Math.abs(a.scaleV - b.scaleV) < 1e-4 &&
    Math.abs(a.offsetU - b.offsetU) < 1e-4 &&
    Math.abs(a.offsetV - b.offsetV) < 1e-4 &&
    Math.abs(a.rotationDeg - b.rotationDeg) < 1e-3
  );
}

/**
 * Returns the shared value when all numbers match, otherwise null.
 *
 * @param values Values to compare.
 * @param epsilon Equality tolerance.
 * @returns Shared number or null when mixed.
 */
function sharedNumber(values: number[], epsilon: number = 1e-4): number | null {
  if (values.length === 0) return null;
  const first = values[0]!;
  if (!values.every((value) => Math.abs(value - first) <= epsilon)) return null;
  return first;
}
