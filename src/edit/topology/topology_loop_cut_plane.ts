import * as THREE from 'three';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from './topology_epsilon.js';
import type { TopologyWorkingEdge } from './topology_working_edge_key.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import { topologyWorkingVertexRead } from './topology_working_vertex_read.js';

/** One plane-edge crossing used by loop cut. */
export interface TopologyLoopCutCrossing {
  /** Undirected edge key. */
  edgeKey: string;
  /** First endpoint. */
  vertexA: number;
  /** Second endpoint. */
  vertexB: number;
  /** Parameter along A→B. */
  parameter: number;
}

/**
 * Builds a plane through a point on an edge, perpendicular to that edge.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param parameter Point parameter on the edge.
 * @returns Plane, or null when the edge is degenerate.
 */
export function createLoopCutSlicePlane(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  parameter: number,
): THREE.Plane | null {
  const start = topologyWorkingVertexRead(geometry, vertexA);
  const end = topologyWorkingVertexRead(geometry, vertexB);
  if (!start || !end) {
    return null;
  }
  const direction = end.clone().sub(start);
  if (direction.lengthSq() < 1e-12) {
    return null;
  }
  const point = start.clone().lerp(end, parameter);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(direction.normalize(), point);
}

/**
 * Collects interior edge crossings of a plane.
 *
 * @param geometry Working geometry.
 * @param edges Undirected edges.
 * @param plane Slice plane.
 * @returns Interior crossings.
 */
export function collectLoopCutPlaneCrossings(
  geometry: TopologyWorkingGeometry,
  edges: readonly TopologyWorkingEdge[],
  plane: THREE.Plane,
): TopologyLoopCutCrossing[] {
  const crossings: TopologyLoopCutCrossing[] = [];
  for (const edge of edges) {
    const crossing = intersectWorkingEdgeWithPlane(geometry, edge, plane);
    if (crossing) {
      crossings.push(crossing);
    }
  }
  return crossings;
}

/**
 * Intersects one undirected edge with a plane.
 *
 * @param geometry Working geometry.
 * @param edge Edge to test.
 * @param plane Slice plane.
 * @returns Interior crossing, or null.
 */
function intersectWorkingEdgeWithPlane(
  geometry: TopologyWorkingGeometry,
  edge: TopologyWorkingEdge,
  plane: THREE.Plane,
): TopologyLoopCutCrossing | null {
  const start = topologyWorkingVertexRead(geometry, edge.vertexA);
  const end = topologyWorkingVertexRead(geometry, edge.vertexB);
  if (!start || !end) {
    return null;
  }
  const parameter = planeEdgeIntersectionParameter(plane, start, end);
  if (parameter === null) {
    return null;
  }
  return {
    edgeKey: edge.edgeKey,
    vertexA: edge.vertexA,
    vertexB: edge.vertexB,
    parameter,
  };
}

/**
 * Returns the interior intersection parameter of a segment against a plane.
 *
 * @param plane Slice plane.
 * @param start Segment start.
 * @param end Segment end.
 * @returns Parameter in (ε, 1-ε), or null.
 */
function planeEdgeIntersectionParameter(plane: THREE.Plane, start: THREE.Vector3, end: THREE.Vector3): number | null {
  const distanceA = plane.distanceToPoint(start);
  const distanceB = plane.distanceToPoint(end);
  if (distanceA * distanceB > 0) {
    return null;
  }
  const denom = distanceA - distanceB;
  if (Math.abs(denom) < 1e-20) {
    return null;
  }
  const parameter = distanceA / denom;
  if (parameter <= TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON) {
    return null;
  }
  if (parameter >= 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON) {
    return null;
  }
  return parameter;
}
