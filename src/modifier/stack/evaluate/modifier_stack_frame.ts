import * as THREE from 'three';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackOwnerCandidate,
  modifierStackOwnerLocalBox,
} from '@/modifier/stack/owner/modifier_stack_owner.js';

/**
 * Returns the placement basis of a volume: its world position and, unless the
 * world basis is requested, its rotation. Scale never distorts placement.
 *
 * @param volume Scene modifier volume.
 * @param space 'world' keeps world axes; anything else follows the volume.
 * @returns Frame-to-world matrix.
 */
export function modifierStackFrame(volume: THREE.Object3D, space: unknown): THREE.Matrix4 {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  volume.matrixWorld.decompose(position, rotation, new THREE.Vector3());
  rotation.normalize();
  if (space === 'world') rotation.identity();
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
}

/**
 * Returns the volume box measured in its own frame, with scale applied.
 *
 * @param volume Scene modifier volume, generator node, or stack owner.
 * @returns Box in frame coordinates; empty when the volume has no geometry.
 */
export function modifierStackVolumeBox(volume: THREE.Object3D): THREE.Box3 {
  const local = modifierStackVolumeLocalBox(volume);
  if (local.isEmpty()) return new THREE.Box3();
  const scale = new THREE.Vector3().setFromMatrixScale(volume.matrixWorld);
  return new THREE.Box3().setFromPoints([local.min.clone().multiply(scale), local.max.clone().multiply(scale)]);
}

/**
 * Returns the box a stack places against in the node's local coordinates: the
 * geometry box of a volume or generator node, or the bounds of the brushes
 * under a brush or CSG group that owns its stack.
 *
 * @param volume Scene modifier volume, generator node, or stack owner.
 * @returns Local box; empty without geometry.
 */
export function modifierStackVolumeLocalBox(volume: THREE.Object3D): THREE.Box3 {
  if (modifierStackOwnerCandidate(volume)) return modifierStackOwnerLocalBox(volume);
  const geometry = (volume as THREE.Mesh).geometry;
  if (!geometry) return new THREE.Box3();
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox?.clone() ?? new THREE.Box3();
}

/**
 * Converts a world-space operator into solid model space.
 *
 * @param worldTransform Operator acting on world coordinates.
 * @param solidRoot Solid model root.
 * @returns Operator acting on model coordinates.
 */
export function modifierStackModelTransform(worldTransform: THREE.Matrix4, solidRoot: THREE.Object3D): THREE.Matrix4 {
  const rootInverse = solidRoot.matrixWorld.clone().invert();
  return rootInverse.multiply(worldTransform).multiply(solidRoot.matrixWorld);
}

/**
 * Measures every unit of a working set in a frame.
 *
 * @param units Working set.
 * @param frame Frame-to-world matrix.
 * @returns Combined bounds in frame coordinates.
 */
export function modifierStackUnitsBounds(units: readonly ModifierStackUnit[], frame: THREE.Matrix4): THREE.Box3 {
  const bounds = new THREE.Box3();
  const inverse = frame.clone().invert();
  const point = new THREE.Vector3();
  for (const unit of units) {
    for (const brush of unit.brushes) {
      if (!brush.mesh) continue;
      brush.mesh.updateWorldMatrix(true, false);
      const matrix = inverse.clone().multiply(brush.mesh.matrixWorld);
      for (const vertex of brush.brush.vertices) bounds.expandByPoint(point.copy(vertex).applyMatrix4(matrix));
    }
  }
  return bounds;
}

/**
 * Creates a group whose world matrix equals the solid root's, so derived brush
 * meshes parented to it report model-space brushes correctly in world space.
 *
 * @param solidRoot Solid model root.
 * @returns Detached staging group.
 */
export function modifierStackStagingCreate(solidRoot: THREE.Object3D): THREE.Group {
  const staging = new THREE.Group();
  staging.matrixAutoUpdate = false;
  staging.matrix.copy(solidRoot.matrixWorld);
  staging.updateMatrixWorld(true);
  return staging;
}
