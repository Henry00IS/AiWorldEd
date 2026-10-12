import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { ModifierVolumeBevelRegistry } from '@/modifier/volume/modifier_volume_bevel_registry.js';
import { ModifierBevelAffectedSet } from './modifier_bevel_affected_set.js';
import { modifierBevelVolumesHittingBrush } from './modifier_bevel_compile_list.js';

/**
 * Rebuilds solids touched by a moved or retuned bevel volume.
 *
 * @param objects Objects whose pose just changed.
 * @param sceneRoot Scene root that contains solid models.
 */
export function modifierBevelRefreshIfVolumesMoved(
  objects: readonly THREE.Object3D[],
  sceneRoot: THREE.Object3D,
): void {
  if (!objects.some((object) => ModifierVolumeBevel.isVolume(object))) return;
  modifierBevelRefreshScene(sceneRoot);
}

/**
 * Marks brushes that meet a volume, or recently did, dirty and rebuilds them.
 *
 * @param sceneRoot Scene root.
 */
export function modifierBevelRefreshScene(sceneRoot: THREE.Object3D): void {
  sceneRoot.updateMatrixWorld(true);
  const volumes = ModifierVolumeBevelRegistry.attachedTo(sceneRoot);
  for (const volume of volumes) volume.updateMatrixWorld(true);
  for (const model of SolidModelRegistry.collectUnder(sceneRoot)) {
    modifierBevelRefreshModel(model.root.uuid, model, volumes);
  }
}

/**
 * Rebuilds one solid's overlapping brushes.
 *
 * @param scopeId Solid identity.
 * @param model Solid model.
 * @param volumes Live volumes.
 */
function modifierBevelRefreshModel(scopeId: string, model: SolidModel, volumes: THREE.Object3D[]): void {
  const next = new Set<string>();
  for (const brush of model.getBrushes()) {
    if (modifierBevelVolumesHittingBrush(brush, volumes).length > 0) next.add(brush.id);
  }
  const ids = ModifierBevelAffectedSet.union(scopeId, next);
  if (ids.length === 0) return;
  model.markBrushesDirty(ids);
  model.rebuild();
}
