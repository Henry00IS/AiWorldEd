import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { FaceSelection } from './manager_face_selection.js';
import { buildFacePickRegionKey } from './solid_triangle_source_index.js';
import type { SolidTriangleSourceRef } from './solid_result_face_indices.js';

/**
 * Collects face-selection seeds for an outliner hierarchy object. Solid roots
 * expand to every authored surface on the result mesh; brush rows expand only
 * that brush's surfaces. Free content meshes are ignored (object-mode face
 * select is brush/solid only).
 *
 * @param hierarchyObject Clicked outliner object.
 * @returns Region seeds ready for face selection add/remove.
 */
export function collectFaceSelectionSeedsFromHierarchyObject(hierarchyObject: THREE.Object3D): FaceSelection[] {
  const seeds: FaceSelection[] = [];
  const seenRegionKeys = new Set<string>();
  appendFaceSeedsFromHierarchyObject(hierarchyObject, seeds, seenRegionKeys);
  return seeds;
}

/**
 * Collects face-selection seeds for a viewport face pick. Solid result hits
 * expand to every surface of the owning brush. Free content meshes yield no
 * seeds in object-mode face select.
 *
 * @param mesh Picked mesh.
 * @param faceIndex Picked triangle index.
 * @returns Region seeds for whole-brush selection, or empty for free meshes.
 */
export function collectFaceSelectionSeedsFromFacePick(mesh: THREE.Mesh, faceIndex: number): FaceSelection[] {
  const seeds: FaceSelection[] = [];
  const seenRegionKeys = new Set<string>();
  const sources = readSolidTriangleSources(mesh);
  const brushId = sources?.[faceIndex]?.brushId;
  if (brushId) {
    appendSolidResultSurfaceSeeds(mesh, brushId, seeds, seenRegionKeys);
    return seeds;
  }
  return seeds;
}

/**
 * Appends face seeds for one hierarchy object without descending into solid
 * interiors after a solid root is handled.
 *
 * @param object Hierarchy object to expand.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set of region keys.
 */
function appendFaceSeedsFromHierarchyObject(
  object: THREE.Object3D,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  if (SolidModel.isSolidModelObject(object)) {
    appendSolidRootFaceSeeds(object, seeds, seenRegionKeys);
    return;
  }
  if (SolidBrushVisual.isBrushObject(object)) {
    appendSolidBrushFaceSeeds(object, seeds, seenRegionKeys);
    return;
  }
  if (object instanceof THREE.Mesh) {
    if (SolidModel.isResultMesh(object)) {
      appendSolidResultSurfaceSeeds(object, null, seeds, seenRegionKeys);
    }
    return;
  }
  appendChildHierarchyFaceSeeds(object, seeds, seenRegionKeys);
}

/**
 * Appends every solid result surface under a solid model root.
 *
 * @param solidRoot Solid model root group.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set.
 */
function appendSolidRootFaceSeeds(
  solidRoot: THREE.Object3D,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  const model = SolidModel.fromObject(solidRoot);
  const resultMesh = model?.getResultMesh();
  if (!resultMesh) {
    return;
  }
  appendSolidResultSurfaceSeeds(resultMesh, null, seeds, seenRegionKeys);
}

/**
 * Appends result-mesh face seeds owned by one solid brush preview.
 *
 * @param brushObject Brush preview mesh or object.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set.
 */
function appendSolidBrushFaceSeeds(
  brushObject: THREE.Object3D,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  const brushId = SolidBrushVisual.getBrushId(brushObject);
  if (!brushId) {
    return;
  }
  const model = SolidModel.fromObject(brushObject);
  const resultMesh = model?.getResultMesh();
  if (!resultMesh) {
    return;
  }
  appendSolidResultSurfaceSeeds(resultMesh, brushId, seeds, seenRegionKeys);
}

/**
 * Recurses into group children for nested hierarchy picks.
 *
 * @param group Non-mesh hierarchy group.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set.
 */
function appendChildHierarchyFaceSeeds(
  group: THREE.Object3D,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  for (const child of group.children) {
    appendFaceSeedsFromHierarchyObject(child, seeds, seenRegionKeys);
  }
}

/**
 * Appends one seed per unique solid brush surface on a result mesh.
 *
 * @param resultMesh Solid CSG result mesh.
 * @param brushIdFilter When set, only surfaces for that brush id.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set.
 */
function appendSolidResultSurfaceSeeds(
  resultMesh: THREE.Mesh,
  brushIdFilter: string | null,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  const sources = readSolidTriangleSources(resultMesh);
  if (!sources) {
    return;
  }
  const seenSurfaces = new Set<string>();
  for (let faceIndex = 0; faceIndex < sources.length; faceIndex++) {
    const source = sources[faceIndex];
    if (!source?.brushId || typeof source.surfaceIndex !== 'number') {
      continue;
    }
    if (brushIdFilter && source.brushId !== brushIdFilter) {
      continue;
    }
    const surfaceKey = `${source.brushId}|${source.surfaceIndex}`;
    if (seenSurfaces.has(surfaceKey)) {
      continue;
    }
    seenSurfaces.add(surfaceKey);
    appendUniqueSeed(resultMesh, faceIndex, seeds, seenRegionKeys);
  }
}

/**
 * Pushes a face seed when its region key is new.
 *
 * @param mesh Source mesh.
 * @param faceIndex Triangle index seed.
 * @param seeds Accumulator list.
 * @param seenRegionKeys Deduplication set.
 */
function appendUniqueSeed(
  mesh: THREE.Mesh,
  faceIndex: number,
  seeds: FaceSelection[],
  seenRegionKeys: Set<string>,
): void {
  const regionKey = buildFacePickRegionKey(mesh, faceIndex);
  if (seenRegionKeys.has(regionKey)) {
    return;
  }
  seenRegionKeys.add(regionKey);
  seeds.push({ mesh, faceIndex, regionKey });
}

/**
 * Reads solid triangle source rows from result mesh userData.
 *
 * @param mesh Candidate result mesh.
 * @returns Source rows, or null when missing.
 */
function readSolidTriangleSources(mesh: THREE.Mesh): SolidTriangleSourceRef[] | null {
  const raw = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  return raw as SolidTriangleSourceRef[];
}
