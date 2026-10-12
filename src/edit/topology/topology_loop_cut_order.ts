import * as THREE from 'three';
import type { TopologyLoopCutCrossing } from './topology_loop_cut_plane.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** One crossing with its world-space sample. */
interface ScoredLoopCutCrossing {
  crossing: TopologyLoopCutCrossing;
  point: THREE.Vector3;
  angle: number;
}

/**
 * Orders loop-cut crossings around the slice plane so the preview is a simple
 * convex belt instead of a bow-tie.
 *
 * @param geometry Working geometry.
 * @param crossings Unordered crossings.
 * @param plane Slice plane.
 * @returns Crossings sorted by angle around the belt centroid.
 */
export function orderLoopCutCrossingsAroundPlane(
  geometry: TopologyWorkingGeometry,
  crossings: readonly TopologyLoopCutCrossing[],
  plane: THREE.Plane,
): TopologyLoopCutCrossing[] {
  const scored = collectScoredCrossings(geometry, crossings);
  if (scored.length < 3) {
    return crossings.slice();
  }
  const center = averageScoredPoints(scored);
  const basis = buildPlaneTangentBasis(plane.normal);
  assignCrossingAngles(scored, center, basis);
  scored.sort((left, right) => left.angle - right.angle);
  return scored.map((entry) => entry.crossing);
}

/**
 * Collects crossings that have valid interpolated world points.
 *
 * @param geometry Working geometry.
 * @param crossings Source crossings.
 * @returns Scored crossings without angles.
 */
function collectScoredCrossings(
  geometry: TopologyWorkingGeometry,
  crossings: readonly TopologyLoopCutCrossing[],
): ScoredLoopCutCrossing[] {
  const scored: ScoredLoopCutCrossing[] = [];
  for (const crossing of crossings) {
    const point = interpolateCrossingPoint(geometry, crossing);
    if (point) {
      scored.push({ crossing, point, angle: 0 });
    }
  }
  return scored;
}

/**
 * Interpolates a crossing along its source edge.
 *
 * @param geometry Working geometry.
 * @param crossing Crossing.
 * @returns Local point, or null.
 */
function interpolateCrossingPoint(
  geometry: TopologyWorkingGeometry,
  crossing: TopologyLoopCutCrossing,
): THREE.Vector3 | null {
  const start = topologyWorkingVertexRead(geometry, crossing.vertexA);
  const end = topologyWorkingVertexRead(geometry, crossing.vertexB);
  if (!start || !end) {
    return null;
  }
  return start.clone().lerp(end, crossing.parameter);
}

/**
 * Averages scored crossing points.
 *
 * @param scored Scored crossings.
 * @returns Centroid.
 */
function averageScoredPoints(scored: readonly ScoredLoopCutCrossing[]): THREE.Vector3 {
  const center = new THREE.Vector3();
  for (const entry of scored) {
    center.add(entry.point);
  }
  return center.multiplyScalar(1 / scored.length);
}

/**
 * Writes atan2 angles onto scored crossings.
 *
 * @param scored Scored crossings.
 * @param center Belt centroid.
 * @param basis Plane tangent frame.
 */
function assignCrossingAngles(
  scored: ScoredLoopCutCrossing[],
  center: THREE.Vector3,
  basis: { u: THREE.Vector3; v: THREE.Vector3 },
): void {
  const relative = new THREE.Vector3();
  for (const entry of scored) {
    relative.subVectors(entry.point, center);
    entry.angle = Math.atan2(relative.dot(basis.v), relative.dot(basis.u));
  }
}

/**
 * Builds a tangent frame for angular sorting on a plane.
 *
 * @param normal Plane normal.
 * @returns Orthonormal U/V axes.
 */
function buildPlaneTangentBasis(normal: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const unit = normal.clone().normalize();
  const seed = Math.abs(unit.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(seed, unit).normalize();
  const v = new THREE.Vector3().crossVectors(unit, u).normalize();
  return { u, v };
}
