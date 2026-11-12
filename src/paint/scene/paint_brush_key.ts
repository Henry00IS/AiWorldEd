import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/**
 * Returns the atlas key of a brush. Brush ids are only unique inside one model,
 * so the key also names the model.
 *
 * @param model Owning model.
 * @param brush Brush.
 * @returns Key.
 */
export function paintBrushKey(model: SolidModel, brush: SolidBrushInstance): string {
  return `${model.root.uuid}/${brush.id}`;
}

/**
 * Returns the transform from world space to a brush's local space, where its
 * paint dabs live.
 *
 * @param model Owning model.
 * @param brush Brush.
 * @param target Receives the transform.
 * @returns The target.
 */
export function paintWorldToBrush(model: SolidModel, brush: SolidBrushInstance, target: THREE.Matrix4): THREE.Matrix4 {
  if (brush.mesh !== null) {
    brush.mesh.updateWorldMatrix(true, false);
    return target.copy(brush.mesh.matrixWorld).invert();
  }
  model.root.updateWorldMatrix(true, false);
  return target.multiplyMatrices(model.root.matrixWorld, brush.getModelSpaceMatrix()).invert();
}
