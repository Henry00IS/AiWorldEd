import type * as THREE from 'three';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { modifierStackCacheOf } from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';

/**
 * Step limits of the scripts being stepped through, by generator node uuid and
 * modifier id. They only change what this editor shows: they are never saved,
 * undone or sent to other users.
 */
const solidScriptDebugStepLimits = new Map<string, number>();

/**
 * Returns the key of one generator modifier.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @returns Map key.
 */
function solidScriptDebugStepKey(node: THREE.Object3D, stepId: string): string {
  return `${node.uuid}:${stepId}`;
}

/**
 * Returns how many primitive steps a generator builds while it is stepped
 * through.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @returns Step limit, or undefined to build the whole script.
 */
export function solidScriptDebugStepLimit(node: THREE.Object3D, stepId: string): number | undefined {
  return solidScriptDebugStepLimits.get(solidScriptDebugStepKey(node, stepId));
}

/**
 * Holds a generator at a step, or releases it, and rebuilds the scene so the
 * viewports show the result so far.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @param limit Steps to build, or null to build the whole script.
 */
export function solidScriptDebugStepLimitSet(node: THREE.Object3D, stepId: string, limit: number | null): void {
  const key = solidScriptDebugStepKey(node, stepId);
  if (limit === null) solidScriptDebugStepLimits.delete(key);
  else solidScriptDebugStepLimits.set(key, Math.max(0, Math.floor(limit)));
  for (let solid = node.parent; solid; solid = solid.parent)
    if (isSolidModelObject(solid)) modifierStackCacheOf(solid).delete(node.uuid);
  if (node.parent) modifierBevelRefreshScene(modifierVolumeSceneRoot(node));
}
