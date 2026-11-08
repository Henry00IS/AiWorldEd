import type * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import {
  ModifierVolume,
  modifierVolumeSceneRoot,
  modifierVolumesActive,
  modifierStackNodesActive,
  modifierVolumesAll,
} from '@/modifier/stack/modifier_volume.js';
import { modifierStackBrushTouches } from '@/modifier/stack/evaluate/modifier_stack_capture.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusReset } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';
import { modifierStackMirrorGuideRefresh } from '@/modifier/stack/kinds/array/modifier_stack_mirror_guide.js';
import { ModifierBevelAffectedSet } from './modifier_bevel_affected_set.js';
import { modifierBevelRememberVolumePoses, modifierBevelVolumePosesChanged } from './modifier_bevel_volume_pose.js';

/**
 * Rebuilds solids touched by a moved or retuned modifier volume.
 *
 * @param objects Objects whose pose just changed.
 * @param sceneRoot Scene root that contains solid models.
 */
export function modifierBevelRefreshIfVolumesMoved(
  objects: readonly THREE.Object3D[],
  sceneRoot: THREE.Object3D,
): void {
  if (!objects.some((object) => ModifierVolume.isVolume(object) || object.children.length > 0)) return;
  modifierBevelRefreshScene(sceneRoot);
}

/**
 * Re-evaluates every modifier volume: solids with derived output rebuild in
 * full, others rebuild the brushes that meet a volume or recently did.
 *
 * @param sceneRoot Scene root.
 */
export function modifierBevelRefreshScene(sceneRoot: THREE.Object3D): void {
  sceneRoot.updateMatrixWorld(true);
  const all = modifierVolumesAll(sceneRoot);
  for (const volume of all) modifierStackStatusReset(volume);
  modifierBevelRememberVolumePoses(sceneRoot, all);
  const active = modifierVolumesActive(sceneRoot);
  const derives = modifierStackNodesActive(sceneRoot).some(modifierBevelVolumeDerives);
  for (const model of SolidModelRegistry.collectUnder(sceneRoot)) modifierBevelRefreshModel(model, active, derives);
  modifierStackMirrorGuideRefresh(all);
}

/**
 * Rebuilds after an object was shown or hidden, when the scene has modifier
 * volumes: a hidden volume (or one under a hidden group) stops acting, and a
 * hidden captured brush or cap stops being copied.
 *
 * @param object Object whose visibility changed.
 */
export function modifierBevelRefreshAfterVisibility(object: THREE.Object3D): void {
  const sceneRoot = modifierVolumeSceneRoot(object);
  if (modifierVolumesAll(sceneRoot).length === 0) return;
  modifierBevelRefreshScene(sceneRoot);
}

/**
 * Rebuilds when undo or redo moved or retuned a modifier volume.
 *
 * @param sceneRoot Scene root.
 */
export function modifierBevelRefreshAfterHistory(sceneRoot: THREE.Object3D): void {
  sceneRoot.updateMatrixWorld(true);
  if (!modifierBevelVolumePosesChanged(sceneRoot, modifierVolumesAll(sceneRoot))) return;
  modifierBevelRefreshScene(sceneRoot);
}

/**
 * Returns whether a volume runs any modifier that produces new brushes.
 *
 * @param volume Active modifier volume.
 * @returns True when a non-bevel modifier is enabled.
 */
function modifierBevelVolumeDerives(volume: THREE.Object3D): boolean {
  return ModifierVolume.read(volume).modifiers.some((step) => step.enabled && step.kind !== MODIFIER_STACK_KIND_BEVEL);
}

/**
 * Rebuilds one solid incrementally: authored brushes a volume touches now or
 * touched before become dirty seeds, and the rebuild pipeline adds only the
 * derived brushes whose volume was re-evaluated.
 *
 * @param model Solid model.
 * @param volumes Active volumes.
 * @param derives True when some volume produces derived brushes.
 */
function modifierBevelRefreshModel(model: SolidModel, volumes: readonly THREE.Object3D[], derives: boolean): void {
  const next = new Set<string>();
  for (const brush of model.getBrushes())
    if (volumes.some((volume) => modifierStackBrushTouches(brush, volume))) next.add(brush.id);
  const ids = ModifierBevelAffectedSet.union(model.root.uuid, next);
  if (ids.length === 0 && !derives && !modifierStackDerivedByRoot.has(model.root)) return;
  model.markBrushesDirty(ids);
  model.rebuild();
}
