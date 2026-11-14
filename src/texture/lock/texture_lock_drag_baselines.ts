import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Records the pre-drag pose of every solid brush a drag is about to move, so
 * Pos Lock and Stretch Lock measure the whole drag from where it started. CSG
 * groups in the selection contribute the brushes they hold.
 *
 * @param selectedObjects Objects the drag is about to transform.
 */
export function textureLockDragBaselinesBegin(selectedObjects: readonly THREE.Object3D[]): void {
  for (const [model, objects] of groupObjectsBySolidModel(selectedObjects)) {
    model.textureLockBaselinesBegin(objects);
  }
}

/**
 * Groups objects by the solid model that owns them; objects outside any solid
 * are left out.
 *
 * @param objects Candidate objects.
 * @returns Objects per owning solid model.
 */
function groupObjectsBySolidModel(objects: readonly THREE.Object3D[]): Map<SolidModel, THREE.Object3D[]> {
  const byModel = new Map<SolidModel, THREE.Object3D[]>();
  for (const object of objects) {
    const model = SolidModel.fromObject(object);
    if (!model) continue;
    const list = byModel.get(model) ?? [];
    list.push(object);
    byModel.set(model, list);
  }
  return byModel;
}
