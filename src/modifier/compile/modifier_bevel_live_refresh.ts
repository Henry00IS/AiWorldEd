import type * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { ModifierVolume, modifierVolumesAll } from '@/modifier/stack/modifier_volume.js';
import { modifierBevelRefreshScene } from './modifier_bevel_scene_refresh.js';
import { modifierBevelVolumePosesChanged } from './modifier_bevel_volume_pose.js';

/**
 * Returns whether a transform selection moves a generator node or modifier
 * volume, itself or under a moved container.
 *
 * @param objects Objects being transformed.
 * @returns True when some modifier node moves with the selection.
 */
export function modifierBevelLiveSelectionMovesVolumes(objects: readonly THREE.Object3D[]): boolean {
  return objects.some((object) => ModifierVolume.isVolume(object) || modifierVolumesAll(object).length > 0);
}

/**
 * Re-evaluates the scene's generator nodes and modifier volumes during a live
 * drag when any of them has a new pose or box since the last evaluation, so
 * their pieces follow every frame like dragged brushes.
 *
 * @param sceneRoot Scene root.
 * @returns Result meshes of the solids that were re-evaluated; empty when
 *   nothing moved.
 */
export function modifierBevelLiveRefreshIfVolumesPosed(sceneRoot: THREE.Object3D): THREE.Mesh[] {
  sceneRoot.updateMatrixWorld(true);
  if (!modifierBevelVolumePosesChanged(sceneRoot, modifierVolumesAll(sceneRoot))) return [];
  modifierBevelRefreshScene(sceneRoot);
  return [...SolidModelRegistry.collectUnder(sceneRoot)].map((model) => model.getResultMeshForSync());
}
