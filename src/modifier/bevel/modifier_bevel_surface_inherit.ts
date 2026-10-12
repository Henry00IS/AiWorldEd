import type { Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';

/**
 * Maps each derived face to the authored face it inherits, and records chamfer
 * edges for UV smear.
 *
 * @param sourceBrush Authored brush in local space.
 * @param derivedBrush Chamfered brush in the same local space.
 * @returns One record per derived face.
 */
export function modifierBevelInheritFaces(
  sourceBrush: SolidBrush,
  derivedBrush: SolidBrush,
): ModifierBevelFaceRecord[] {
  const parents = derivedBrush.faces.map((_, index) =>
    modifierBevelMatchingSourceFace(sourceBrush, derivedBrush.planes[index]),
  );
  return parents.map((parent, index) => modifierBevelRecordForFace(derivedBrush, parents, index, parent));
}

/**
 * Finds an authored face on the same plane as a derived face.
 *
 * @param sourceBrush Authored brush.
 * @param plane Derived face plane.
 * @returns Source face index, or -1.
 */
function modifierBevelMatchingSourceFace(sourceBrush: SolidBrush, plane: SolidPlane | undefined): number {
  if (!plane) return -1;
  for (let index = 0; index < sourceBrush.planes.length; index++) {
    const sourcePlane = sourceBrush.planes[index];
    if (sourcePlane && sourcePlane.isAlignedWith(plane)) return index;
  }
  return -1;
}

/**
 * Builds the inherit record for one derived face.
 *
 * @param derivedBrush Chamfered brush.
 * @param parents Parent index per derived face, -1 when generated.
 * @param faceIndex Derived face index.
 * @param parent Matched authored face, or -1.
 * @returns Face record.
 */
function modifierBevelRecordForFace(
  derivedBrush: SolidBrush,
  parents: number[],
  faceIndex: number,
  parent: number,
): ModifierBevelFaceRecord {
  if (parent >= 0) return { parentSurfaceIndex: parent, chamferEdge: null };
  const donor = modifierBevelDonorFace(derivedBrush, parents, faceIndex);
  const edge = modifierBevelSharedEdge(derivedBrush, faceIndex, donor.faceIndex);
  return {
    parentSurfaceIndex: donor.parent,
    chamferEdge: edge
      ? { pointA: edge.pointA, pointB: edge.pointB, destNormal: derivedBrush.planes[faceIndex]!.normal.clone() }
      : null,
  };
}

/**
 * Picks a neighboring derived face that still matches an authored face.
 *
 * @param derivedBrush Chamfered brush.
 * @param parents Parent index per derived face.
 * @param faceIndex Face that needs a donor.
 * @returns Donor face and its authored parent. Falls back to face 0.
 */
function modifierBevelDonorFace(
  derivedBrush: SolidBrush,
  parents: number[],
  faceIndex: number,
): { faceIndex: number; parent: number } {
  for (const neighbor of modifierBevelNeighborFaces(derivedBrush, faceIndex)) {
    const parent = parents[neighbor] ?? -1;
    if (parent >= 0) return { faceIndex: neighbor, parent };
  }
  const fallback = parents.findIndex((parent) => parent >= 0);
  return { faceIndex: Math.max(0, fallback), parent: Math.max(0, parents[Math.max(0, fallback)] ?? 0) };
}

/**
 * Lists faces that share an edge with one face.
 *
 * @param brush Brush topology.
 * @param faceIndex Face index.
 * @returns Neighbor face indices.
 */
function modifierBevelNeighborFaces(brush: SolidBrush, faceIndex: number): number[] {
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
 * Returns the local endpoints of the edge between two faces.
 *
 * @param brush Brush topology.
 * @param faceIndex First face.
 * @param neighborIndex Second face.
 * @returns Endpoints, or null when the faces do not meet.
 */
function modifierBevelSharedEdge(
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
