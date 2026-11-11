import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

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
 * (or its additive brushes while no result exists).
 *
 * @param worldObject Editor world root.
 * @returns Frame meshes.
 */
export function offscreenCaptureLevelMeshes(worldObject: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const model of SolidModelRegistry.collectUnder(worldObject)) {
    meshes.push(...offscreenCaptureModelMeshes(model));
  }
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
    if (brush.operation !== SolidOperation.Additive) {
      continue;
    }
    if (brush.mesh && offscreenCaptureMeshUsable(brush.mesh)) {
      meshes.push(brush.mesh);
    }
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
  if (!mesh.visible) {
    return false;
  }
  const position = mesh.geometry?.getAttribute('position');
  return !!position && position.count >= 3;
}
