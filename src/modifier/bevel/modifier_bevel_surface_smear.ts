import * as THREE from 'three';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Two brush-local points that must keep the source face's UV. */
export interface ModifierBevelSmearEdge {
  /** First shared point. */
  pointA: THREE.Vector3;
  /** Second shared point. */
  pointB: THREE.Vector3;
  /** Outward unit normal of the new face. */
  destNormal: THREE.Vector3;
}

/**
 * Builds a face surface whose UV continues across a shared edge.
 *
 * @param source Surface of the face the texture comes from.
 * @param sourceNormal Outward unit normal of the source face.
 * @param edge Shared edge and destination normal, in the source UV's space.
 * @returns Destination surface with the source texture.
 */
export function modifierBevelSmearSurface(
  source: FaceSurfaceDescription,
  sourceNormal: THREE.Vector3,
  edge: ModifierBevelSmearEdge,
): FaceSurfaceDescription {
  const uvA = source.uv.project(edge.pointA);
  const uvB = source.uv.project(edge.pointB);
  const scale = source.uv.decompose(sourceNormal);
  const scaleU = edge.destNormal.dot(sourceNormal) < 0 ? -Math.abs(scale.scaleU) : Math.abs(scale.scaleU);
  const rotationDeg = modifierBevelSmearRotation(edge, scaleU, Math.abs(scale.scaleV), uvA, uvB);
  const uv = modifierBevelSmearMatrix(edge, scaleU, Math.abs(scale.scaleV), rotationDeg, uvA);
  return { textureId: source.textureId, uv };
}

/**
 * Measures the rotation that aligns the destination edge with the source UV.
 *
 * @param edge Shared edge.
 * @param scaleU Destination U scale.
 * @param scaleV Destination V scale.
 * @param uvA Source UV at the first point.
 * @param uvB Source UV at the second point.
 * @returns Rotation in degrees.
 */
function modifierBevelSmearRotation(
  edge: ModifierBevelSmearEdge,
  scaleU: number,
  scaleV: number,
  uvA: { u: number; v: number },
  uvB: { u: number; v: number },
): number {
  const mapping = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), edge.destNormal, 0, scaleU, scaleV);
  const destA = mapping.project(edge.pointA);
  const destB = mapping.project(edge.pointB);
  const destDir = new THREE.Vector2(destB.u - destA.u, destB.v - destA.v);
  const sourceDir = new THREE.Vector2(uvB.u - uvA.u, uvB.v - uvA.v);
  if (destDir.lengthSq() < 1e-12 || sourceDir.lengthSq() < 1e-12) return 0;
  destDir.normalize();
  sourceDir.normalize();
  const radians = Math.atan2(
    destDir.x * sourceDir.y - destDir.y * sourceDir.x,
    destDir.x * sourceDir.x + destDir.y * sourceDir.y,
  );
  return -THREE.MathUtils.radToDeg(radians);
}

/**
 * Builds the destination UV matrix locked to the first edge point.
 *
 * @param edge Shared edge.
 * @param scaleU U scale.
 * @param scaleV V scale.
 * @param rotationDeg Rotation around the destination normal.
 * @param uvA Source UV at the first point.
 * @returns UV matrix.
 */
function modifierBevelSmearMatrix(
  edge: ModifierBevelSmearEdge,
  scaleU: number,
  scaleV: number,
  rotationDeg: number,
  uvA: { u: number; v: number },
): SurfaceUvMatrix {
  const unshifted = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), edge.destNormal, rotationDeg, scaleU, scaleV);
  const projected = unshifted.project(edge.pointA);
  const translation = new THREE.Vector2(uvA.u - projected.u, uvA.v - projected.v);
  return SurfaceUvMatrix.fromTrs(translation, edge.destNormal, rotationDeg, scaleU, scaleV);
}
