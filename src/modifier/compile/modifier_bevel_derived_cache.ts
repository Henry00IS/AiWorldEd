import type * as THREE from 'three';
import { BrushShapeFingerprint } from '@/solid/algorithm/spatial/brush_shape_fingerprint.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';

/** Cached chamfer for one brush. */
interface ModifierBevelCacheEntry {
  key: string;
  derived: ModifierBevelDerivedBrush;
}

const cache = new Map<string, ModifierBevelCacheEntry>();

/**
 * Returns a chamfered brush, reusing the previous one when inputs match.
 *
 * @param instance Authored brush.
 * @param volumes Overlapping-candidate volumes.
 * @returns Derived brush and whether it was rebuilt, or null when no edge is
 *   cut.
 */
export function modifierBevelDerivedFromCache(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
): { derived: ModifierBevelDerivedBrush; rebuilt: boolean } | null {
  const key = modifierBevelCacheKey(instance, volumes);
  const cached = cache.get(instance.id);
  if (cached && cached.key === key) return { derived: cached.derived, rebuilt: false };
  const derived = modifierBevelDeriveBrush(instance, volumes);
  if (!derived) {
    cache.delete(instance.id);
    return null;
  }
  cache.set(instance.id, { key, derived });
  return { derived, rebuilt: true };
}

/**
 * Builds a cache key from brush shape, world pose, and volume pose.
 *
 * @param instance Authored brush.
 * @param volumes Bevel volumes.
 * @returns Key string.
 */
function modifierBevelCacheKey(instance: SolidBrushInstance, volumes: readonly THREE.Object3D[]): string {
  const shape = BrushShapeFingerprint.fromBrush(instance.brush);
  const pose = modifierBevelMatrixKey(instance.mesh?.matrixWorld);
  const volumeKey = volumes.map(modifierBevelVolumeKey).join(';');
  return `${shape}|${pose}|${volumeKey}`;
}

/**
 * Formats a volume's identity, distance, and world pose.
 *
 * @param volume Bevel volume.
 * @returns Key fragment.
 */
function modifierBevelVolumeKey(volume: THREE.Object3D): string {
  const settings = ModifierVolumeBevel.readSettings(volume);
  return `${volume.uuid}:${settings.distance}:${settings.segments}:${settings.angleDegrees}:${modifierBevelMatrixKey(volume.matrixWorld)}`;
}

/**
 * Formats a matrix for a cache key.
 *
 * @param matrix Matrix, or undefined.
 * @returns Compact element string.
 */
function modifierBevelMatrixKey(matrix: THREE.Matrix4 | undefined): string {
  if (!matrix) return '';
  return matrix.elements.map((value) => value.toFixed(4)).join(',');
}
