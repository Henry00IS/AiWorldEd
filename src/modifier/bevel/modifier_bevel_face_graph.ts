import type { Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

/**
 * Lists faces that share an edge with one face.
 *
 * @param brush Brush topology.
 * @param faceIndex Face index.
 * @returns Neighbor face indices.
 */
export function modifierBevelNeighborFaces(brush: SolidBrush, faceIndex: number): number[] {
  const face = brush.faces[faceIndex];
  if (!face) return [];
  const neighbors: number[] = [];
  const last = face.firstEdge + face.edgeCount;
  for (let edgeIndex = face.firstEdge; edgeIndex < last; edgeIndex++) {
    const twin = brush.wingEdges[edgeIndex]?.twinIndex ?? -1;
    const neighbor = brush.edgeFaceIndices[twin];
    if (neighbor !== undefined && neighbor !== faceIndex) neighbors.push(neighbor);
  }
  return neighbors;
}

/**
 * Returns the length of the edge shared by two faces.
 *
 * @param brush Brush topology.
 * @param faceIndex First face.
 * @param neighborIndex Second face.
 * @returns Edge length, or 0 when the faces do not meet.
 */
export function modifierBevelSharedEdgeLength(brush: SolidBrush, faceIndex: number, neighborIndex: number): number {
  const edge = modifierBevelSharedEdge(brush, faceIndex, neighborIndex);
  if (!edge) return 0;
  return edge.pointA.distanceTo(edge.pointB);
}

/**
 * Returns the local endpoints of the edge between two faces.
 *
 * @param brush Brush topology.
 * @param faceIndex First face.
 * @param neighborIndex Second face.
 * @returns Endpoints, or null when the faces do not meet.
 */
export function modifierBevelSharedEdge(
  brush: SolidBrush,
  faceIndex: number,
  neighborIndex: number,
): { pointA: Vector3; pointB: Vector3 } | null {
  const face = brush.faces[faceIndex];
  if (!face) return null;
  const last = face.firstEdge + face.edgeCount;
  for (let edgeIndex = face.firstEdge; edgeIndex < last; edgeIndex++) {
    const edge = brush.wingEdges[edgeIndex];
    if (!edge) continue;
    if (brush.edgeFaceIndices[edge.twinIndex] !== neighborIndex) continue;
    const twin = brush.wingEdges[edge.twinIndex];
    const pointA = twin ? brush.vertices[twin.vertexIndex]?.clone() : undefined;
    const pointB = brush.vertices[edge.vertexIndex]?.clone();
    if (!pointA || !pointB) return null;
    return { pointA, pointB };
  }
  return null;
}
