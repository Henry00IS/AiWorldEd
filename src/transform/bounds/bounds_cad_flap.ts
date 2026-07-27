import * as THREE from 'three';
import { BoundsFace } from '../../types/bounds_face.js';
import { getBoundsFaceLocalNormal } from './oriented_bounds.js';
import type { CadViewPlane } from '../../rulers/cad_view_plane.js';
import { getCadViewPlaneAxes } from '../../rulers/cad_view_plane.js';

/** UserData flag: handle mesh was restyled as a 2D CAD ear. */
export const BOUNDS_HANDLE_IS_EAR_KEY = 'boundsHandleIsEar';

/** UserData key for the world size used when placing this grip. */
export const BOUNDS_HANDLE_WORLD_SIZE_KEY = 'boundsHandleWorldSize';

/** UserData key for the face half-extent along its axis (local). */
export const BOUNDS_HANDLE_FACE_HALF_KEY = 'boundsHandleFaceHalf';

/**
 * Builds a modern CAD line-handle ear: a thin stadium (straight bar with
 * rounded caps) centered on the origin in the XY plane. Local +X runs along the
 * bounds edge; local +Y is the short outward thickness.
 *
 * @returns ShapeGeometry for one ear (caller orients and scales).
 */
export function createCadResizeFlapGeometry(): THREE.ShapeGeometry {
  const halfLength = 0.5;
  const halfThickness = 0.085;
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength + halfThickness, halfThickness);
  shape.lineTo(halfLength - halfThickness, halfThickness);
  shape.absarc(halfLength - halfThickness, 0, halfThickness, Math.PI * 0.5, -Math.PI * 0.5, true);
  shape.lineTo(-halfLength + halfThickness, -halfThickness);
  shape.absarc(-halfLength + halfThickness, 0, halfThickness, -Math.PI * 0.5, Math.PI * 0.5, true);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * Builds a unit box used as the invisible 3D bounds-arrow pick volume.
 *
 * @returns Unit cube geometry centered at the origin.
 */
export function createCadResizeCubeGeometry(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/**
 * Returns the local unit depth axis for an orthographic view plane.
 *
 * @param viewPlane Orthographic plane (`xz` / `xy` / `yz`).
 * @returns Depth direction in local bounds space, or null for full 3D.
 */
export function getViewPlaneDepthDirection(viewPlane: CadViewPlane): THREE.Vector3 | null {
  const { depthAxis } = getCadViewPlaneAxes(viewPlane);
  if (depthAxis === null) return null;
  if (depthAxis === 0) return new THREE.Vector3(1, 0, 0);
  if (depthAxis === 1) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Builds a quaternion that lays a CAD ear flat in the view plane: shape +Y
 * along the face outward normal, shape +X along the edge (depth × outward).
 * Depth-facing faces return null (they are not drawn as ears).
 *
 * @param face Bounds face for this ear.
 * @param viewPlane Orthographic view plane.
 * @returns Orientation quaternion, or null when the face is depth-facing.
 */
export function quaternionForViewPlaneEar(face: BoundsFace, viewPlane: CadViewPlane): THREE.Quaternion | null {
  const depth = getViewPlaneDepthDirection(viewPlane);
  if (!depth) return null;
  const outward = getBoundsFaceLocalNormal(face);
  const alongEdge = new THREE.Vector3().crossVectors(depth, outward);
  if (alongEdge.lengthSq() < 1e-10) return null;
  alongEdge.normalize();
  const basisZ = new THREE.Vector3().crossVectors(alongEdge, outward).normalize();
  const matrix = new THREE.Matrix4().makeBasis(alongEdge, outward, basisZ);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/**
 * Ear size relative to the base handle world size: long along the edge, thin
 * bar thickness, slight gap off the bounds face.
 */
export const CAD_EAR_ALONG_EDGE_SCALE = 2.4;
export const CAD_EAR_THICKNESS_SCALE = 0.55;
export const CAD_EAR_OFFSET_SCALE = 0.28;
