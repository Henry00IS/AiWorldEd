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

/** UV change for one unit step. */
interface ModifierBevelUvStep {
  u: number;
  v: number;
}

/**
 * Builds a face surface whose UV continues across a shared edge. Copies the
 * source UV change along the edge and the opposite change stepping onto the new
 * face.
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
  const acrossSource = modifierBevelAcrossEdge(sourceNormal, edge.destNormal, edge.pointA, edge.pointB);
  const acrossDest = modifierBevelAcrossEdge(edge.destNormal, sourceNormal, edge.pointA, edge.pointB);
  const uv = modifierBevelSmearContinuedMatrix(source, edge, acrossSource, acrossDest);
  return { textureId: source.textureId, uv };
}

/**
 * Builds the destination matrix from the source edge and across-edge gradients.
 *
 * @param source Surface being continued.
 * @param edge Shared edge.
 * @param acrossSource Unit step into the source face.
 * @param acrossDest Unit step into the destination face.
 * @returns UV matrix, or a clone of the source when the edge is degenerate.
 */
function modifierBevelSmearContinuedMatrix(
  source: FaceSurfaceDescription,
  edge: ModifierBevelSmearEdge,
  acrossSource: THREE.Vector3,
  acrossDest: THREE.Vector3,
): SurfaceUvMatrix {
  const edgeDir = modifierBevelUnitEdge(edge);
  if (!edgeDir || acrossSource.lengthSq() < 1e-12 || acrossDest.lengthSq() < 1e-12) {
    return source.uv.clone();
  }
  const along = modifierBevelUvPerUnit(source, edge.pointA, edgeDir);
  const across = modifierBevelUvPerUnit(source, edge.pointA, acrossSource);
  const uvA = source.uv.project(edge.pointA);
  const u = modifierBevelGradientRow(edgeDir, acrossDest, along.u, -across.u, edge.pointA, uvA.u);
  const v = modifierBevelGradientRow(edgeDir, acrossDest, along.v, -across.v, edge.pointA, uvA.v);
  return new SurfaceUvMatrix(u, v);
}

/**
 * Returns the unit direction from the first edge point to the second.
 *
 * @param edge Shared edge.
 * @returns Unit direction, or null when the points coincide.
 */
function modifierBevelUnitEdge(edge: ModifierBevelSmearEdge): THREE.Vector3 | null {
  const direction = new THREE.Vector3().subVectors(edge.pointB, edge.pointA);
  if (direction.lengthSq() < 1e-16) return null;
  return direction.normalize();
}

/**
 * Measures how UV changes for a unit step from an origin.
 *
 * @param source Surface being sampled.
 * @param origin Start point.
 * @param direction Unit step direction.
 * @returns UV delta for that step.
 */
function modifierBevelUvPerUnit(
  source: FaceSurfaceDescription,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): ModifierBevelUvStep {
  const here = source.uv.project(origin);
  const next = source.uv.project(origin.clone().add(direction));
  return { u: next.u - here.u, v: next.v - here.v };
}

/**
 * Builds one UV row from an along-edge rate and an across-edge rate.
 *
 * @param edgeDir Unit edge direction.
 * @param acrossDest Unit step into the destination face.
 * @param along Rate of this coordinate along the edge.
 * @param across Rate of this coordinate into the destination.
 * @param pointA Point that must keep the source coordinate.
 * @param valueAtA Source coordinate at pointA.
 * @returns U or V row.
 */
function modifierBevelGradientRow(
  edgeDir: THREE.Vector3,
  acrossDest: THREE.Vector3,
  along: number,
  across: number,
  pointA: THREE.Vector3,
  valueAtA: number,
): THREE.Vector4 {
  const axis = edgeDir.clone().multiplyScalar(along).addScaledVector(acrossDest, across);
  const translation = valueAtA - axis.dot(pointA);
  return new THREE.Vector4(axis.x, axis.y, axis.z, translation);
}

/**
 * Returns a unit step along a face, away from the other face.
 *
 * @param faceNormal Normal of the face to step on.
 * @param otherNormal Normal of the face being left.
 * @param pointA First edge point.
 * @param pointB Second edge point.
 * @returns Unit direction in the face.
 */
function modifierBevelAcrossEdge(
  faceNormal: THREE.Vector3,
  otherNormal: THREE.Vector3,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): THREE.Vector3 {
  const edgeDirection = new THREE.Vector3().subVectors(pointB, pointA).normalize();
  const across = new THREE.Vector3().crossVectors(faceNormal, edgeDirection);
  if (across.dot(otherNormal) > 0) across.negate();
  if (across.lengthSq() < 1e-12) return new THREE.Vector3();
  return across.normalize();
}
