import { Vector3 } from 'three';
import { modifierBevelSmearEdge, type ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';
import {
  modifierBevelCopyCornerRecord,
  modifierBevelFaceLoops,
  modifierBevelInstallFaceLoops,
  modifierBevelLoopCentroid,
} from './modifier_bevel_corner_face_rebuild.js';

/**
 * Cuts corner faces that run from one wall's strips onto another's.
 *
 * @param shell Derived brush. Split faces are rebuilt in place.
 * @param records Face records. One record is appended per cut.
 * @param claimed Faces already given to a curve.
 */
export function modifierBevelSplitSpanningCorners(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
): void {
  const loops = modifierBevelFaceLoops(shell.localBrush);
  const plans = modifierBevelSpanPlans(shell, records, claimed, loops);
  modifierBevelApplySpanPlans(shell, records, loops, plans);
}

/** One corner cut, stored before the brush is rebuilt. */
interface ModifierBevelSpanPlan {
  /** Face the cut replaces. */
  faceIndex: number;
  /** Piece loops. The first replaces the face and the rest are appended. */
  loops: Vector3[][];
  /** Authored parent of each piece, or -1. */
  parents: number[];
}

/**
 * Lists every corner cut from the current topology.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param loops Face loops captured before any cut.
 * @returns Cuts.
 */
function modifierBevelSpanPlans(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  loops: readonly Vector3[][],
): ModifierBevelSpanPlan[] {
  const plans: ModifierBevelSpanPlan[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const plan = modifierBevelSpanPlan(shell, records, claimed, loops, index);
    if (plan) plans.push(plan);
  }
  return plans;
}

/**
 * Builds one cut when the face runs onto two owners.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param claimed Faces already given to a curve.
 * @param loops Face loops captured before any cut.
 * @param faceIndex Face index.
 * @returns Cut, or null when the face stays whole.
 */
function modifierBevelSpanPlan(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  claimed: ReadonlySet<number>,
  loops: readonly Vector3[][],
  faceIndex: number,
): ModifierBevelSpanPlan | null {
  const loop = loops[faceIndex];
  if (claimed.has(faceIndex) || !loop || !modifierBevelFaceSpansOwners(shell, records, faceIndex, loop)) return null;
  const pieces = modifierBevelSpanPieces(loop, modifierBevelLoopLabels(shell, records, faceIndex, loop));
  if (!pieces) return null;
  return { faceIndex, loops: pieces.loops, parents: pieces.parents };
}

/**
 * Returns whether a corner face should be cut between its owners.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param faceIndex Face index.
 * @param loop Vertices of that face.
 * @returns True when the boundary changes owner more than once.
 */
function modifierBevelFaceSpansOwners(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  faceIndex: number,
  loop: readonly Vector3[],
): boolean {
  const record = records[faceIndex];
  const face = shell.localBrush.faces[faceIndex];
  if (!record?.cornerFace || !face || face.edgeCount < 4) return false;
  if (modifierBevelProfileStrip(shell, faceIndex)) return false;
  return modifierBevelTransitionVertices(modifierBevelLoopLabels(shell, records, faceIndex, loop)).length >= 2;
}

/**
 * Cuts on the owner chord, or fans every edge when more than two owners meet.
 *
 * @param loop Face vertices in winding order.
 * @param labels Owner of each edge, or -1.
 * @returns Pieces, or null when the face stays whole.
 */
function modifierBevelSpanPieces(
  loop: readonly Vector3[],
  labels: readonly number[],
): { loops: Vector3[][]; parents: number[] } | null {
  const cuts = modifierBevelTransitionVertices(labels);
  if (cuts.length === 2) return modifierBevelOwnerPieces(loop, labels, cuts) ?? modifierBevelFanPieces(loop, labels);
  if (cuts.length > 2) return modifierBevelFanPieces(loop, labels);
  return null;
}

/**
 * Builds the two loops and the owner of each.
 *
 * @param loop Face vertices in winding order.
 * @param labels Owner of each edge, or -1.
 * @param cuts Transition vertex indices.
 * @returns Pieces, or null when the cut would leave an open edge.
 */
function modifierBevelOwnerPieces(
  loop: readonly Vector3[],
  labels: readonly number[],
  cuts: readonly number[],
): { loops: Vector3[][]; parents: number[] } | null {
  const first = cuts[0];
  const second = cuts[1];
  if (first === undefined || second === undefined) return null;
  const left = modifierBevelSliceLoop(loop, first, second);
  const right = modifierBevelSliceLoop(loop, second, first);
  if (left.length < 3 || right.length < 3) return null;
  return {
    loops: [left, right],
    parents: [modifierBevelSliceParent(labels, first, second), modifierBevelSliceParent(labels, second, first)],
  };
}

/**
 * Fans a face to its centroid when a straight cut would leave an edge.
 *
 * @param loop Face vertices in winding order.
 * @param labels Owner of each edge, or -1.
 * @returns One triangle per edge, or null when the face has no corner.
 */
function modifierBevelFanPieces(
  loop: readonly Vector3[],
  labels: readonly number[],
): { loops: Vector3[][]; parents: number[] } | null {
  if (loop.length < 3) return null;
  const center = modifierBevelLoopCentroid(loop);
  return {
    loops: loop.map((point, index) => modifierBevelFanTriangle(loop, point, center, index)),
    parents: labels.map((label) => label),
  };
}

/**
 * Builds the triangle that keeps one outer edge.
 *
 * @param loop Face vertices.
 * @param point First vertex of the edge.
 * @param center Centroid shared by every sector.
 * @param index Edge index.
 * @returns Triangle, or an empty loop when the next vertex is missing.
 */
function modifierBevelFanTriangle(loop: readonly Vector3[], point: Vector3, center: Vector3, index: number): Vector3[] {
  const next = loop[(index + 1) % loop.length];
  if (!next) return [];
  return [point, next, center];
}

/**
 * Rebuilds every cut in one pass and folds each piece from its owner.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param loops Face loops. Piece loops are written into this list.
 * @param plans Cuts to apply.
 */
function modifierBevelApplySpanPlans(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  loops: Vector3[][],
  plans: readonly ModifierBevelSpanPlan[],
): void {
  const placed = modifierBevelPlaceSpanPlans(loops, plans);
  if (placed.length === 0 || !modifierBevelInstallFaceLoops(shell.localBrush, loops)) return;
  modifierBevelWriteSpanRecords(shell, records, placed);
}

/**
 * Writes piece loops and remembers where each owner lands.
 *
 * @param loops Face loops.
 * @param plans Cuts to apply.
 * @returns Face index, owner, and the face the record is copied from.
 */
function modifierBevelPlaceSpanPlans(
  loops: Vector3[][],
  plans: readonly ModifierBevelSpanPlan[],
): { face: number; parent: number; source: number }[] {
  const placed: { face: number; parent: number; source: number }[] = [];
  for (const plan of plans) modifierBevelPlaceSpanPlan(loops, plan, placed);
  return placed;
}

/**
 * Writes one cut into the loop list.
 *
 * @param loops Face loops.
 * @param plan Cut to apply.
 * @param placed Placement accumulator.
 */
function modifierBevelPlaceSpanPlan(
  loops: Vector3[][],
  plan: ModifierBevelSpanPlan,
  placed: { face: number; parent: number; source: number }[],
): void {
  const first = plan.loops[0];
  if (!first || first.length < 3) return;
  loops[plan.faceIndex] = first;
  placed.push({ face: plan.faceIndex, parent: plan.parents[0] ?? -1, source: plan.faceIndex });
  modifierBevelAppendSpanPieces(loops, plan, placed);
}

/**
 * Appends every piece after the first.
 *
 * @param loops Face loops.
 * @param plan Cut to apply.
 * @param placed Placement accumulator.
 */
function modifierBevelAppendSpanPieces(
  loops: Vector3[][],
  plan: ModifierBevelSpanPlan,
  placed: { face: number; parent: number; source: number }[],
): void {
  for (let index = 1; index < plan.loops.length; index += 1) {
    const piece = plan.loops[index];
    if (!piece || piece.length < 3) continue;
    placed.push({ face: loops.length, parent: plan.parents[index] ?? -1, source: plan.faceIndex });
    loops.push(piece);
  }
}

/**
 * Copies records for the placed pieces and folds each one.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param placed Piece placements.
 */
function modifierBevelWriteSpanRecords(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  placed: readonly { face: number; parent: number; source: number }[],
): void {
  const snapshot = records.slice();
  for (const item of placed) modifierBevelStoreSpanCopy(records, snapshot, item);
  for (const item of placed) modifierBevelFinishPiece(shell, records, item.face, item.parent);
}

/**
 * Stores a copied corner record at the piece index.
 *
 * @param records Face records.
 * @param snapshot Records from before the copies.
 * @param item Piece placement.
 */
function modifierBevelStoreSpanCopy(
  records: ModifierBevelFaceRecord[],
  snapshot: readonly ModifierBevelFaceRecord[],
  item: { face: number; parent: number; source: number },
): void {
  const original = snapshot[item.source];
  if (!original) return;
  const copy = modifierBevelCopyCornerRecord(original);
  if (item.face === records.length) records.push(copy);
  else records[item.face] = copy;
}

/**
 * Writes one piece's parent and the edge it folds across.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param face Piece face.
 * @param parent Authored parent, or -1 to keep the copied parent.
 */
function modifierBevelFinishPiece(
  shell: ModifierBevelDerivedBrush,
  records: ModifierBevelFaceRecord[],
  face: number,
  parent: number,
): void {
  const record = records[face];
  if (!record) return;
  const owner = parent < 0 ? record.parentSurfaceIndex : parent;
  const source = modifierBevelPieceSource(shell, face, owner);
  records[face] = modifierBevelPieceRecord(shell, record, face, owner, source);
}

/**
 * Stores the parent and smear edge on one piece.
 *
 * @param shell Derived brush.
 * @param record Copied corner record.
 * @param face Piece face.
 * @param parent Authored parent.
 * @param source Face the texture is folded from.
 * @returns Updated record.
 */
function modifierBevelPieceRecord(
  shell: ModifierBevelDerivedBrush,
  record: ModifierBevelFaceRecord,
  face: number,
  parent: number,
  source: number,
): ModifierBevelFaceRecord {
  return {
    ...record,
    parentSurfaceIndex: parent,
    smearFromDerivedIndex: source,
    chamferEdge: modifierBevelSmearEdge(shell.localBrush, face, source, record.chamferEdge),
  };
}

/**
 * Returns the longest strip or wall of one parent touching a piece.
 *
 * @param shell Derived brush.
 * @param face Piece face.
 * @param parent Authored parent.
 * @returns Neighbor face, or -1.
 */
function modifierBevelPieceSource(shell: ModifierBevelDerivedBrush, face: number, parent: number): number {
  let best = -1;
  let bestLength = 0;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, face)) {
    const length = modifierBevelOwnedTouch(shell, face, neighbor, parent);
    if (length <= bestLength) continue;
    best = neighbor;
    bestLength = length;
  }
  return best;
}

/**
 * Returns the shared length when a neighbor carries one parent.
 *
 * @param shell Derived brush.
 * @param face Piece face.
 * @param neighbor Neighbor face.
 * @param parent Authored parent.
 * @returns Edge length, or 0.
 */
function modifierBevelOwnedTouch(
  shell: ModifierBevelDerivedBrush,
  face: number,
  neighbor: number,
  parent: number,
): number {
  if (!modifierBevelNeighborOwns(shell, neighbor, parent)) return 0;
  return modifierBevelSharedEdgeLength(shell.localBrush, face, neighbor);
}

/**
 * Returns whether a neighbor is a strip or wall of one parent.
 *
 * @param shell Derived brush.
 * @param neighbor Neighbor face.
 * @param parent Authored parent.
 * @returns True when the piece should fold from that neighbor.
 */
function modifierBevelNeighborOwns(shell: ModifierBevelDerivedBrush, neighbor: number, parent: number): boolean {
  const record = shell.faces[neighbor];
  if (!record || record.parentSurfaceIndex !== parent) return false;
  return modifierBevelProfileStrip(shell, neighbor) || !record.chamferEdge;
}

/**
 * Lists the owner of each edge from one vertex to the next.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param faceIndex Face index.
 * @param loop Vertices of that face, in winding order.
 * @returns Owner per edge, or -1 when the edge meets another corner.
 */
function modifierBevelLoopLabels(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  faceIndex: number,
  loop: readonly Vector3[],
): number[] {
  return loop.map((point, index) =>
    modifierBevelEdgeParent(shell, records, faceIndex, point, loop[(index + 1) % loop.length]),
  );
}

/**
 * Returns the owner across one edge.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param faceIndex Face index.
 * @param from Edge start.
 * @param to Edge end.
 * @returns Authored parent, or -1.
 */
function modifierBevelEdgeParent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  faceIndex: number,
  from: Vector3 | undefined,
  to: Vector3 | undefined,
): number {
  if (!from || !to) return -1;
  for (const neighbor of modifierBevelNeighborFaces(shell.localBrush, faceIndex)) {
    if (!modifierBevelEdgeMatches(shell, faceIndex, neighbor, from, to)) continue;
    return modifierBevelBoundaryParent(shell, records, neighbor);
  }
  return -1;
}

/**
 * Returns whether a neighbor shares an edge with two points.
 *
 * @param shell Derived brush.
 * @param faceIndex Face index.
 * @param neighbor Neighbor face.
 * @param from Edge start.
 * @param to Edge end.
 * @returns True when the endpoints match.
 */
function modifierBevelEdgeMatches(
  shell: ModifierBevelDerivedBrush,
  faceIndex: number,
  neighbor: number,
  from: Vector3,
  to: Vector3,
): boolean {
  const edge = modifierBevelSharedEdge(shell.localBrush, faceIndex, neighbor);
  if (!edge) return false;
  const forward = modifierBevelPointOn(edge.pointA, from) && modifierBevelPointOn(edge.pointB, to);
  const reverse = modifierBevelPointOn(edge.pointA, to) && modifierBevelPointOn(edge.pointB, from);
  return forward || reverse;
}

/**
 * Returns whether two points are the same welded vertex.
 *
 * @param point First point.
 * @param target Second point.
 * @returns True when the points coincide.
 */
function modifierBevelPointOn(point: Vector3, target: Vector3): boolean {
  return point.distanceToSquared(target) <= 1e-8;
}

/**
 * Returns the parent of a strip or authored wall.
 *
 * @param shell Derived brush.
 * @param records Face records.
 * @param neighbor Neighbor face.
 * @returns Authored parent, or -1 when the neighbor is another corner.
 */
function modifierBevelBoundaryParent(
  shell: ModifierBevelDerivedBrush,
  records: readonly ModifierBevelFaceRecord[],
  neighbor: number,
): number {
  const record = records[neighbor];
  if (!record) return -1;
  if (modifierBevelProfileStrip(shell, neighbor) || !record.chamferEdge) return record.parentSurfaceIndex;
  return -1;
}

/**
 * Lists vertices where the boundary owner changes.
 *
 * @param labels Owner of each edge, or -1.
 * @returns Vertex indices.
 */
function modifierBevelTransitionVertices(labels: readonly number[]): number[] {
  const found: number[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    if (modifierBevelLabelChanges(labels, index)) found.push(index);
  }
  return found;
}

/**
 * Returns whether the edge at a vertex starts a new owner.
 *
 * @param labels Owner of each edge, or -1.
 * @param index Vertex index.
 * @returns True when the previous labeled owner differs.
 */
function modifierBevelLabelChanges(labels: readonly number[], index: number): boolean {
  const here = labels[index] ?? -1;
  const previous = modifierBevelPreviousLabel(labels, index);
  return here >= 0 && previous >= 0 && previous !== here;
}

/**
 * Returns the nearest labeled owner before a vertex.
 *
 * @param labels Owner of each edge, or -1.
 * @param index Vertex index.
 * @returns Owner, or -1 when every earlier edge is unlabeled.
 */
function modifierBevelPreviousLabel(labels: readonly number[], index: number): number {
  for (let step = 1; step < labels.length; step += 1) {
    const label = labels[(index - step + labels.length) % labels.length] ?? -1;
    if (label >= 0) return label;
  }
  return -1;
}

/**
 * Copies the vertices from one index until another, including both.
 *
 * @param loop Face vertices.
 * @param start First vertex index.
 * @param end Last vertex index.
 * @returns Loop slice in winding order.
 */
function modifierBevelSliceLoop(loop: readonly Vector3[], start: number, end: number): Vector3[] {
  const slice: Vector3[] = [];
  let index = start;
  const first = loop[index];
  if (!first) return slice;
  slice.push(first);
  while (index !== end && slice.length <= loop.length) {
    index = (index + 1) % loop.length;
    const point = loop[index];
    if (point) slice.push(point);
  }
  return slice;
}

/**
 * Returns the owner of the original edges in one slice.
 *
 * @param labels Owner of each edge, or -1.
 * @param start First vertex index.
 * @param end Last vertex index.
 * @returns Authored parent, or -1 when the slice has no labeled edge.
 */
function modifierBevelSliceParent(labels: readonly number[], start: number, end: number): number {
  let index = start;
  while (index !== end) {
    const label = labels[index] ?? -1;
    if (label >= 0) return label;
    index = (index + 1) % labels.length;
  }
  return -1;
}
