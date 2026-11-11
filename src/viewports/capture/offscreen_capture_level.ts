import * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

/**
 * Collects meshes used to frame one solid model (prefer CSG result).
 *
 * @param model Solid model.
 * @returns Frame meshes.
 */
export function offscreenCaptureModelMeshes(model: SolidModel): THREE.Mesh[] {
  model.root.updateMatrixWorld(true);
  const result = model.getResultMesh();
  if (result && offscreenCaptureMeshUsable(result) && isResultMesh(result)) {
    return [result];
  }
  return collectAdditiveBrushMeshes(model);
}

/**
 * Collects the meshes that frame a whole level: every solid model's CSG result
 * (or its additive brushes while no result exists), plus primitive meshes and
 * imported models that are not part of a solid.
 *
 * @param worldObject Editor world root.
 * @returns Frame meshes.
 */
export function offscreenCaptureLevelMeshes(worldObject: THREE.Object3D): THREE.Mesh[] {
  const models = [...SolidModelRegistry.collectUnder(worldObject)];
  const roots = new Set(models.map((model) => model.root));
  const meshes: THREE.Mesh[] = [];
  for (const model of models) meshes.push(...offscreenCaptureModelMeshes(model));
  worldObject.traverse((object) => {
    if (offscreenCaptureWorldContentMeshIs(object, roots)) meshes.push(object);
  });
  return meshes;
}

/**
 * Collects additive brush meshes for a model (fallback framing).
 *
 * @param model Solid model.
 * @returns Additive brush meshes.
 */
function collectAdditiveBrushMeshes(model: SolidModel): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const brush of model.getBrushes()) {
    if (brush.operation !== SolidOperation.Additive) continue;
    if (brush.mesh && offscreenCaptureMeshUsable(brush.mesh)) meshes.push(brush.mesh);
  }
  return meshes;
}

/**
 * Returns whether a mesh has enough geometry for setFromObject framing.
 *
 * @param mesh Candidate mesh.
 * @returns True when fit-usable.
 */
export function offscreenCaptureMeshUsable(mesh: THREE.Mesh): boolean {
  if (!mesh.visible) return false;
  const position = mesh.geometry?.getAttribute('position');
  return !!position && position.count >= 3;
}

/**
 * Returns whether an object is a visible content mesh outside any solid model
 * and outside editor overlays.
 *
 * @param object Scene object.
 * @param roots Solid model roots already framed.
 * @returns True when the object should be framed as world content.
 */
function offscreenCaptureWorldContentMeshIs(
  object: THREE.Object3D,
  roots: ReadonlySet<THREE.Object3D>,
): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh)) return false;
  if (!offscreenCaptureMeshUsable(object)) return false;
  if (isEditorHelperObject(object)) return false;
  if (offscreenCaptureOverlayAncestorHas(object)) return false;
  return !offscreenCaptureSolidAncestorHas(object, roots);
}

/**
 * Returns whether an object hangs under one of the listed solid models.
 *
 * @param object Scene object.
 * @param roots Solid model roots.
 * @returns True when an ancestor is a solid model root.
 */
function offscreenCaptureSolidAncestorHas(object: THREE.Object3D, roots: ReadonlySet<THREE.Object3D>): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (roots.has(current)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Returns whether an object hangs under a gizmo, grid, or helper root.
 *
 * @param object Scene object.
 * @returns True when an ancestor is an editor overlay root.
 */
function offscreenCaptureOverlayAncestorHas(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (offscreenCaptureOverlayRootIs(current.name || '')) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Matches known editor overlay root names that must not drive framing.
 *
 * @param name Object name.
 * @returns True for helper, gizmo, and grid roots.
 */
function offscreenCaptureOverlayRootIs(name: string): boolean {
  if (name === 'shared_helpers_root' || name === 'grids_root' || name === 'gizmo_bounds') return true;
  if (name === 'infinite_grid_2d' || name === 'infinite_grid_3d') return true;
  return name === 'gizmo_transform' || name.startsWith('gizmo_transform');
}
