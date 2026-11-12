import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  modifierStackCopySourceMatrix,
  modifierStackSourceIdOf,
} from '@/modifier/stack/evaluate/modifier_stack_copy.js';

/**
 * A copy that an array or mirror volume made of an authored brush. Its faces
 * are the authored faces moved by `sourceToModel`, so paint is rasterized in
 * the authored brush's local space and drawn on the copy through that matrix.
 */
export interface PaintCopyTarget {
  /** Derived brush id, as named by the result's triangle sources. */
  readonly id: string;
  /** Authored brush the copy was made from. */
  readonly source: SolidBrushInstance;
  /** Maps authored-local space to model space for this copy. */
  readonly sourceToModel: THREE.Matrix4;
}

/**
 * Lists the rigid and reflected copies of a model's last compile whose faces
 * still match their authored brush. Copies of reshaped brushes are left out.
 *
 * @param model Model.
 * @returns Copy targets in compile order.
 */
export function paintCopyTargets(model: SolidModel): PaintCopyTarget[] {
  const derived = modifierStackDerivedByRoot.get(model.root);
  if (derived === undefined) return [];
  const targets: PaintCopyTarget[] = [];
  for (const [id, copy] of derived) {
    const sourceToModel = modifierStackCopySourceMatrix(copy);
    const sourceId = modifierStackSourceIdOf(copy);
    if (sourceToModel === null || sourceId === null) continue;
    const source = model.findBrush(sourceId);
    if (source === undefined || source.brush.faces.length !== copy.brush.faces.length) continue;
    targets.push({ id, source, sourceToModel });
  }
  return targets;
}
