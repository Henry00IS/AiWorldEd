import * as THREE from 'three';
import { BoundsFace } from '../../types/bounds_face.js';
import { getBoundsFaceHalfExtent, getBoundsFaceLocalNormal, type OrientedBoundsData } from './oriented_bounds.js';
import { getCadViewPlaneAxes, type CadLocalAxis, type CadViewPlane } from '../../rulers/cad_view_plane.js';

/**
 * Fraction of each face half-extent treated as the resize rim. Hits inside the
 * remaining center region start a face-plane move instead.
 */
export const BOUNDS_FACE_RESIZE_EDGE_BAND_RATIO = 0.3;

/**
 * Exterior-only pick band for 2D silhouette edges as a fraction of the larger
 * in-plane half extent. Resize never starts inside the OBB — only on the wire
 * from outside or slightly past the exterior (body drag owns the interior).
 */
export const BOUNDS_SILHOUETTE_EXTERIOR_BAND_RATIO = 0.05;

/** Minimum exterior band in world units (still small). */
export const BOUNDS_SILHOUETTE_EXTERIOR_MIN_BAND = 0.05;

/** Maximum exterior band so large boxes do not get a huge resize rim. */
export const BOUNDS_SILHOUETTE_EXTERIOR_MAX_BAND = 0.12;

/** Interaction mode chosen from a face pick location. */
export type BoundsFaceInteractionMode = 'move' | 'resize';

/**
 * Chooses move vs resize from where the pointer hit the face. Center of the
 * face moves the selection; near the rim resizes that side. No modifier key.
 *
 * @param hitPoint World-space hit on the face.
 * @param bounds Current oriented bounds.
 * @param face Hit face.
 * @param edgeBandRatio Rim thickness as a fraction of face half-size (0–0.5).
 * @returns Interaction mode for this press.
 */
export function resolveBoundsFaceInteractionMode(
  hitPoint: THREE.Vector3,
  bounds: OrientedBoundsData,
  face: BoundsFace,
  edgeBandRatio: number = BOUNDS_FACE_RESIZE_EDGE_BAND_RATIO,
): BoundsFaceInteractionMode {
  if (isBoundsFaceHitNearEdge(hitPoint, bounds, face, edgeBandRatio)) {
    return 'resize';
  }
  return 'move';
}

/**
 * Picks a one-sided resize face from a world point on the 2D silhouette of the
 * OBB. Hits must be on the exterior side of an edge (including the wire
 * itself); anything strictly inside the OBB is body-drag only. Returns null in
 * 3D or when not near an exterior edge.
 *
 * @param worldPoint Point in the orthographic view plane (typically ray hit).
 * @param bounds Current oriented bounds.
 * @param viewPlane Active orthographic plane (`xz` / `xy` / `yz`).
 * @param exteriorBandWorld Optional screen-derived exterior band in world
 *   units. When omitted, uses a small OBB-relative fallback.
 * @returns Bounds face for that edge, or null.
 */
export function pickOrthographicSilhouetteEdgeFace(
  worldPoint: THREE.Vector3,
  bounds: OrientedBoundsData,
  viewPlane: CadViewPlane,
  exteriorBandWorld?: number,
): BoundsFace | null {
  const axes = getCadViewPlaneAxes(viewPlane);
  if (axes.depthAxis === null) return null;
  const local = worldPointToBoundsLocal(worldPoint, bounds);
  const halfU = componentOf(bounds.halfExtents, axes.axisU);
  const halfV = componentOf(bounds.halfExtents, axes.axisV);
  const u = componentOf(local, axes.axisU);
  const v = componentOf(local, axes.axisV);
  const exteriorBand =
    exteriorBandWorld !== undefined && exteriorBandWorld > 0
      ? exteriorBandWorld
      : computeSilhouetteExteriorBandFallback(halfU, halfV);
  return nearestSilhouetteEdgeFace(u, v, halfU, halfV, exteriorBand, axes.axisU, axes.axisV);
}

/**
 * Fallback exterior band when no screen-space camera conversion is available.
 *
 * @param halfU In-plane half extent along U.
 * @param halfV In-plane half extent along V.
 * @returns World-unit exterior band.
 */
function computeSilhouetteExteriorBandFallback(halfU: number, halfV: number): number {
  const fromRatio = Math.max(halfU, halfV) * BOUNDS_SILHOUETTE_EXTERIOR_BAND_RATIO;
  return Math.min(BOUNDS_SILHOUETTE_EXTERIOR_MAX_BAND, Math.max(BOUNDS_SILHOUETTE_EXTERIOR_MIN_BAND, fromRatio));
}

/**
 * Converts a world point into bounds-local coordinates.
 *
 * @param worldPoint World-space point.
 * @param bounds Oriented bounds.
 * @returns Local coordinates relative to the OBB center.
 */
function worldPointToBoundsLocal(worldPoint: THREE.Vector3, bounds: OrientedBoundsData): THREE.Vector3 {
  return worldPoint.clone().sub(bounds.center).applyQuaternion(bounds.quaternion.clone().invert());
}

/**
 * Reads one axis component from a vector.
 *
 * @param vector Source vector.
 * @param axis Local axis index.
 * @returns Component value.
 */
function componentOf(vector: THREE.Vector3, axis: CadLocalAxis): number {
  if (axis === 0) return vector.x;
  if (axis === 1) return vector.y;
  return vector.z;
}

/**
 * Chooses the nearest in-plane silhouette edge using an exterior-only band.
 *
 * @param u Local coordinate along view U.
 * @param v Local coordinate along view V.
 * @param halfU Half extent along U.
 * @param halfV Half extent along V.
 * @param exteriorBand Allowed distance on/outside the wire.
 * @param axisU Local axis index for U.
 * @param axisV Local axis index for V.
 * @returns Matching bounds face, or null when not near an exterior edge.
 */
function nearestSilhouetteEdgeFace(
  u: number,
  v: number,
  halfU: number,
  halfV: number,
  exteriorBand: number,
  axisU: CadLocalAxis,
  axisV: CadLocalAxis,
): BoundsFace | null {
  type Candidate = { face: BoundsFace; distance: number };
  const candidates: Candidate[] = [];
  pushExteriorEdgeCandidate(candidates, u, halfU, v, halfV, exteriorBand, positiveFaceForAxis(axisU));
  pushExteriorEdgeCandidate(candidates, -u, halfU, v, halfV, exteriorBand, negativeFaceForAxis(axisU));
  pushExteriorEdgeCandidate(candidates, v, halfV, u, halfU, exteriorBand, positiveFaceForAxis(axisV));
  pushExteriorEdgeCandidate(candidates, -v, halfV, u, halfU, exteriorBand, negativeFaceForAxis(axisV));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]!.face;
}

/**
 * Adds a candidate when the pointer is on or outside one positive-side edge
 * (never strictly inside the OBB).
 *
 * @param candidates Output list.
 * @param along Coordinate along the outward edge normal (edge at +halfAlong).
 * @param halfAlong Half extent along the edge normal.
 * @param across Coordinate along the edge.
 * @param halfAcross Half extent along the edge.
 * @param exteriorBand Exterior pick thickness.
 * @param face Face for this edge.
 */
function pushExteriorEdgeCandidate(
  candidates: Array<{ face: BoundsFace; distance: number }>,
  along: number,
  halfAlong: number,
  across: number,
  halfAcross: number,
  exteriorBand: number,
  face: BoundsFace,
): void {
  const outside = along - halfAlong;
  const epsilon = 1e-6;
  if (outside < -epsilon || outside > exteriorBand + epsilon) return;
  if (Math.abs(across) > halfAcross + exteriorBand + epsilon) return;
  candidates.push({ face, distance: Math.max(0, outside) });
}

/**
 * Maps a local axis to its positive bounds face.
 *
 * @param axis Local axis index.
 * @returns Positive face enum.
 */
function positiveFaceForAxis(axis: CadLocalAxis): BoundsFace {
  if (axis === 0) return BoundsFace.POS_X;
  if (axis === 1) return BoundsFace.POS_Y;
  return BoundsFace.POS_Z;
}

/**
 * Maps a local axis to its negative bounds face.
 *
 * @param axis Local axis index.
 * @returns Negative face enum.
 */
function negativeFaceForAxis(axis: CadLocalAxis): BoundsFace {
  if (axis === 0) return BoundsFace.NEG_X;
  if (axis === 1) return BoundsFace.NEG_Y;
  return BoundsFace.NEG_Z;
}

/**
 * Returns true when a face hit lies in the outer rim used for one-sided resize.
 *
 * @param hitPoint World-space hit on the face.
 * @param bounds Current oriented bounds.
 * @param face Hit face.
 * @param edgeBandRatio Rim thickness as a fraction of face half-size (0–0.5).
 * @returns True when the hit is near a face edge.
 */
export function isBoundsFaceHitNearEdge(
  hitPoint: THREE.Vector3,
  bounds: OrientedBoundsData,
  face: BoundsFace,
  edgeBandRatio: number = BOUNDS_FACE_RESIZE_EDGE_BAND_RATIO,
): boolean {
  const band = clampEdgeBandRatio(edgeBandRatio);
  const faceAxes = getFaceTangentHalfExtents(bounds.halfExtents, face);
  if (faceAxes.halfU <= 1e-8 || faceAxes.halfV <= 1e-8) return true;
  const local = hitPoint.clone().sub(bounds.center).applyQuaternion(bounds.quaternion.clone().invert());
  const faceCenterLocal = getBoundsFaceLocalNormal(face).multiplyScalar(
    getBoundsFaceHalfExtent(bounds.halfExtents, face),
  );
  const onFace = local.sub(faceCenterLocal);
  const u = Math.abs(onFace.dot(faceAxes.axisU));
  const v = Math.abs(onFace.dot(faceAxes.axisV));
  const edgeU = faceAxes.halfU * (1 - band);
  const edgeV = faceAxes.halfV * (1 - band);
  return u >= edgeU || v >= edgeV;
}

/**
 * Clamps the edge-band ratio to a usable range.
 *
 * @param edgeBandRatio Requested ratio.
 * @returns Clamped ratio.
 */
function clampEdgeBandRatio(edgeBandRatio: number): number {
  return Math.min(0.49, Math.max(0.05, edgeBandRatio));
}

/**
 * Returns unit tangents and half-sizes for the two axes spanning a bounds face.
 *
 * @param halfExtents OBB half extents.
 * @param face Face whose tangent plane is needed.
 * @returns Face-local U/V axes and half extents.
 */
function getFaceTangentHalfExtents(
  halfExtents: THREE.Vector3,
  face: BoundsFace,
): { axisU: THREE.Vector3; axisV: THREE.Vector3; halfU: number; halfV: number } {
  if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
    return {
      axisU: new THREE.Vector3(0, 0, 1),
      axisV: new THREE.Vector3(0, 1, 0),
      halfU: halfExtents.z,
      halfV: halfExtents.y,
    };
  }
  if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
    return {
      axisU: new THREE.Vector3(1, 0, 0),
      axisV: new THREE.Vector3(0, 0, 1),
      halfU: halfExtents.x,
      halfV: halfExtents.z,
    };
  }
  return {
    axisU: new THREE.Vector3(1, 0, 0),
    axisV: new THREE.Vector3(0, 1, 0),
    halfU: halfExtents.x,
    halfV: halfExtents.y,
  };
}
