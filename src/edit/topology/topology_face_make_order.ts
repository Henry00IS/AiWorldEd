import * as THREE from 'three';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';

/**
 * Orders loose corners into a face loop. Corners that already run along open
 * mesh borders follow those borders, so a hole of any shape is filled the way
 * it is outlined; other corners are sorted by angle around their centre.
 *
 * @param geometry Working geometry.
 * @param corners Distinct vertex indices.
 * @returns Corners in loop order.
 */
export function orderTopologyFaceCorners(geometry: TopologyWorkingGeometry, corners: readonly number[]): number[] {
  return followBorderChain(geometry, corners) ?? sortCornersByAngle(geometry, corners);
}

/**
 * Returns the unit normal of the plane that best fits some corners.
 *
 * @param geometry Working geometry.
 * @param corners Vertex indices.
 * @returns Unit normal, or a zero vector when the corners are collinear.
 */
export function topologyCornerPlaneNormal(
  geometry: TopologyWorkingGeometry,
  corners: readonly number[],
): THREE.Vector3 {
  const points = corners.map((corner) => geometry.positions[corner]!);
  const centre = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const far = farthestBy(points, (point) => point.distanceToSquared(centre))
    .clone()
    .sub(centre);
  const side = farthestBy(points, (point) => far.clone().cross(point.clone().sub(centre)).lengthSq());
  return far.cross(side.clone().sub(centre)).normalize();
}

/**
 * Returns the point with the largest score.
 *
 * @param points Candidates.
 * @param score Score function.
 * @returns Best point.
 */
function farthestBy(points: readonly THREE.Vector3[], score: (point: THREE.Vector3) => number): THREE.Vector3 {
  return points.reduce((best, point) => (score(point) > score(best) ? point : best), points[0]!);
}

/**
 * Sorts corners by their angle around the centre in the best-fit plane.
 *
 * @param geometry Working geometry.
 * @param corners Vertex indices.
 * @returns Sorted corners.
 */
function sortCornersByAngle(geometry: TopologyWorkingGeometry, corners: readonly number[]): number[] {
  const normal = topologyCornerPlaneNormal(geometry, corners);
  const points = corners.map((corner) => geometry.positions[corner]!);
  const centre = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const axisU = points[0]!.clone().sub(centre).normalize();
  const axisV = normal.clone().cross(axisU);
  const angle = (corner: number) => {
    const offset = geometry.positions[corner]!.clone().sub(centre);
    return Math.atan2(offset.dot(axisV), offset.dot(axisU));
  };
  return [...corners].sort((a, b) => angle(a) - angle(b));
}

/**
 * Walks the corners along open border edges when they form one chain.
 *
 * @param geometry Working geometry.
 * @param corners Vertex indices.
 * @returns Chain order, or null when the borders do not link every corner.
 */
function followBorderChain(geometry: TopologyWorkingGeometry, corners: readonly number[]): number[] | null {
  const links = borderLinks(geometry, new Set(corners));
  if ([...links.values()].some((next) => next.length > 2)) return null;
  const start = corners.find((corner) => (links.get(corner)?.length ?? 0) < 2) ?? corners[0]!;
  const chain = [start];
  while (chain.length < corners.length) {
    const last = chain[chain.length - 1]!;
    const next = (links.get(last) ?? []).find((corner) => !chain.includes(corner));
    if (next === undefined) return null;
    chain.push(next);
  }
  return chain;
}

/**
 * Maps each corner to the other corners it shares an open border edge with.
 *
 * @param geometry Working geometry.
 * @param corners Selected corners.
 * @returns Neighbour lists.
 */
function borderLinks(geometry: TopologyWorkingGeometry, corners: ReadonlySet<number>): Map<number, number[]> {
  const uses = new Map<string, number>();
  for (const face of geometry.faces) {
    face.vertexIndices.forEach((vertex, corner) => {
      const next = face.vertexIndices[(corner + 1) % face.vertexIndices.length]!;
      if (!corners.has(vertex) || !corners.has(next)) return;
      const key = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    });
  }
  const links = new Map<number, number[]>();
  for (const [key, count] of uses) {
    if (count !== 1) continue;
    const [a, b] = key.split(':').map(Number) as [number, number];
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  }
  return links;
}
