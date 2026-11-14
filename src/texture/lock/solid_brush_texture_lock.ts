import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { FaceSurfaceDescription, cloneFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import {
  transformBrushLocalUvForPoseChange,
  type SurfaceUvLockFlags,
} from '@/texture/uv_matrix/surface_uv_matrix_transform.js';

/**
 * Snapshot of brush pose and face surfaces at the start of a live drag.
 * Absolute lock from this baseline avoids incremental offset drift.
 */
export interface SolidBrushTextureLockBaseline {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  /** Per-face surfaces at drag start (index matches brush faces). */
  faceSurfaces: FaceSurfaceDescription[];
  /** @deprecated Prefer faceSurfaces; kept for interim callers. */
  faceMappings?: FaceSurfaceDescription[];
  /**
   * Brush local-to-world at drag start, including CSG group parents. Present
   * when captured before the drag moved anything, so parent group moves and
   * early pose reads cannot shift the lock reference.
   */
  worldMatrix?: THREE.Matrix4;
}

/**
 * Captures pose and face surfaces for absolute texture lock during a drag.
 *
 * @param instance Brush at the pre-drag pose.
 * @param worldMatrix Brush local-to-world at the pre-drag pose, when known.
 * @returns Baseline snapshot.
 */
export function captureSolidBrushTextureLockBaseline(
  instance: SolidBrushInstance,
  worldMatrix?: THREE.Matrix4,
): SolidBrushTextureLockBaseline {
  const faceCount = instance.brush.faces.length;
  const faceSurfaces: FaceSurfaceDescription[] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faceSurfaces.push(instance.getFaceSurface(faceIndex));
  }
  const baseline: SolidBrushTextureLockBaseline = {
    position: instance.position.clone(),
    rotation: instance.rotation.clone(),
    scale: instance.scale.clone(),
    faceSurfaces,
    faceMappings: faceSurfaces,
  };
  if (worldMatrix) baseline.worldMatrix = worldMatrix.clone();
  return baseline;
}

/**
 * Locks one face surface UV matrix across a brush transform.
 *
 * @param surface Surface before the transform.
 * @param instance Brush instance (for plane data).
 * @param faceIndex Face index on the brush.
 * @param previousWorldMatrix Brush local-to-world before the transform.
 * @param nextWorldMatrix Brush local-to-world after the transform.
 * @param flags Lock flags.
 * @returns Surface with UV matrix adjusted for lock policy.
 */
export function lockFaceSurfaceForBrushTransform(
  surface: FaceSurfaceDescription,
  instance: SolidBrushInstance,
  faceIndex: number,
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): FaceSurfaceDescription {
  const result = cloneFaceSurface(surface);
  result.uv = transformBrushLocalUvForPoseChange(
    surface.uv,
    instance.faceNormalLocal(faceIndex),
    instance.facePlaneOffsetLocal(faceIndex),
    previousWorldMatrix,
    nextWorldMatrix,
    flags,
  );
  return result;
}

/**
 * Applies lock updates to every face on a brush.
 *
 * @param instance Brush at the new pose.
 * @param previousWorld Prior world matrix.
 * @param nextWorld New world matrix.
 * @param flags Lock flags.
 */
export function applyLocksToAllBrushFaces(
  instance: SolidBrushInstance,
  previousWorld: THREE.Matrix4,
  nextWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): void {
  applyLocksToAllFaces(instance, previousWorld, nextWorld, flags);
}

/**
 * Applies lock updates to every face on a brush.
 *
 * @param instance Brush instance.
 * @param previousWorld Prior world matrix.
 * @param nextWorld New world matrix.
 * @param flags Lock flags.
 */
function applyLocksToAllFaces(
  instance: SolidBrushInstance,
  previousWorld: THREE.Matrix4,
  nextWorld: THREE.Matrix4,
  flags: SurfaceUvLockFlags,
): void {
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const locked = lockFaceSurfaceForBrushTransform(
      instance.getFaceSurface(faceIndex),
      instance,
      faceIndex,
      previousWorld,
      nextWorld,
      flags,
    );
    instance.setFaceSurface(faceIndex, locked);
  }
}
