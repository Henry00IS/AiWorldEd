import * as THREE from 'three';
import { CsgPolygon } from './csg_polygon.js';
import { orderConvexPolygon } from '../transform/convex_face_prism.js';
import { createDefaultFaceTextureMapping } from '../texture/face_texture_mapping.js';
import { getTexturePaintState } from '../texture/texture_paint_state.js';

/**
 * Distance treated as on the cutting plane when collecting cap vertices.
 */
const CAP_PLANE_EPSILON = 1e-5;

/**
 * Builds a planar cap polygon that closes a half-space solid after a plane cut.
 * Intersection points come from edges that span the cutting plane.
 * @param sourcePolygons World-space polygons of the original solid.
 * @param planeNormal Unit plane normal (CSG form n·x = constant).
 * @param planeConstant Plane constant in CSG form.
 * @param outwardNormal Outward normal for the kept solid's cut face.
 * @returns A cap polygon, or null when fewer than three unique hits exist.
 */
export function buildPlaneCapPolygon(
  sourcePolygons: CsgPolygon[],
  planeNormal: THREE.Vector3,
  planeConstant: number,
  outwardNormal: THREE.Vector3
): CsgPolygon | null {
  const intersectionPoints = collectPlaneIntersectionPoints(
    sourcePolygons,
    planeNormal,
    planeConstant
  );
  if (intersectionPoints.length < 3) return null;
  const projected = projectPointsOntoPlane(
    intersectionPoints,
    planeNormal,
    planeConstant
  );
  const ordered = orderConvexPolygon(projected, outwardNormal);
  const hull = removeCollinearRingPoints(ordered, outwardNormal);
  if (hull.length < 3) return null;
  return createCappedPolygonWithOutwardNormal(hull, outwardNormal);
}

/**
 * Drops nearly collinear ring points so the first triangle defines a plane.
 * @param ordered Convex-ordered ring points.
 * @param planeNormal Plane normal used for 2D cross tests.
 * @returns Simplified ring with corners only.
 */
function removeCollinearRingPoints(
  ordered: THREE.Vector3[],
  planeNormal: THREE.Vector3
): THREE.Vector3[] {
  if (ordered.length <= 3) return ordered.slice();
  const kept: THREE.Vector3[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const prev = ordered[(index - 1 + ordered.length) % ordered.length];
    const current = ordered[index];
    const next = ordered[(index + 1) % ordered.length];
    if (isAlmostCollinear(prev, current, next, planeNormal)) continue;
    kept.push(current);
  }
  return kept.length >= 3 ? kept : ordered.slice();
}

/**
 * Returns true when three points are nearly collinear on the plane.
 * @param prev Previous ring point.
 * @param current Candidate point.
 * @param next Next ring point.
 * @param planeNormal Plane normal.
 * @returns True when the turn at current is negligible.
 */
function isAlmostCollinear(
  prev: THREE.Vector3,
  current: THREE.Vector3,
  next: THREE.Vector3,
  planeNormal: THREE.Vector3
): boolean {
  const ab = current.clone().sub(prev);
  const bc = next.clone().sub(current);
  const cross = new THREE.Vector3().crossVectors(ab, bc);
  return Math.abs(cross.dot(planeNormal)) < 1e-10;
}

/**
 * Projects points onto the cutting plane to remove numerical drift.
 * @param points Candidate points near the plane.
 * @param planeNormal CSG plane normal.
 * @param planeConstant CSG plane constant.
 * @returns Points forced onto the plane.
 */
function projectPointsOntoPlane(
  points: THREE.Vector3[],
  planeNormal: THREE.Vector3,
  planeConstant: number
): THREE.Vector3[] {
  return points.map((point) => {
    const distance = planeNormal.dot(point) - planeConstant;
    return point.clone().addScaledVector(planeNormal, -distance);
  });
}

/**
 * Builds a polygon and flips it until the normal matches outward.
 * @param orderedVertices Convex ordered vertices.
 * @param outwardNormal Desired outward normal.
 * @returns Cap polygon, or null if degenerate.
 */
function createCappedPolygonWithOutwardNormal(
  orderedVertices: THREE.Vector3[],
  outwardNormal: THREE.Vector3
): CsgPolygon | null {
  const fillMapping = createDefaultFaceTextureMapping(
    getTexturePaintState().getLastTextureId()
  );
  const cap = new CsgPolygon(orderedVertices, fillMapping);
  if (cap.getPlaneNormal().lengthSq() < 1e-12) return null;
  ensureCapOutwardWinding(cap, outwardNormal);
  return cap;
}

/**
 * Collects unique edge–plane intersection points from a polygon soup.
 * @param polygons Source polygons in world space.
 * @param planeNormal Plane normal (CSG form).
 * @param planeConstant Plane constant (CSG form).
 * @returns Deduplicated intersection points on the plane.
 */
export function collectPlaneIntersectionPoints(
  polygons: CsgPolygon[],
  planeNormal: THREE.Vector3,
  planeConstant: number
): THREE.Vector3[] {
  const unique = new Map<string, THREE.Vector3>();
  polygons.forEach((polygon) => {
    collectPolygonEdgeIntersections(
      polygon,
      planeNormal,
      planeConstant,
      unique
    );
  });
  return Array.from(unique.values());
}

/**
 * Collects spanning-edge intersections for one polygon into a map.
 * @param polygon The polygon whose edges are tested.
 * @param planeNormal Plane normal.
 * @param planeConstant Plane constant.
 * @param unique Accumulator keyed by quantized position.
 */
function collectPolygonEdgeIntersections(
  polygon: CsgPolygon,
  planeNormal: THREE.Vector3,
  planeConstant: number,
  unique: Map<string, THREE.Vector3>
): void {
  const vertices = polygon.getVertices();
  for (let index = 0; index < vertices.length; index++) {
    const nextIndex = (index + 1) % vertices.length;
    const start = vertices[index];
    const end = vertices[nextIndex];
    const startDistance = planeNormal.dot(start) - planeConstant;
    const endDistance = planeNormal.dot(end) - planeConstant;
    addOnPlaneVertex(start, startDistance, unique);
    addOnPlaneVertex(end, endDistance, unique);
    addSpanningIntersection(
      start,
      end,
      startDistance,
      endDistance,
      unique
    );
  }
}

/**
 * Adds a vertex that already lies on the plane.
 * @param vertex Candidate vertex.
 * @param signedDistance Distance to the plane.
 * @param unique Accumulator map.
 */
function addOnPlaneVertex(
  vertex: THREE.Vector3,
  signedDistance: number,
  unique: Map<string, THREE.Vector3>
): void {
  if (Math.abs(signedDistance) > CAP_PLANE_EPSILON) return;
  storeUniquePoint(vertex, unique);
}

/**
 * Adds the intersection of a spanning edge with the plane.
 * @param start Edge start.
 * @param end Edge end.
 * @param startDistance Signed distance of start.
 * @param endDistance Signed distance of end.
 * @param unique Accumulator map.
 */
function addSpanningIntersection(
  start: THREE.Vector3,
  end: THREE.Vector3,
  startDistance: number,
  endDistance: number,
  unique: Map<string, THREE.Vector3>
): void {
  if (startDistance * endDistance >= 0) return;
  const t = startDistance / (startDistance - endDistance);
  const hit = start.clone().lerp(end, t);
  storeUniquePoint(hit, unique);
}

/**
 * Stores a point under a quantized key when not already present.
 * @param point World point to store.
 * @param unique Accumulator map.
 */
function storeUniquePoint(
  point: THREE.Vector3,
  unique: Map<string, THREE.Vector3>
): void {
  const key = quantizePointKey(point);
  if (unique.has(key)) return;
  unique.set(key, point.clone());
}

/**
 * Quantizes a point so nearly identical vertices merge.
 * @param point World point.
 * @returns String key.
 */
function quantizePointKey(point: THREE.Vector3): string {
  const scale = 1e5;
  const x = Math.round(point.x * scale);
  const y = Math.round(point.y * scale);
  const z = Math.round(point.z * scale);
  return `${x},${y},${z}`;
}

/**
 * Flips the cap when its computed normal disagrees with the outward normal.
 * @param cap Cap polygon to adjust.
 * @param outwardNormal Desired outward normal.
 */
function ensureCapOutwardWinding(
  cap: CsgPolygon,
  outwardNormal: THREE.Vector3
): void {
  if (cap.getPlaneNormal().dot(outwardNormal) >= 0) return;
  cap.flip();
}
