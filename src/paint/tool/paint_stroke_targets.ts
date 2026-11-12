import * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { paintBrushKey, paintWorldToBrush } from '@/paint/scene/paint_brush_key.js';
import { paintCopyTargets } from '@/paint/scene/paint_copy_targets.js';
import { paintCopyKey, paintCopyToWorld } from '@/paint/scene/paint_scene_system.js';
import type { PaintStrokeTarget } from './paint_stroke_builder.js';

/** A stroke target with the brush its records are stored on. */
export interface PaintStrokeBrushTarget extends PaintStrokeTarget {
  /** Owning model. */
  readonly model: SolidModel;
  /** Brush that receives the records: the authored brush, also for its copies. */
  readonly brush: SolidBrushInstance;
}

/**
 * Lists every surface a stroke can land on: each visible authored brush, and
 * each array or mirror copy of one. A copy maps the world into its authored
 * brush's local space, so what is drawn on a copy is stored on the authored
 * brush and shows on the original and every copy.
 *
 * @param world World root.
 * @param shown Returns whether a model's result is shown; defaults to true.
 * @returns Targets.
 */
export function paintStrokeTargets(
  world: THREE.Object3D,
  shown: (model: SolidModel) => boolean = () => true,
): PaintStrokeBrushTarget[] {
  const targets: PaintStrokeBrushTarget[] = [];
  for (const model of SolidModelRegistry.collectUnder(world)) {
    if (!shown(model)) continue;
    for (const brush of model.getBrushes()) {
      const target = paintStrokeBrushTarget(model, brush);
      if (target !== null) targets.push(target);
    }
    for (const copy of paintCopyTargets(model)) {
      const mesh = copy.source.mesh;
      if (mesh !== null && !mesh.visible) continue;
      const toWorld = paintCopyToWorld(model, copy);
      const worldBounds = new THREE.Box3().setFromPoints(copy.source.brush.vertices).applyMatrix4(toWorld);
      if (worldBounds.isEmpty()) continue;
      targets.push({
        key: paintCopyKey(model, copy),
        worldToLocal: toWorld.clone().invert(),
        worldBounds,
        order: copy.source.paint.nextOrder(),
        model,
        brush: copy.source,
      });
    }
  }
  return targets;
}

/**
 * Describes an authored brush as a stroke target.
 *
 * @param model Model.
 * @param brush Brush.
 * @returns Target, or null when the brush is hidden or has no bounds.
 */
function paintStrokeBrushTarget(model: SolidModel, brush: SolidBrushInstance): PaintStrokeBrushTarget | null {
  const mesh = brush.mesh;
  if (mesh !== null && !mesh.visible) return null;
  const worldBounds = new THREE.Box3();
  if (mesh !== null) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (box === null || box.isEmpty()) return null;
    mesh.updateWorldMatrix(true, false);
    worldBounds.copy(box).applyMatrix4(mesh.matrixWorld);
  } else {
    model.root.updateWorldMatrix(true, false);
    worldBounds.copy(brush.getModelSpaceBounds()).applyMatrix4(model.root.matrixWorld);
  }
  return {
    key: paintBrushKey(model, brush),
    worldToLocal: paintWorldToBrush(model, brush, new THREE.Matrix4()),
    worldBounds,
    order: brush.paint.nextOrder(),
    model,
    brush,
  };
}
