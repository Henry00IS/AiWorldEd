import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelClipBrush } from './modifier_bevel_brush_clip.js';
import { modifierBevelEdgePlanes } from './modifier_bevel_brush_edges.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import { modifierBevelInheritFaces } from './modifier_bevel_surface_inherit.js';

/**
 * Chamfered local brush plus face inherit records. The authored brush is
 * untouched.
 */
export interface ModifierBevelDerivedBrush {
  /** Chamfered brush in brush-local space. */
  localBrush: SolidBrush;
  /** Inherit record per derived face. */
  faces: ModifierBevelFaceRecord[];
}

/**
 * Chamfers brush edges that meet the volumes. Returns null when no edge is cut.
 *
 * @param instance Authored brush instance. Its brush is not modified.
 * @param volumes Live bevel volumes with current world matrices.
 * @returns Derived local brush, or null when the volume misses every edge.
 */
export function modifierBevelDeriveBrush(
  instance: SolidBrushInstance,
  volumes: readonly THREE.Object3D[],
): ModifierBevelDerivedBrush | null {
  const mesh = instance.mesh;
  if (!mesh || volumes.length === 0) return null;
  mesh.updateMatrixWorld(true);
  const worldBrush = instance.brush.clone();
  worldBrush.transformVertices(mesh.matrixWorld);
  const cuts = modifierBevelEdgePlanes(worldBrush, new THREE.Matrix4(), volumes);
  if (cuts.length === 0) return null;
  const chamfered = modifierBevelClipBrush(worldBrush, cuts);
  if (chamfered === worldBrush) return null;
  return modifierBevelToLocalDerived(instance.brush, chamfered, mesh.matrixWorld);
}

/**
 * Converts a world-space chamfer back into brush-local space and matches faces.
 *
 * @param sourceBrush Authored local brush.
 * @param worldBrush Chamfered world brush.
 * @param worldMatrix Brush mesh world matrix.
 * @returns Local derived brush and face records.
 */
function modifierBevelToLocalDerived(
  sourceBrush: SolidBrush,
  worldBrush: SolidBrush,
  worldMatrix: THREE.Matrix4,
): ModifierBevelDerivedBrush {
  const localBrush = worldBrush.clone();
  localBrush.transformVertices(new THREE.Matrix4().copy(worldMatrix).invert());
  return { localBrush, faces: modifierBevelInheritFaces(sourceBrush, localBrush) };
}
