import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

const scratchPoint = new THREE.Vector3();

/**
 * Returns world bounds of a brush's authored vertices.
 *
 * @param instance Brush instance with a mesh.
 * @returns World bounds, or null when the brush has no mesh.
 */
export function modifierBevelBrushWorldBounds(instance: SolidBrushInstance): THREE.Box3 | null {
  const mesh = instance.mesh;
  if (!mesh) return null;
  const bounds = new THREE.Box3();
  for (const vertex of instance.brush.vertices) {
    scratchPoint.copy(vertex).applyMatrix4(mesh.matrixWorld);
    bounds.expandByPoint(scratchPoint);
  }
  return bounds;
}

/**
 * Returns world bounds of a volume's unscaled geometry box.
 *
 * @param volume Bevel volume.
 * @returns World axis-aligned bounds.
 */
export function modifierBevelVolumeWorldBounds(volume: THREE.Object3D): THREE.Box3 {
  const mesh = volume as THREE.Mesh;
  const geometry = mesh.geometry;
  if (geometry && !geometry.boundingBox) geometry.computeBoundingBox();
  const local = geometry?.boundingBox;
  if (!local) return new THREE.Box3().setFromObject(volume);
  return local.clone().applyMatrix4(volume.matrixWorld);
}

/**
 * Returns whether two boxes overlap.
 *
 * @param left First box.
 * @param right Second box.
 * @returns True when the boxes intersect.
 */
export function modifierBevelBoundsOverlap(left: THREE.Box3, right: THREE.Box3): boolean {
  return left.intersectsBox(right);
}
