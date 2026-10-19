import { Vector3 } from 'three';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdgeLength } from './modifier_bevel_face_graph.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';

/**
 * Gives a tiny corner face the wall of the neighbor across its longest edge.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 */
export function modifierBevelAbsorbCornerSpecks(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
): void {
  const areas = records.map((_, index) => modifierBevelFaceArea(shell, index));
  for (let face = 0; face < records.length; face += 1) {
    modifierBevelAbsorbSpeck(shell, records, claimed, areas, face);
  }
}

/**
 * Reparents one speck when a neighbor across a long edge is much larger.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param areas Area of each face.
 * @param face Face index.
 */
function modifierBevelAbsorbSpeck(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  areas: readonly number[],
  face: number,
): void {
  if (!modifierBevelSectorFace(shell, records, claimed, face)) return;
  const neighbor = modifierBevelLargestNeighbor(shell, records, claimed, face);
  const faceArea = areas[face] ?? 0;
  const neighborArea = neighbor < 0 ? 0 : (areas[neighbor] ?? 0);
  if (neighbor < 0 || neighborArea < 1e-10 || faceArea >= neighborArea * 0.3) return;
  const parent = records[neighbor]?.parentSurfaceIndex ?? -1;
  if (!modifierBevelSpeckCanJoin(shell, records, face, parent)) return;
  const record = records[face];
  if (!record) return;
  record.parentSurfaceIndex = parent;
}

/**
 * Returns whether a speck should take a neighbor's wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Speck face.
 * @param parent Neighbor parent.
 * @returns True when that wall is closer and the speck does not meet another
 *   strip.
 */
function modifierBevelSpeckCanJoin(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
): boolean {
  if (parent < 0 || modifierBevelSpeckMeetsOtherStrip(shell, records, face, parent)) return false;
  return modifierBevelParentIsCloser(shell, records, face, parent);
}

/**
 * Returns whether a face meets a profile strip of a different wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Speck face.
 * @param parent Wall the speck would join.
 * @returns True when joining would leave the strip.
 */
function modifierBevelSpeckMeetsOtherStrip(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
): boolean {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (modifierBevelStripParentDiffers(shell, records, neighbor, parent)) return true;
  }
  return false;
}

/**
 * Returns whether a neighbor is a strip of another wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param neighbor Neighbor face.
 * @param parent Wall the speck would join.
 * @returns True when the strip belongs to a different wall.
 */
function modifierBevelStripParentDiffers(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  neighbor: number,
  parent: number,
): boolean {
  if (!modifierBevelProfileStrip(shell, neighbor)) return false;
  const stripParent = records[neighbor]?.parentSurfaceIndex ?? -1;
  return stripParent >= 0 && stripParent !== parent;
}

/**
 * Returns whether a parent is closer to a face than its current wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Speck face.
 * @param parent Candidate wall.
 * @returns True when the candidate is strictly closer.
 */
function modifierBevelParentIsCloser(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
): boolean {
  const current = records[face]?.parentSurfaceIndex ?? -1;
  if (current < 0 || current === parent) return false;
  const center = modifierBevelSpeckCenter(shell, face);
  const next = modifierBevelParentDistance(shell, records, parent, center);
  const previous = modifierBevelParentDistance(shell, records, current, center);
  return next + 1e-4 < previous;
}

/**
 * Returns the center of one face.
 *
 * @param shell Derived brush.
 * @param face Face index.
 * @returns Centroid.
 */
function modifierBevelSpeckCenter(shell: ModifierBevelDerivedBrush, face: number): Vector3 {
  const loop = shell.localBrush.faces[face];
  const points = loop ? shell.localBrush.getFaceVertices(loop) : [];
  const center = new Vector3();
  for (const point of points) center.add(point);
  return center.multiplyScalar(1 / Math.max(points.length, 1));
}

/**
 * Returns the distance from a point to an authored wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 * @param point Face center.
 * @returns Absolute distance, or a huge value when the wall is missing.
 */
function modifierBevelParentDistance(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
  point: Vector3,
): number {
  const plane = modifierBevelParentPlane(shell, records, parent);
  if (!plane) return Number.POSITIVE_INFINITY;
  return Math.abs(plane.signedDistance(point));
}

/**
 * Returns the plane of an authored face with one parent.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 * @returns Plane, or null when the face was removed.
 */
function modifierBevelParentPlane(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
): { signedDistance(point: Vector3): number } | null {
  for (let index = 0; index < records.length; index += 1) {
    const plane = modifierBevelAuthoredPlane(shell, records, parent, index);
    if (plane) return plane;
  }
  return null;
}

/**
 * Returns a plane when the face is still the authored wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param parent Authored parent.
 * @param index Face index.
 * @returns Plane, or null.
 */
function modifierBevelAuthoredPlane(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  parent: number,
  index: number,
): { signedDistance(point: Vector3): number } | null {
  const record = records[index];
  const plane = shell.localBrush.planes[index];
  if (!record || !plane || record.chamferEdge || record.cornerFace) return null;
  if (record.parentSurfaceIndex !== parent) return null;
  return plane;
}

/**
 * Returns whether a face is an unclaimed corner piece.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param face Face index.
 * @returns True when the face can join a sector.
 */
function modifierBevelSectorFace(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  face: number,
): boolean {
  if (claimed.has(face) || !records[face]?.cornerFace) return false;
  return !modifierBevelProfileStrip(shell, face);
}

/**
 * Returns the neighbor that shares the longest edge.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param face Face index.
 * @returns Neighbor face, or -1.
 */
function modifierBevelLargestNeighbor(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  face: number,
): number {
  let best = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    if (claimed.has(neighbor) || !records[neighbor]) continue;
    const length = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
    if (length <= bestLength) continue;
    best = neighbor;
    bestLength = length;
  }
  return best;
}

/**
 * Returns the area of one face.
 *
 * @param shell Derived brush.
 * @param face Face index.
 * @returns Area. Zero when the face is missing.
 */
function modifierBevelFaceArea(shell: ModifierBevelDerivedBrush, face: number): number {
  const loop = shell.localBrush.faces[face];
  if (!loop) return 0;
  return modifierBevelVertexArea(shell.localBrush.getFaceVertices(loop));
}

/**
 * Returns the area of a vertex loop.
 *
 * @param loop Face vertices.
 * @returns Area.
 */
function modifierBevelVertexArea(loop: readonly Vector3[]): number {
  const normal = new Vector3();
  for (let index = 0; index < loop.length; index += 1) modifierBevelAddArea(normal, loop, index);
  return normal.length() * 0.5;
}

/**
 * Adds one edge to an area vector.
 *
 * @param normal Accumulator.
 * @param loop Face vertices.
 * @param index Edge start.
 */
function modifierBevelAddArea(normal: Vector3, loop: readonly Vector3[], index: number): void {
  const current = loop[index];
  const next = loop[(index + 1) % loop.length];
  if (!current || !next) return;
  normal.add(new Vector3().crossVectors(current, next));
}
