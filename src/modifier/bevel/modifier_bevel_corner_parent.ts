import { Matrix4, Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { ModifierBevelUvSpace } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvFlow,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import {
  modifierBevelRankParents,
  modifierBevelSpacedNormalDot,
  modifierBevelSpacedPlaneDistance,
  type ModifierBevelParentScore,
} from './modifier_bevel_inherit_score.js';
import {
  modifierBevelNeighborFaces,
  modifierBevelSharedEdge,
  modifierBevelSharedEdgeLength,
} from './modifier_bevel_face_graph.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';

/** What a generated face knows while it compares two parents. */
export interface ModifierBevelParentChoice {
  /** Chamfered brush. */
  derived: SolidBrush;
  /** Authored planes in the chamfer's space. */
  sourcePlanes: readonly (SolidPlane | undefined)[];
  /** UV flow. */
  mode: ModifierBevelUvFlow;
  /** Authored face scores in face order. */
  scores: readonly ModifierBevelParentScore[];
  /** Map axes or brush axes. */
  space: ModifierBevelUvSpace;
  /** Brush mesh world matrix. */
  matrix: Matrix4;
}

/**
 * Returns whether the left parent should come before the right one.
 *
 * @param choice Choice state.
 * @param faceIndex Generated face being decided.
 * @param left Left authored neighbor.
 * @param right Right authored neighbor.
 * @returns Negative when left wins.
 */
export function modifierBevelPreferParent(
  choice: ModifierBevelParentChoice,
  faceIndex: number,
  left: { face: number; parent: number },
  right: { face: number; parent: number },
): number {
  if (choice.mode === MODIFIER_VOLUME_BEVEL_UV_MAJORITY)
    return modifierBevelLongerBorder(choice.derived, faceIndex, left, right);
  if (choice.mode === MODIFIER_VOLUME_BEVEL_UV_NEAREST)
    return modifierBevelCloserPlane(choice, faceIndex, left.parent, right.parent);
  if (choice.mode === MODIFIER_VOLUME_BEVEL_UV_ALIGNED)
    return modifierBevelCloserNormal(choice, faceIndex, left.parent, right.parent);
  return modifierBevelRankParents(choice.mode, choice.scores, left.parent, right.parent, choice.space, choice.matrix);
}

/**
 * Gives each corner island one parent from the walls that border it.
 *
 * @param choice Choice state.
 * @param records Sparse records, updated in place.
 */
export function modifierBevelUnifyCornerParents(
  choice: ModifierBevelParentChoice,
  records: (ModifierBevelFaceRecord | undefined)[],
): void {
  const members = modifierBevelCornerMembers(choice, records);
  const seen = new Set<number>();
  for (const start of members) modifierBevelUnifyFrom(choice, records, members, seen, start);
}

/**
 * Unifies one corner when it has not been visited.
 *
 * @param choice Choice state.
 * @param records Sparse records.
 * @param members Faces that belong in some corner.
 * @param seen Faces already unified.
 * @param start Face index.
 */
function modifierBevelUnifyFrom(
  choice: ModifierBevelParentChoice,
  records: (ModifierBevelFaceRecord | undefined)[],
  members: ReadonlySet<number>,
  seen: Set<number>,
  start: number,
): void {
  if (seen.has(start)) return;
  const component = modifierBevelCornerComponent(choice.derived, members, start);
  for (const faceIndex of component) seen.add(faceIndex);
  modifierBevelPaintComponent(choice, records, component);
}

/**
 * Lists generated faces that close a three-wall corner.
 *
 * @param choice Choice state.
 * @param records Sparse records.
 * @returns Member face indices.
 */
function modifierBevelCornerMembers(
  choice: ModifierBevelParentChoice,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
): Set<number> {
  const members = new Set<number>();
  records.forEach((record, index) => modifierBevelConsiderMember(choice, record, index, members));
  return members;
}

/**
 * Adds one face when it is a corner cap or a trihedral patch.
 *
 * @param choice Choice state.
 * @param record Face record.
 * @param index Face index.
 * @param members Member set.
 */
function modifierBevelConsiderMember(
  choice: ModifierBevelParentChoice,
  record: ModifierBevelFaceRecord | undefined,
  index: number,
  members: Set<number>,
): void {
  if (!record?.chamferEdge && !record?.cornerFace) return;
  if (record.cornerFace) {
    members.add(index);
    return;
  }
  if (!modifierBevelTrihedral(choice.derived.planes[index]?.normal)) return;
  if (modifierBevelIsWallStrip(choice.derived, index)) return;
  members.add(index);
}

/**
 * Returns whether a face is a long strip running between two walls.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns True when the two long edges are nearly parallel.
 */
function modifierBevelIsWallStrip(brush: SolidBrush, faceIndex: number): boolean {
  const ranked = modifierBevelEdgeDirections(brush, faceIndex);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second || first.length <= 1e-8) return false;
  if (first.length < modifierBevelShortestEdge(ranked) * 2) return false;
  return Math.abs(first.direction.dot(second.direction)) >= 0.9;
}

/**
 * Lists face edges from longest to shortest.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Edge directions.
 */
function modifierBevelEdgeDirections(brush: SolidBrush, faceIndex: number): { length: number; direction: Vector3 }[] {
  const edges: { length: number; direction: Vector3 }[] = [];
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    const edge = modifierBevelSharedEdge(brush, faceIndex, neighbor);
    if (!edge) continue;
    const direction = edge.pointB.clone().sub(edge.pointA);
    const length = direction.length();
    if (length <= 1e-8) continue;
    edges.push({ length, direction: direction.multiplyScalar(1 / length) });
  }
  edges.sort((left, right) => right.length - left.length);
  return edges;
}

/**
 * Returns the shortest measured edge.
 *
 * @param edges Edge directions.
 * @returns Shortest length, or 0 when there are none.
 */
function modifierBevelShortestEdge(edges: readonly { length: number }[]): number {
  let shortest = Number.POSITIVE_INFINITY;
  for (const edge of edges) shortest = Math.min(shortest, edge.length);
  return Number.isFinite(shortest) ? shortest : 0;
}

/**
 * Returns whether a normal points between three axes.
 *
 * @param normal Face normal, or undefined.
 * @returns True when every axis still has a share of the normal.
 */
function modifierBevelTrihedral(normal: Vector3 | undefined): boolean {
  if (!normal) return false;
  const axes = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].sort((left, right) => left - right);
  const smallest = axes[0];
  return smallest !== undefined && smallest > 0.25;
}

/**
 * Lists the corner faces connected to a start.
 *
 * @param brush Chamfered brush.
 * @param members Corner member set.
 * @param start Start face.
 * @returns Component.
 */
function modifierBevelCornerComponent(brush: SolidBrush, members: ReadonlySet<number>, start: number): number[] {
  const component: number[] = [];
  const pending = [start];
  const seen = new Set<number>([start]);
  while (pending.length > 0) modifierBevelTakeCornerMember(brush, members, component, pending, seen);
  return component;
}

/**
 * Claims one queued corner face and queues its corner neighbors.
 *
 * @param brush Chamfered brush.
 * @param members Corner member set.
 * @param component Component accumulator.
 * @param pending Faces still to visit.
 * @param seen Faces already queued.
 */
function modifierBevelTakeCornerMember(
  brush: SolidBrush,
  members: ReadonlySet<number>,
  component: number[],
  pending: number[],
  seen: Set<number>,
): void {
  const faceIndex = pending.shift();
  if (faceIndex === undefined) return;
  component.push(faceIndex);
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    if (!members.has(neighbor) || seen.has(neighbor)) continue;
    seen.add(neighbor);
    pending.push(neighbor);
  }
}

/**
 * Paints every face in a component from the winning border.
 *
 * @param choice Choice state.
 * @param records Sparse records.
 * @param component Corner faces.
 */
function modifierBevelPaintComponent(
  choice: ModifierBevelParentChoice,
  records: (ModifierBevelFaceRecord | undefined)[],
  component: readonly number[],
): void {
  const parent = modifierBevelWinningParent(choice, component, modifierBevelBoundaryTally(choice, records, component));
  if (parent === null) return;
  const reach = modifierBevelParentReach(choice, component);
  const pending = new Set(component);
  let changed = true;
  while (changed) changed = modifierBevelPaintReady(choice, records, pending, parent, reach);
}

/**
 * Paints corner faces that already touch the winning parent.
 *
 * @param choice Choice state.
 * @param records Sparse records.
 * @param pending Faces still open.
 * @param parent Winning authored face.
 * @param reach Farthest a face may sit from the winning wall.
 * @returns True when a face was painted.
 */
function modifierBevelPaintReady(
  choice: ModifierBevelParentChoice,
  records: (ModifierBevelFaceRecord | undefined)[],
  pending: Set<number>,
  parent: number,
  reach: number,
): boolean {
  let changed = false;
  for (const faceIndex of [...pending]) {
    const source = modifierBevelPaintSource(choice.derived, records, pending, faceIndex, parent);
    if (source === null || !modifierBevelParentIsUsable(choice, faceIndex, parent, reach)) continue;
    records[faceIndex] = modifierBevelCornerCapRecord(choice.derived, faceIndex, source, parent);
    pending.delete(faceIndex);
    changed = true;
  }
  return changed;
}

/**
 * Returns a neighbor that already carries the winning parent.
 *
 * @param brush Chamfered brush.
 * @param records Sparse records.
 * @param pending Faces still open.
 * @param faceIndex Face to paint.
 * @param parent Winning authored face.
 * @returns Neighbor index, or null.
 */
function modifierBevelPaintSource(
  brush: SolidBrush,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
  pending: ReadonlySet<number>,
  faceIndex: number,
  parent: number,
): number | null {
  const outside = modifierBevelBestOutside(brush, records, pending, faceIndex, parent);
  if (outside !== null) return outside;
  return modifierBevelPaintedNeighbor(brush, records, pending, faceIndex, parent);
}

/**
 * Returns the longest outside neighbor that already has the winning parent.
 *
 * @param brush Chamfered brush.
 * @param records Sparse records.
 * @param pending Faces still open.
 * @param faceIndex Face to paint.
 * @param parent Winning authored face.
 * @returns Neighbor index, or null.
 */
function modifierBevelBestOutside(
  brush: SolidBrush,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
  pending: ReadonlySet<number>,
  faceIndex: number,
  parent: number,
): number | null {
  let best = -1;
  let bestLength = -1;
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    if (pending.has(neighbor) || records[neighbor]?.parentSurfaceIndex !== parent) continue;
    const length = modifierBevelSharedEdgeLength(brush, faceIndex, neighbor);
    if (length <= bestLength) continue;
    best = neighbor;
    bestLength = length;
  }
  return best >= 0 ? best : null;
}

/**
 * Returns a corner neighbor that was already painted with the winning parent.
 *
 * @param brush Chamfered brush.
 * @param records Sparse records.
 * @param pending Faces still open.
 * @param faceIndex Face to paint.
 * @param parent Winning authored face.
 * @returns Neighbor index, or null.
 */
function modifierBevelPaintedNeighbor(
  brush: SolidBrush,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
  pending: ReadonlySet<number>,
  faceIndex: number,
  parent: number,
): number | null {
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    if (pending.has(neighbor) || records[neighbor]?.parentSurfaceIndex !== parent) continue;
    return neighbor;
  }
  return null;
}

/**
 * Sums the border length of each parent around a corner.
 *
 * @param choice Choice state.
 * @param records Sparse records.
 * @param component Corner faces.
 * @returns Parent to border length.
 */
function modifierBevelBoundaryTally(
  choice: ModifierBevelParentChoice,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
  component: readonly number[],
): Map<number, number> {
  const tally = new Map<number, number>();
  const inside = new Set(component);
  for (const faceIndex of component) modifierBevelTallyFace(choice.derived, records, inside, tally, faceIndex);
  return tally;
}

/**
 * Adds one face's outside borders into the tally.
 *
 * @param brush Chamfered brush.
 * @param records Sparse records.
 * @param inside Corner faces.
 * @param tally Parent lengths.
 * @param faceIndex Face index.
 */
function modifierBevelTallyFace(
  brush: SolidBrush,
  records: readonly (ModifierBevelFaceRecord | undefined)[],
  inside: ReadonlySet<number>,
  tally: Map<number, number>,
  faceIndex: number,
): void {
  for (const neighbor of modifierBevelNeighborFaces(brush, faceIndex)) {
    if (inside.has(neighbor)) continue;
    const parent = records[neighbor]?.parentSurfaceIndex;
    if (parent === undefined) continue;
    const length = modifierBevelSharedEdgeLength(brush, faceIndex, neighbor);
    tally.set(parent, (tally.get(parent) ?? 0) + length);
  }
}

/**
 * Returns the parent a corner island should keep.
 *
 * @param choice Choice state.
 * @param component Corner faces.
 * @param tally Border length per parent.
 * @returns Parent index, or null when the corner has no border.
 */
function modifierBevelWinningParent(
  choice: ModifierBevelParentChoice,
  component: readonly number[],
  tally: ReadonlyMap<number, number>,
): number | null {
  const sample = modifierBevelCornerSample(choice, component);
  let best: { parent: number; length: number } | null = null;
  for (const [parent, length] of tally) {
    const next = { parent, length };
    if (!best || modifierBevelCornerCandidateWins(choice, sample, next, best)) best = next;
  }
  return best ? best.parent : null;
}

/**
 * Returns whether the next border parent replaces the current one.
 *
 * @param choice Choice state.
 * @param sample Face that stands for the corner.
 * @param next Candidate parent.
 * @param current Parent chosen so far.
 * @returns True when next wins.
 */
function modifierBevelCornerCandidateWins(
  choice: ModifierBevelParentChoice,
  sample: number,
  next: { parent: number; length: number },
  current: { parent: number; length: number },
): boolean {
  if (modifierBevelModeUsesBorder(choice.mode)) return modifierBevelBorderWins(choice.mode, next, current);
  return modifierBevelSamplePrefers(choice, sample, next, current);
}

/**
 * Returns the corner face that points between the most axes.
 *
 * @param choice Choice state.
 * @param component Corner faces.
 * @returns Face index.
 */
function modifierBevelCornerSample(choice: ModifierBevelParentChoice, component: readonly number[]): number {
  let best = component[0] ?? 0;
  let score = -1;
  for (const faceIndex of component) {
    const next = modifierBevelOpenness(choice.derived.planes[faceIndex]?.normal);
    if (next <= score) continue;
    best = faceIndex;
    score = next;
  }
  return best;
}

/**
 * Returns the smallest absolute axis of a normal.
 *
 * @param normal Face normal, or undefined.
 * @returns Smallest axis, or -1 when the normal is missing.
 */
function modifierBevelOpenness(normal: Vector3 | undefined): number {
  if (!normal) return -1;
  return Math.min(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
}

/**
 * Returns whether the sample face prefers the next parent.
 *
 * @param choice Choice state.
 * @param sample Face that stands for the corner.
 * @param next Candidate parent.
 * @param current Parent chosen so far.
 * @returns True when next wins.
 */
function modifierBevelSamplePrefers(
  choice: ModifierBevelParentChoice,
  sample: number,
  next: { parent: number; length: number },
  current: { parent: number; length: number },
): boolean {
  const left = modifierBevelParentPair(sample, next.parent);
  const right = modifierBevelParentPair(sample, current.parent);
  const ranked = modifierBevelPreferParent(choice, sample, left, right);
  if (ranked !== 0) return ranked < 0;
  return next.length > current.length;
}

/**
 * Pairs a sample face with one authored parent.
 *
 * @param face Sample face.
 * @param parent Authored parent.
 * @returns Pair used by the flow comparison.
 */
function modifierBevelParentPair(face: number, parent: number): { face: number; parent: number } {
  return { face, parent };
}

/**
 * Returns whether a mode chooses the corner by border length.
 *
 * @param mode UV flow.
 * @returns True for winding, reverse winding, and majority.
 */
function modifierBevelModeUsesBorder(mode: ModifierBevelUvFlow): boolean {
  return (
    mode === MODIFIER_VOLUME_BEVEL_UV_REVERSE ||
    mode === MODIFIER_VOLUME_BEVEL_UV_MAJORITY ||
    mode === MODIFIER_VOLUME_BEVEL_UV_WINDING
  );
}

/**
 * Returns whether a longer border, then face order, wins.
 *
 * @param mode UV flow.
 * @param next Candidate parent.
 * @param current Parent chosen so far.
 * @returns True when next wins.
 */
function modifierBevelBorderWins(
  mode: ModifierBevelUvFlow,
  next: { parent: number; length: number },
  current: { parent: number; length: number },
): boolean {
  const delta = next.length - current.length;
  if (Math.abs(delta) > 1e-8) return delta > 0;
  if (mode === MODIFIER_VOLUME_BEVEL_UV_REVERSE) return next.parent > current.parent;
  return next.parent < current.parent;
}

/**
 * Builds a corner record smeared from one neighbor.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Corner face.
 * @param sourceIndex Face to smear from.
 * @param parent Authored parent.
 * @returns Corner record.
 */
function modifierBevelCornerCapRecord(
  brush: SolidBrush,
  faceIndex: number,
  sourceIndex: number,
  parent: number,
): ModifierBevelFaceRecord {
  const edge = modifierBevelSharedEdge(brush, faceIndex, sourceIndex);
  const normal = brush.planes[faceIndex]?.normal.clone();
  return {
    parentSurfaceIndex: parent,
    smearFromDerivedIndex: sourceIndex,
    chamferEdge: edge && normal ? { pointA: edge.pointA, pointB: edge.pointB, destNormal: normal } : null,
    cornerFace: true,
  };
}

/**
 * Prefers the authored neighbor with the longer shared edge.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Generated face.
 * @param left Left neighbor.
 * @param right Right neighbor.
 * @returns Negative when left wins.
 */
function modifierBevelLongerBorder(
  brush: SolidBrush,
  faceIndex: number,
  left: { face: number; parent: number },
  right: { face: number; parent: number },
): number {
  const delta =
    modifierBevelSharedEdgeLength(brush, faceIndex, right.face) -
    modifierBevelSharedEdgeLength(brush, faceIndex, left.face);
  if (Math.abs(delta) > 1e-8) return delta;
  return left.parent - right.parent;
}

/**
 * Prefers the authored plane closer to a face center.
 *
 * @param choice Choice state.
 * @param faceIndex Generated face.
 * @param leftParent Left authored face.
 * @param rightParent Right authored face.
 * @returns Negative when left wins.
 */
function modifierBevelCloserPlane(
  choice: ModifierBevelParentChoice,
  faceIndex: number,
  leftParent: number,
  rightParent: number,
): number {
  const center = modifierBevelFaceCenter(choice.derived, faceIndex);
  const delta =
    modifierBevelPlaneDistance(choice, leftParent, center) - modifierBevelPlaneDistance(choice, rightParent, center);
  if (Math.abs(delta) > 1e-8) return delta;
  return leftParent - rightParent;
}

/**
 * Prefers the authored normal closer to the generated face.
 *
 * @param choice Choice state.
 * @param faceIndex Generated face.
 * @param leftParent Left authored face.
 * @param rightParent Right authored face.
 * @returns Negative when left wins.
 */
function modifierBevelCloserNormal(
  choice: ModifierBevelParentChoice,
  faceIndex: number,
  leftParent: number,
  rightParent: number,
): number {
  const normal = choice.derived.planes[faceIndex]?.normal;
  if (!normal) return leftParent - rightParent;
  const delta =
    modifierBevelNormalGap(choice, rightParent, normal) - modifierBevelNormalGap(choice, leftParent, normal);
  if (Math.abs(delta) > 1e-8) return delta;
  return leftParent - rightParent;
}

/**
 * Returns whether a face is close enough to take the winning wall.
 *
 * @param choice Choice state.
 * @param faceIndex Face index.
 * @param parent Candidate parent.
 * @param reach Farthest a face may sit from the winning wall.
 * @returns True when the wall still meets the face.
 */
function modifierBevelParentIsUsable(
  choice: ModifierBevelParentChoice,
  faceIndex: number,
  parent: number,
  reach: number,
): boolean {
  const center = modifierBevelFaceCenter(choice.derived, faceIndex);
  return modifierBevelPlaneDistance(choice, parent, center) <= reach;
}

/**
 * Returns how far a corner may sit from its wall on this solid.
 *
 * @param choice Choice state.
 * @param component Corner faces.
 * @returns Distance limit.
 */
function modifierBevelParentReach(choice: ModifierBevelParentChoice, component: readonly number[]): number {
  const span = modifierBevelNarrowSpan(choice.derived);
  const inset = modifierBevelCornerInset(choice, component);
  return Math.min(span * 0.8, Math.max(span * 0.45, inset * 2));
}

/**
 * Returns how far the deepest corner face sits from its nearest wall.
 *
 * @param choice Choice state.
 * @param component Corner faces.
 * @returns Inset.
 */
function modifierBevelCornerInset(choice: ModifierBevelParentChoice, component: readonly number[]): number {
  let inset = 0;
  for (const faceIndex of component) inset = Math.max(inset, modifierBevelNearestWall(choice, faceIndex));
  return inset;
}

/**
 * Returns the distance from a face center to the nearest authored plane.
 *
 * @param choice Choice state.
 * @param faceIndex Face index.
 * @returns Distance.
 */
function modifierBevelNearestWall(choice: ModifierBevelParentChoice, faceIndex: number): number {
  const center = modifierBevelFaceCenter(choice.derived, faceIndex);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < choice.sourcePlanes.length; index += 1) {
    nearest = Math.min(nearest, modifierBevelPlaneDistance(choice, index, center));
  }
  return nearest;
}

/**
 * Returns the shortest side of the brush bounds.
 *
 * @param brush Chamfered brush.
 * @returns Span.
 */
function modifierBevelNarrowSpan(brush: SolidBrush): number {
  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const vertex of brush.vertices) modifierBevelIncludeVertex(min, max, vertex);
  return modifierBevelShortestSide(min, max);
}

/**
 * Grows a bounds pair by one vertex.
 *
 * @param min Minimum corner.
 * @param max Maximum corner.
 * @param vertex Brush vertex.
 */
function modifierBevelIncludeVertex(min: Vector3, max: Vector3, vertex: Vector3): void {
  min.min(vertex);
  max.max(vertex);
}

/**
 * Returns the shortest edge of a bounds pair.
 *
 * @param min Minimum corner.
 * @param max Maximum corner.
 * @returns Span.
 */
function modifierBevelShortestSide(min: Vector3, max: Vector3): number {
  return Math.min(max.x - min.x, max.y - min.y, max.z - min.z);
}

/**
 * Returns the absolute distance from a point to an authored plane.
 *
 * @param choice Choice state.
 * @param parent Authored face.
 * @param point Sample point.
 * @returns Distance.
 */
function modifierBevelPlaneDistance(choice: ModifierBevelParentChoice, parent: number, point: Vector3): number {
  return modifierBevelSpacedPlaneDistance(choice.sourcePlanes[parent], point, choice.space, choice.matrix);
}

/**
 * Returns how aligned an authored normal is with a direction.
 *
 * @param choice Choice state.
 * @param parent Authored face.
 * @param normal Direction.
 * @returns Dot product. Larger means closer.
 */
function modifierBevelNormalGap(choice: ModifierBevelParentChoice, parent: number, normal: Vector3): number {
  return modifierBevelSpacedNormalDot(choice.sourcePlanes[parent]?.normal, normal, choice.space, choice.matrix);
}

/**
 * Returns the center of one face.
 *
 * @param brush Chamfered brush.
 * @param faceIndex Face index.
 * @returns Centroid.
 */
function modifierBevelFaceCenter(brush: SolidBrush, faceIndex: number): Vector3 {
  const face = brush.faces[faceIndex];
  const points = face ? brush.getFaceVertices(face) : [];
  const center = new Vector3();
  if (points.length === 0) return center;
  for (const point of points) center.add(point);
  return center.multiplyScalar(1 / points.length);
}
