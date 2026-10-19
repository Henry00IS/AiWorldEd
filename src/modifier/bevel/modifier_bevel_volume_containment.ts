import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

const scratchPoint = new THREE.Vector3();
const scratchInverse = new THREE.Matrix4();

/**
 * Returns whether every brush vertex lies inside every volume.
 *
 * @param instance Authored brush.
 * @param volumes Volumes already known to overlap the brush bounds.
 * @returns True when the brush is wholly inside each volume.
 */
export function modifierBevelVolumesFullyContainBrush(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
): boolean {
  return volumes.every((volume) => modifierBevelBrushFitsInVolume(instance, volume));
}

/**
 * Returns whether every brush vertex lies inside one volume's oriented box.
 *
 * @param instance Authored brush.
 * @param volume Bevel volume.
 * @returns True when the brush does not cross the volume boundary.
 */
function modifierBevelBrushFitsInVolume(instance: SolidBrushInstance, volume: THREE.Object3D): boolean {
  const mesh = instance.mesh;
  const localBox = modifierBevelVolumeLocalBox(volume);
  if (!mesh || !localBox) return false;
  scratchInverse.copy(volume.matrixWorld).invert();
  for (const vertex of instance.brush.vertices) {
    scratchPoint.copy(vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(scratchInverse);
    if (!localBox.containsPoint(scratchPoint)) return false;
  }
  return true;
}

/**
 * Returns the volume geometry's local box, matching the edge test.
 *
 * @param volume Bevel volume.
 * @returns Local box, or null when the volume has no geometry bounds.
 */
function modifierBevelVolumeLocalBox(volume: THREE.Object3D): THREE.Box3 | null {
  const geometry = (volume as THREE.Mesh).geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox;
}
