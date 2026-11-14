import * as THREE from 'three';
import { snapWorldPointUnoccluded } from './snap_query_occlusion.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/**
 * Returns whether an object or one of its ancestors is an excluded transform
 * root.
 *
 * @param object Scene object.
 * @param excludedRootIds Uuids of roots that must not be snap targets.
 * @returns True when the object should be skipped as a target.
 */
export function snapObjectIsExcluded(object: THREE.Object3D, excludedRootIds: ReadonlySet<string>): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (excludedRootIds.has(current.uuid)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Returns whether an object and its ancestors are visible.
 *
 * @param object Scene object.
 * @returns True when the object can be seen.
 */
export function snapObjectIsShown(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

/**
 * Returns whether a mesh blocks snap targets behind it.
 *
 * @param object Scene object.
 * @returns True for content meshes and solid result meshes.
 */
export function snapObjectIsOccluder(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh)) {
    return false;
  }
  if (SolidBrushVisual.isBrushObject(object)) {
    return false;
  }
  if (isResultMesh(object)) {
    return true;
  }
  return !SolidBrushVisual.shouldSkipFacePick(object);
}

/**
 * Drops hits that sit behind a closer surface. Result-mesh triangles of moving
 * brushes do not count as closer surfaces.
 *
 * @param hits Candidate hits.
 * @param camera Camera.
 * @param occluders Meshes that block hidden points.
 * @param movingOwnerIds Brush ids whose result triangles never hide a hit.
 * @returns Hits that remain visible.
 */
export function filterVisibleSnapHits(
  hits: readonly SnapHit[],
  camera: THREE.Camera,
  occluders: readonly THREE.Mesh[],
  movingOwnerIds: ReadonlySet<string> = new Set(),
): SnapHit[] {
  const visible: SnapHit[] = [];
  for (const hit of hits) {
    if (snapWorldPointUnoccluded(hit.point, camera, occluders, movingOwnerIds)) {
      visible.push(hit);
    }
  }
  return visible;
}
