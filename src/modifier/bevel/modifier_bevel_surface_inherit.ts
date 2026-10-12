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
  const records = modifierBevelSeedMatchedFaces(parents);
  modifierBevelSpreadSmear(derivedBrush, records);
  return records.map((record) => record ?? modifierBevelFallbackRecord(parents));
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
 * Seeds records for faces that still match an authored plane.
 *
 * @param derivedBrush Chamfered brush.
 * @param parents Authored face index per derived face, or -1.
 * @returns Sparse records.
 */
function modifierBevelSeedMatchedFaces(parents: number[]): (ModifierBevelFaceRecord | undefined)[] {
  return parents.map((parent) => {
    if (parent < 0) return undefined;
    return { parentSurfaceIndex: parent, smearFromDerivedIndex: -1, chamferEdge: null };
  });
}

/**
 * Spreads smear links from matched faces across generated neighbors.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records, filled in place.
 */
function modifierBevelSpreadSmear(derivedBrush: SolidBrush, records: (ModifierBevelFaceRecord | undefined)[]): void {
  const visited = new Set<number>();
  for (const start of modifierBevelChainStarts(derivedBrush, records)) {
    if (visited.has(start.face)) continue;
    modifierBevelWalkChain(derivedBrush, records, visited, start.face, start.source);
  }
  modifierBevelAssignRemainders(derivedBrush, records);
}

/**
 * Lists generated faces that share a long edge with an authored face.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @returns Chain starts, authored-face index first.
 */
function modifierBevelChainStarts(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
): { face: number; source: number; original: number }[] {
  const starts: { face: number; source: number; original: number }[] = [];
  records.forEach((record, face) => {
    if (record) return;
    const source = modifierBevelPreferredOriginal(derivedBrush, records, face);
    if (!source) return;
    starts.push({ face, source: source.face, original: source.parent });
  });
  starts.sort((left, right) => left.original - right.original || left.face - right.face);
  return starts;
}

/**
 * Picks the authored profile neighbor with the lowest face index.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param faceIndex Generated face.
 * @returns Neighbor, or null when this face is a middle segment.
 */
function modifierBevelPreferredOriginal(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
): { face: number; parent: number } | null {
  let best: { face: number; parent: number } | null = null;
  for (const neighbor of modifierBevelProfileNeighbors(derivedBrush, faceIndex)) {
    const record = records[neighbor];
    if (!record || record.chamferEdge) continue;
    if (!best || record.parentSurfaceIndex < best.parent) {
      best = { face: neighbor, parent: record.parentSurfaceIndex };
    }
  }
  return best;
}

/**
 * Assigns one strip from an authored face through each following segment.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param visited Faces already claimed by a chain.
 * @param faceIndex First generated face.
 * @param sourceIndex Face to smear from.
 */
function modifierBevelWalkChain(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
  sourceIndex: number,
): void {
  let current = faceIndex;
  let source = sourceIndex;
  while (!visited.has(current)) {
    const sourceRecord = records[source];
    if (!sourceRecord) return;
    records[current] = modifierBevelChamferRecord(derivedBrush, current, source, sourceRecord.parentSurfaceIndex);
    visited.add(current);
    const next = modifierBevelNextGenerated(derivedBrush, records, visited, current);
    if (next === null) return;
    source = current;
    current = next;
  }
}

/**
 * Returns the next unclaimed segment along the long profile edges.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param visited Faces already claimed.
 * @param faceIndex Current segment.
 * @returns Next face, or null at the end of the strip.
 */
function modifierBevelNextGenerated(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  visited: Set<number>,
  faceIndex: number,
): number | null {
  for (const neighbor of modifierBevelProfileNeighbors(derivedBrush, faceIndex)) {
    if (records[neighbor] || visited.has(neighbor)) continue;
    return neighbor;
  }
  return null;
}

/**
 * Gives any leftover generated face the longest already-textured edge.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 */
function modifierBevelAssignRemainders(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
): void {
  let changed = true;
  while (changed) changed = modifierBevelAssignOneRemainder(derivedBrush, records);
}

/**
 * Assigns one leftover face and reports whether any face was claimed.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @returns True when a face was assigned.
 */
function modifierBevelAssignOneRemainder(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
): boolean {
  for (let faceIndex = 0; faceIndex < records.length; faceIndex += 1) {
    if (records[faceIndex]) continue;
    const source = modifierBevelLongestAssignedNeighbor(derivedBrush, records, faceIndex);
    if (!source) continue;
    records[faceIndex] = modifierBevelChamferRecord(derivedBrush, faceIndex, source.face, source.parent);
    return true;
  }
  return false;
}

/**
 * Picks the assigned neighbor that shares the longest edge.
 *
 * @param derivedBrush Chamfered brush.
 * @param records Sparse records.
 * @param faceIndex Face still missing a surface.
 * @returns Neighbor, or null when none are assigned.
 */
function modifierBevelLongestAssignedNeighbor(
  derivedBrush: SolidBrush,
  records: (ModifierBevelFaceRecord | undefined)[],
  faceIndex: number,
): { face: number; parent: number } | null {
  let best: { face: number; parent: number; length: number } | null = null;
  for (const neighbor of modifierBevelNeighborFaces(derivedBrush, faceIndex)) {
    const record = records[neighbor];
    const length = modifierBevelSharedEdgeLength(derivedBrush, faceIndex, neighbor);
    if (!record || length <= (best?.length ?? -1)) continue;
    best = { face: neighbor, parent: record.parentSurfaceIndex, length };
  }
  return best ? { face: best.face, parent: best.parent } : null;
}

/**
 * Lists neighbors across this face's long edges, ignoring the short end caps.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Neighbor face indices.
 */
function modifierBevelProfileNeighbors(brush: SolidBrush, faceIndex: number): number[] {
  const measured = modifierBevelNeighborFaces(brush, faceIndex).map((neighbor) => ({
    neighbor,
    length: modifierBevelSharedEdgeLength(brush, faceIndex, neighbor),
  }));
  const longest = measured.reduce((best, entry) => Math.max(best, entry.length), 0);
  return measured.filter((entry) => entry.length >= longest * 0.5).map((entry) => entry.neighbor);
}

/**
 * Returns the length of the edge shared by two faces.
 *
 * @param brush Brush topology.
 * @param faceIndex First face.
 * @param neighborIndex Second face.
 * @returns Edge length, or 0 when the faces do not meet.
 */
function modifierBevelSharedEdgeLength(brush: SolidBrush, faceIndex: number, neighborIndex: number): number {
  const edge = modifierBevelSharedEdge(brush, faceIndex, neighborIndex);
  if (!edge) return 0;
  return edge.pointA.distanceTo(edge.pointB);
}

/**
 * Builds a smear record for a generated face.
 *
 * @param derivedBrush Chamfered brush.
 * @param faceIndex Generated face.
 * @param sourceIndex Face to smear from.
 * @param parentSurfaceIndex Authored face the texture follows.
 * @returns Face record.
 */
function modifierBevelChamferRecord(
  derivedBrush: SolidBrush,
  faceIndex: number,
  sourceIndex: number,
  parentSurfaceIndex: number,
): ModifierBevelFaceRecord {
  const edge = modifierBevelSharedEdge(derivedBrush, faceIndex, sourceIndex);
  const normal = derivedBrush.planes[faceIndex]?.normal.clone();
  return {
    parentSurfaceIndex,
    smearFromDerivedIndex: sourceIndex,
    chamferEdge: edge && normal ? { pointA: edge.pointA, pointB: edge.pointB, destNormal: normal } : null,
  };
}

/**
 * Builds a record when a generated face never met a matched face.
 *
 * @param parents Authored indices.
 * @param faceIndex Derived face index.
 * @returns Fallback record.
 */
function modifierBevelFallbackRecord(parents: number[]): ModifierBevelFaceRecord {
  const parent = parents.find((value) => value >= 0) ?? 0;
  return { parentSurfaceIndex: parent, smearFromDerivedIndex: -1, chamferEdge: null };
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
