import * as THREE from 'three';
import { BrushShapeFingerprint } from '@/solid/algorithm/spatial/brush_shape_fingerprint.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelVolumesFullyContainBrush } from '@/modifier/bevel/modifier_bevel_volume_containment.js';

const scratchScale = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

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
 * Builds a cache key from the brush shape and the volumes that cut it.
 *
 * @param instance Authored brush.
 * @param volumes Bevel volumes.
 * @returns Key string.
 */
function modifierBevelCacheKey(instance: SolidBrushInstance, volumes: readonly THREE.Object3D[]): string {
  const shape = BrushShapeFingerprint.fromBrush(instance.brush);
  const ordered = modifierBevelVolumesInOrder(volumes);
  if (modifierBevelVolumesFullyContainBrush(instance, ordered)) {
    const pose = modifierBevelContainedPoseKey(instance.mesh?.matrixWorld, ordered);
    return `${shape}|${pose}|${ordered.map(modifierBevelVolumeSettingsKey).join(';')}`;
  }
  const pose = modifierBevelMatrixKey(instance.mesh?.matrixWorld);
  return `${shape}|${pose}|${ordered.map(modifierBevelVolumeKey).join(';')}`;
}

/**
 * Copies volumes in a stable identity order.
 *
 * @param volumes Bevel volumes.
 * @returns Volumes sorted by id.
 */
function modifierBevelVolumesInOrder(volumes: readonly THREE.Object3D[]): THREE.Object3D[] {
  return [...volumes].sort((left, right) => left.uuid.localeCompare(right.uuid));
}

/**
 * Formats the world scale of a matrix.
 *
 * @param matrix Matrix, or undefined.
 * @returns Compact scale string.
 */
function modifierBevelScaleKey(matrix: THREE.Matrix4 | undefined): string {
  if (!matrix) return '';
  scratchScale.setFromMatrixScale(matrix);
  return `${scratchScale.x.toFixed(4)},${scratchScale.y.toFixed(4)},${scratchScale.z.toFixed(4)}`;
}

/**
 * Returns the scale key, plus rotation when world-axis flow or a mirror needs
 * it.
 *
 * @param matrix Brush world matrix.
 * @param volumes Covering bevel volumes.
 * @returns Pose fragment.
 */
function modifierBevelContainedPoseKey(matrix: THREE.Matrix4 | undefined, volumes: readonly THREE.Object3D[]): string {
  const scale = modifierBevelScaleKey(matrix);
  if (!modifierBevelOrientationAffectsParents(matrix, volumes)) return scale;
  return `${scale}|${modifierBevelRotationKey(matrix)}`;
}

/**
 * Returns whether a covered brush must rebuild after it turns or mirrors.
 *
 * @param matrix Brush world matrix.
 * @param volumes Covering bevel volumes.
 * @returns True when a world-axis flow or a mirror is active.
 */
function modifierBevelOrientationAffectsParents(
  matrix: THREE.Matrix4 | undefined,
  volumes: readonly THREE.Object3D[],
): boolean {
  if (matrix && matrix.determinant() < 0) return true;
  return volumes.some((volume) => modifierBevelFlowUsesWorldAxis(volume));
}

/**
 * Returns whether a volume's flow follows a fixed world axis.
 *
 * @param volume Bevel volume.
 * @returns True for the six axis flows when UV space is world.
 */
function modifierBevelFlowUsesWorldAxis(volume: THREE.Object3D): boolean {
  const settings = ModifierVolumeBevel.readSettings(volume);
  if (settings.uvSpace === MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL) return false;
  const flow = settings.uvFlow;
  return flow.startsWith('positive-') || flow.startsWith('negative-');
}

/**
 * Formats the rotation stored in a matrix.
 *
 * @param matrix Brush world matrix.
 * @returns Compact quaternion.
 */
function modifierBevelRotationKey(matrix: THREE.Matrix4 | undefined): string {
  if (!matrix) return '';
  matrix.decompose(scratchPosition, scratchQuaternion, scratchScale);
  const rotation = scratchQuaternion;
  return `${rotation.x.toFixed(4)},${rotation.y.toFixed(4)},${rotation.z.toFixed(4)},${rotation.w.toFixed(4)}`;
}

/**
 * Formats a volume's identity and settings, without its pose.
 *
 * @param volume Bevel volume.
 * @returns Key fragment.
 */
function modifierBevelVolumeSettingsKey(volume: THREE.Object3D): string {
  const settings = ModifierVolumeBevel.readSettings(volume);
  const ignored = settings.blacklist.join(',');
  const placement = `${settings.uvScaleU}:${settings.uvScaleV}:${settings.uvOffsetU}:${settings.uvOffsetV}:${settings.uvRotation}:${settings.uvOwner}:${settings.uvPivot}:${settings.uvSpace}`;
  const style = `${settings.uvFlow}:${settings.uvLayout}:${settings.textureId}:${ignored}:${placement}`;
  const shape = `${settings.distance}:${settings.segments}:${settings.angleDegrees}`;
  return `${volume.uuid}:${shape}:${style}`;
}

/**
 * Formats a volume's identity, distance, and world pose.
 *
 * @param volume Bevel volume.
 * @returns Key fragment.
 */
function modifierBevelVolumeKey(volume: THREE.Object3D): string {
  return `${modifierBevelVolumeSettingsKey(volume)}:${modifierBevelMatrixKey(volume.matrixWorld)}`;
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
