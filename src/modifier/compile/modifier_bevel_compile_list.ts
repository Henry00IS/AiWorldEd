import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelCreateStandIn } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import {
  modifierBevelBoundsOverlap,
  modifierBevelBrushWorldBounds,
  modifierBevelVolumeWorldBounds,
} from '@/modifier/bevel/modifier_bevel_world_bounds.js';
import { ModifierVolumeBevelRegistry } from '@/modifier/volume/modifier_volume_bevel_registry.js';
import { ModifierBevelAffectedSet } from './modifier_bevel_affected_set.js';
import { modifierBevelDerivedFromCache } from './modifier_bevel_derived_cache.js';
import { ModifierBevelSurfaceOverlay } from './modifier_bevel_surface_overlay.js';

/** Brush list handed to the existing CSG compiler. */
export interface ModifierBevelCompileListResult {
  /** Instances to compile. Same reference as the input when no volume applies. */
  instances: SolidBrushInstance[];
  /** Brushes whose prepared geometry must refresh. */
  extraDirtyBrushIds: string[];
}

/**
 * Substitutes chamfered stand-ins for brushes that meet a bevel volume. When no
 * volume exists, returns the input list unchanged.
 *
 * @param instances Authored evaluation list.
 * @param scopeId Solid model identity used to track which brushes were
 *   chamfered.
 * @param anchor Object whose scene root owns the volumes. Null skips volumes.
 * @returns Compile list and extra dirty brush ids.
 */
export function modifierBevelCompileListBuild(
  instances: readonly SolidBrushInstance[],
  scopeId: string,
  anchor: THREE.Object3D | null = null,
): ModifierBevelCompileListResult {
  const volumes = anchor ? ModifierVolumeBevelRegistry.attachedTo(sceneRootOf(anchor)) : [];
  if (volumes.length === 0) return modifierBevelCompileListClear(instances, scopeId);
  for (const volume of volumes) volume.updateMatrixWorld(true);
  return modifierBevelCompileListApply(instances, volumes, scopeId);
}

/**
 * Clears chamfers for one solid when every volume is gone.
 *
 * @param instances Authored instances.
 * @param scopeId Solid model identity.
 * @returns Original list plus brushes that must drop a chamfer.
 */
function modifierBevelCompileListClear(
  instances: readonly SolidBrushInstance[],
  scopeId: string,
): ModifierBevelCompileListResult {
  const changed = ModifierBevelAffectedSet.replace(scopeId, new Set());
  for (const id of changed) ModifierBevelSurfaceOverlay.clear(id);
  return { instances: instances as SolidBrushInstance[], extraDirtyBrushIds: changed };
}

/**
 * Applies volumes to overlapping brushes.
 *
 * @param instances Authored instances.
 * @param volumes Live volumes.
 * @param scopeId Solid model identity.
 * @returns Compile list.
 */
function modifierBevelCompileListApply(
  instances: readonly SolidBrushInstance[],
  volumes: THREE.Object3D[],
  scopeId: string,
): ModifierBevelCompileListResult {
  const next = new Set<string>();
  const rebuilt: string[] = [];
  const output: SolidBrushInstance[] = [];
  let replaced = false;
  for (const instance of instances) {
    const slot = modifierBevelCompileSlot(instance, volumes, next, rebuilt);
    if (slot !== instance) replaced = true;
    output.push(slot);
  }
  const changed = ModifierBevelAffectedSet.replace(scopeId, next);
  return {
    instances: replaced ? output : (instances as SolidBrushInstance[]),
    extraDirtyBrushIds: changed.concat(rebuilt),
  };
}

/**
 * Returns a stand-in or the original instance for one brush.
 *
 * @param instance Authored instance.
 * @param volumes Live volumes.
 * @param next Brushes that received a chamfer.
 * @param rebuilt Brushes whose chamfer was recomputed.
 * @returns Instance to compile.
 */
function modifierBevelCompileSlot(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
  next: Set<string>,
  rebuilt: string[],
): SolidBrushInstance {
  const hitting = modifierBevelVolumesHittingBrush(instance, volumes);
  if (hitting.length === 0) {
    ModifierBevelSurfaceOverlay.clear(instance.id);
    return instance;
  }
  const cached = modifierBevelDerivedFromCache(instance, hitting);
  if (!cached) {
    ModifierBevelSurfaceOverlay.clear(instance.id);
    return instance;
  }
  next.add(instance.id);
  if (cached.rebuilt) rebuilt.push(instance.id);
  ModifierBevelSurfaceOverlay.set(instance.id, cached.derived);
  return modifierBevelCreateStandIn(instance, cached.derived);
}

/**
 * Returns volumes whose world bounds meet the brush.
 *
 * @param instance Authored brush.
 * @param volumes Live volumes.
 * @returns Overlapping volumes.
 */
export function modifierBevelVolumesHittingBrush(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
): THREE.Object3D[] {
  const bounds = modifierBevelBrushWorldBounds(instance);
  if (!bounds) return [];
  return volumes.filter((volume) => {
    if (!volume.visible) return false;
    return modifierBevelBoundsOverlap(bounds, modifierBevelVolumeWorldBounds(volume));
  });
}

/**
 * Walks to the top of a parent chain.
 *
 * @param object Start object.
 * @returns Root object.
 */
function sceneRootOf(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) current = current.parent;
  return current;
}
