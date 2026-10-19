import { Vector3 } from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import { modifierBevelSmearEdge } from './modifier_bevel_face_record.js';
import {
  modifierBevelCopyCornerRecord,
  modifierBevelInstallFaceLoops,
  modifierBevelLoopCentroid,
} from './modifier_bevel_corner_face_rebuild.js';
import type { ModifierBevelBisectPlan } from './modifier_bevel_corner_face_bisect.js';

/**
 * Rebuilds the brush from the cuts and stores each piece's wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops.
 * @param plans Cuts to apply.
 */
export function modifierBevelApplyBisectPlans(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  loops: Vector3[][],
  plans: readonly ModifierBevelBisectPlan[],
): void {
  if (plans.length === 0) return;
  const added = modifierBevelNewCutPoints(loops, plans);
  modifierBevelStampPoints(shell, loops, plans);
  const placed = modifierBevelPlaceBisectPlans(loops, plans);
  modifierBevelStampIntoLoops(loops, added);
  modifierBevelCollapseLoops(loops);
  if (placed.length === 0 || !modifierBevelInstallFaceLoops(shell.localBrush, loops)) return;
  modifierBevelWriteBisectRecords(shell, records, placed);
}

/**
 * Inserts cut points into the neighbor across each split edge.
 *
 * @param shell Derived brush.
 * @param loops Face loops.
 * @param plans Cuts to apply.
 * @returns Number of inserted points.
 */
function modifierBevelStampPoints(
  shell: ModifierBevelDerivedBrush,
  loops: Vector3[][],
  plans: readonly ModifierBevelBisectPlan[],
): number {
  let count = 0;
  for (const plan of plans) count += modifierBevelStampPlan(shell, loops, plan);
  return count;
}

/**
 * Lists vertices the cuts add to the original faces.
 *
 * @param loops Face loops before the cuts are written.
 * @param plans Cuts to apply.
 * @returns New vertices.
 */
function modifierBevelNewCutPoints(loops: readonly Vector3[][], plans: readonly ModifierBevelBisectPlan[]): Vector3[] {
  const points: Vector3[] = [];
  for (const plan of plans) modifierBevelCollectCutPoints(points, loops[plan.faceIndex], plan);
  return points;
}

/**
 * Stores cut vertices that were not already on the face.
 *
 * @param points Accumulator.
 * @param original Loop before the cut.
 * @param plan Cut being applied.
 */
function modifierBevelCollectCutPoints(
  points: Vector3[],
  original: readonly Vector3[] | undefined,
  plan: ModifierBevelBisectPlan,
): void {
  if (!original) return;
  for (const piece of plan.loops) modifierBevelCollectPiecePoints(points, original, piece);
}

/**
 * Stores one piece's vertices that the original face did not have.
 *
 * @param points Accumulator.
 * @param original Loop before the cut.
 * @param piece Piece loop.
 */
function modifierBevelCollectPiecePoints(
  points: Vector3[],
  original: readonly Vector3[],
  piece: readonly Vector3[],
): void {
  for (const point of piece) {
    if (modifierBevelLoopHasPoint(original, point) || modifierBevelLoopHasPoint(points, point)) continue;
    points.push(point.clone());
  }
}

/**
 * Inserts cut vertices into every loop whose edge still contains them.
 *
 * @param loops Face loops after the pieces have been written.
 * @param points Cut vertices.
 */
function modifierBevelStampIntoLoops(loops: readonly Vector3[][], points: readonly Vector3[]): void {
  for (const point of points) modifierBevelStampPointIntoLoops(loops, point);
}

/**
 * Inserts one cut vertex into every loop edge that contains it.
 *
 * @param loops Face loops.
 * @param point Cut vertex.
 */
function modifierBevelStampPointIntoLoops(loops: readonly Vector3[][], point: Vector3): void {
  for (const loop of loops) {
    if (!loop || modifierBevelLoopHasPoint(loop, point)) continue;
    modifierBevelInsertOnEdge(loop, point);
  }
}

/**
 * Inserts one cut's new points into the neighbor that shares their edge.
 *
 * @param shell Derived brush.
 * @param loops Face loops.
 * @param plan Cut to apply.
 * @returns Number of inserted points.
 */
function modifierBevelStampPlan(
  shell: ModifierBevelDerivedBrush,
  loops: Vector3[][],
  plan: ModifierBevelBisectPlan,
): number {
  const original = loops[plan.faceIndex];
  if (!original) return 0;
  let count = 0;
  for (const piece of plan.loops) {
    for (const point of piece) count += modifierBevelStampPoint(shell, loops, plan.faceIndex, original, point);
  }
  return count;
}

/**
 * Inserts a point into the neighbor across the edge that contains it.
 *
 * @param shell Derived brush.
 * @param loops Face loops.
 * @param face Face being cut.
 * @param original Loop before the cut.
 * @param point Cut vertex.
 * @returns 1 when a neighbor changed, otherwise 0.
 */
function modifierBevelStampPoint(
  shell: ModifierBevelDerivedBrush,
  loops: Vector3[][],
  face: number,
  original: readonly Vector3[],
  point: Vector3,
): number {
  if (modifierBevelLoopHasPoint(original, point)) return 0;
  const neighbor = modifierBevelNeighborOnPoint(shell, face, point);
  const loop = neighbor >= 0 ? loops[neighbor] : undefined;
  if (!loop || modifierBevelLoopHasPoint(loop, point)) return 0;
  return modifierBevelInsertOnEdge(loop, point) ? 1 : 0;
}

/**
 * Returns the neighbor whose shared edge contains a point.
 *
 * @param shell Derived brush.
 * @param face Face being cut.
 * @param point Cut vertex.
 * @returns Neighbor face, or -1.
 */
function modifierBevelNeighborOnPoint(shell: ModifierBevelDerivedBrush, face: number, point: Vector3): number {
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const edge = modifierBevelSharedEdge(shell.localBrush, face, neighbor);
    if (edge && modifierBevelOnSegment(edge.pointA, edge.pointB, point)) return neighbor;
  }
  return -1;
}

/**
 * Returns whether a loop already contains a point.
 *
 * @param loop Face vertices.
 * @param point Candidate.
 * @returns True when a vertex matches.
 */
function modifierBevelLoopHasPoint(loop: readonly Vector3[], point: Vector3): boolean {
  return loop.some((vertex) => vertex.distanceToSquared(point) <= 1e-8);
}

/**
 * Inserts a point into the edge that contains it.
 *
 * @param loop Face vertices, mutated when the point lies on an edge.
 * @param point Cut vertex.
 * @returns True when the point was inserted.
 */
function modifierBevelInsertOnEdge(loop: Vector3[], point: Vector3): boolean {
  for (let index = 0; index < loop.length; index += 1) {
    const start = loop[index];
    const end = loop[(index + 1) % loop.length];
    if (!start || !end || !modifierBevelOnSegment(start, end, point)) continue;
    loop.splice(index + 1, 0, point.clone());
    return true;
  }
  return false;
}

/**
 * Returns whether a point lies on a segment, excluding the endpoints.
 *
 * @param start Segment start.
 * @param end Segment end.
 * @param point Candidate.
 * @returns True when the point is strictly inside the segment.
 */
function modifierBevelOnSegment(start: Vector3, end: Vector3, point: Vector3): boolean {
  const direction = end.clone().sub(start);
  const length = direction.lengthSq();
  if (length < 1e-12) return false;
  const travel = point.clone().sub(start).dot(direction) / length;
  if (travel <= 1e-5 || travel >= 1 - 1e-5) return false;
  return point.distanceToSquared(start.clone().addScaledVector(direction, travel)) <= 1e-8;
}

/**
 * Writes piece loops and remembers where each wall lands.
 *
 * @param loops Face loops.
 * @param plans Cuts to apply.
 * @returns Placements.
 */
function modifierBevelPlaceBisectPlans(
  loops: Vector3[][],
  plans: readonly ModifierBevelBisectPlan[],
): { face: number; parent: number; source: number }[] {
  const placed: { face: number; parent: number; source: number }[] = [];
  for (const plan of plans) modifierBevelPlaceBisectPlan(loops, plan, placed);
  return placed;
}

/**
 * Writes one cut into the loop list.
 *
 * @param loops Face loops.
 * @param plan Cut to apply.
 * @param placed Placement accumulator.
 */
function modifierBevelPlaceBisectPlan(
  loops: Vector3[][],
  plan: ModifierBevelBisectPlan,
  placed: { face: number; parent: number; source: number }[],
): void {
  const first = plan.loops[0];
  if (!first || first.length < 3) return;
  loops[plan.faceIndex] = first;
  placed.push({ face: plan.faceIndex, parent: plan.parents[0] ?? -1, source: plan.faceIndex });
  for (let index = 1; index < plan.loops.length; index += 1) {
    const piece = plan.loops[index];
    if (!piece || piece.length < 3) continue;
    placed.push({ face: loops.length, parent: plan.parents[index] ?? -1, source: plan.faceIndex });
    loops.push(piece);
  }
}

/**
 * Copies records for the placed pieces.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param placed Piece placements.
 */
function modifierBevelWriteBisectRecords(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  placed: readonly { face: number; parent: number; source: number }[],
): void {
  const snapshot = records.slice();
  for (const item of placed) modifierBevelStoreBisectCopy(records, snapshot, item);
  modifierBevelExtendGirders(shell, placed);
  shell.faces = records;
  modifierBevelRetargetPieceSmears(shell, records, placed);
}

/**
 * Points a cut piece at a neighbor that belongs to the same wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param placed Piece placements.
 */
function modifierBevelRetargetPieceSmears(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  placed: readonly { face: number; parent: number; source: number }[],
): void {
  for (const item of placed) modifierBevelRetargetPieceSmear(shell, records, item.face);
}

/**
 * Folds any face whose smear source belongs to another wall back onto its own.
 *
 * @param shell Derived brush.
 * @param records Face records.
 */
export function modifierBevelRetargetForeignSmears(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
): void {
  for (let face = 0; face < records.length; face += 1) modifierBevelRetargetPieceSmear(shell, records, face);
}

/**
 * Folds one piece from its own wall when the copied source belongs to another.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Piece face.
 */
function modifierBevelRetargetPieceSmear(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  face: number,
): void {
  const record = records[face];
  if (!record?.chamferEdge && !record?.cornerFace) return;
  if (!record || modifierBevelSmearParentMatches(records, record)) return;
  const source = modifierBevelSameParentSmear(shell, records, face, record.parentSurfaceIndex);
  if (source < 0) return;
  records[face] = modifierBevelSmearFrom(shell, record, face, source);
}

/**
 * Returns whether the smear source already uses this face's wall.
 *
 * @param records Face records.
 * @param record Face being checked.
 * @returns True when the source parent matches.
 */
function modifierBevelSmearParentMatches(
  records: readonly ModifierBevelFaceRecord[],
  record: ModifierBevelFaceRecord,
): boolean {
  if (record.smearFromDerivedIndex < 0) return true;
  const source = records[record.smearFromDerivedIndex];
  if (!source) return true;
  return source.parentSurfaceIndex === record.parentSurfaceIndex;
}

/**
 * Stores a smear link across the shared edge.
 *
 * @param shell Derived brush.
 * @param record Previous record.
 * @param face Piece face.
 * @param source Face to fold from.
 * @returns Updated record.
 */
function modifierBevelSmearFrom(
  shell: ModifierBevelDerivedBrush,
  record: ModifierBevelFaceRecord,
  face: number,
  source: number,
): ModifierBevelFaceRecord {
  return {
    ...record,
    smearFromDerivedIndex: source,
    chamferEdge: modifierBevelSmearEdge(shell.localBrush, face, source, record.chamferEdge),
  };
}

/**
 * Finds the same-wall neighbor a piece should fold from.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Piece face.
 * @param parent Authored parent.
 * @returns Neighbor face, or -1.
 */
function modifierBevelSameParentSmear(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
): number {
  let best = -1;
  let bestRank = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const chosen = modifierBevelConsiderSmearSource(shell, records, face, parent, neighbor, best, bestRank, bestLength);
    best = chosen.face;
    bestRank = chosen.rank;
    bestLength = chosen.length;
  }
  return best;
}

/**
 * Keeps the better same-wall smear source.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Piece face.
 * @param parent Authored parent.
 * @param neighbor Candidate neighbor.
 * @param best Current source.
 * @param bestRank Rank of the current source.
 * @param bestLength Shared length of the current source.
 * @returns Updated source.
 */
function modifierBevelConsiderSmearSource(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  face: number,
  parent: number,
  neighbor: number,
  best: number,
  bestRank: number,
  bestLength: number,
): { face: number; rank: number; length: number } {
  const record = records[neighbor];
  if (!record || record.parentSurfaceIndex !== parent) return { face: best, rank: bestRank, length: bestLength };
  const length = modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
  const rank = modifierBevelSmearRank(record);
  if (length <= 0 || rank < bestRank || (rank === bestRank && length <= bestLength)) {
    return { face: best, rank: bestRank, length: bestLength };
  }
  return { face: neighbor, rank, length };
}

/**
 * Ranks a smear source so an authored wall wins over a strip.
 *
 * @param record Neighbor record.
 * @returns 2 for an authored wall, 1 for a strip, 0 for a corner.
 */
function modifierBevelSmearRank(record: ModifierBevelFaceRecord): number {
  if (!record.chamferEdge && !record.cornerFace) return 2;
  if (!record.cornerFace) return 1;
  return 0;
}

/**
 * Drops loop vertices that weld into their neighbor.
 *
 * @param loops Face loops.
 */
function modifierBevelCollapseLoops(loops: Vector3[][]): void {
  for (let index = 0; index < loops.length; index += 1) {
    const loop = loops[index];
    if (!loop) continue;
    const collapsed = modifierBevelCollapseLoop(loop);
    if (collapsed.length >= 3) loops[index] = collapsed;
  }
}

/**
 * Removes consecutive vertices closer than the weld.
 *
 * @param loop Face vertices.
 * @returns Collapsed loop.
 */
function modifierBevelCollapseLoop(loop: readonly Vector3[]): Vector3[] {
  const result: Vector3[] = [];
  for (const point of loop) modifierBevelPushWelded(result, point);
  const first = result[0];
  const last = result[result.length - 1];
  if (first && last && result.length > 1 && first.distanceToSquared(last) <= 1e-8) result.pop();
  return result;
}

/**
 * Appends a point when it does not weld into the previous vertex.
 *
 * @param result Loop accumulator.
 * @param point Candidate vertex.
 */
function modifierBevelPushWelded(result: Vector3[], point: Vector3): void {
  const last = result[result.length - 1];
  if (last && last.distanceToSquared(point) <= 1e-8) return;
  result.push(point);
}

/**
 * Gives a new piece the edge chart of the face it was cut from.
 *
 * @param shell Derived brush.
 * @param placed Piece placements.
 */
function modifierBevelExtendGirders(
  shell: ModifierBevelDerivedBrush,
  placed: readonly { face: number; parent: number; source: number }[],
): void {
  for (const item of placed) modifierBevelPushGirder(shell, item.face, item.source);
}

/**
 * Appends a girder index when the piece is a new face.
 *
 * @param shell Derived brush.
 * @param face Face index.
 * @param source Face the piece was cut from.
 */
function modifierBevelPushGirder(shell: ModifierBevelDerivedBrush, face: number, source: number): void {
  if (face < shell.girderOfFace.length) return;
  shell.girderOfFace.push(shell.girderOfFace[source] ?? -1);
}

/**
 * Stores a copied corner record on the wall chosen for the piece.
 *
 * @param records Face records.
 * @param snapshot Records from before the copies.
 * @param item Piece placement.
 */
function modifierBevelStoreBisectCopy(
  records: ModifierBevelFaceRecord[],
  snapshot: readonly ModifierBevelFaceRecord[],
  item: { face: number; parent: number; source: number },
): void {
  const original = snapshot[item.source];
  if (!original) return;
  const copy = modifierBevelCopyCornerRecord(original);
  if (item.parent >= 0) copy.parentSurfaceIndex = item.parent;
  if (item.face === records.length) records.push(copy);
  else records[item.face] = copy;
}

/**
 * Returns the wall closest to a piece.
 *
 * @param piece Piece vertices.
 * @param walls Wall planes.
 * @returns Authored parent, or -1 when no wall is known.
 */
export function modifierBevelPieceWall(
  piece: readonly Vector3[],
  walls: readonly { parent: number; plane: SolidPlane }[],
): number {
  const center = modifierBevelLoopCentroid(piece);
  let best = walls[0]?.parent ?? -1;
  let bestDistance = Number.NEGATIVE_INFINITY;
  for (const wall of walls) {
    const distance = wall.plane.signedDistance(center);
    if (distance <= bestDistance) continue;
    best = wall.parent;
    bestDistance = distance;
  }
  return best;
}
