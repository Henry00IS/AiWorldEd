import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { SnapAlignHost } from './snap_align_host.js';

/**
 * Collects brush preview meshes under the objects whose pose changed.
 *
 * @param roots Transformed objects.
 * @returns Brush preview meshes.
 */
export function collectBrushPreviewMeshes(roots: readonly THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const root of roots) {
    appendBrushMeshes(root, meshes);
  }
  return meshes;
}

/**
 * Asks the solid pipeline to follow or finalize brush poses.
 *
 * @param host Align host.
 * @param roots Transformed objects.
 * @param phase Live preview or committed pose.
 */
export function publishSnapAlignBrushPoses(
  host: SnapAlignHost,
  roots: readonly THREE.Object3D[],
  phase: 'live' | 'commit',
): void {
  const meshes = collectBrushPreviewMeshes(roots);
  if (meshes.length === 0) {
    return;
  }
  if (phase === 'live') {
    host.notifySolidTransformsLive(meshes);
    return;
  }
  host.notifySolidTransformsCommitted(meshes);
}

/**
 * Appends a brush preview mesh, or the brush previews under a group.
 *
 * @param object Scene object.
 * @param meshes Output list.
 */
function appendBrushMeshes(object: THREE.Object3D, meshes: THREE.Mesh[]): void {
  if (object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object)) {
    meshes.push(object);
    return;
  }
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(child)) {
      meshes.push(child);
    }
  });
}
