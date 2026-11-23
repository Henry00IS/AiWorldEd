import * as THREE from 'three';
import { blastHoleCross } from './modifier_stack_blast_hole_simple.js';
import {
  blastHoleDelaunayFlip,
  blastHoleEarClip,
  blastHoleInsertPoint,
  type BlastHoleTriangle,
} from './modifier_stack_blast_hole_triangulate.js';
import { blastHolePolygonArea } from './modifier_stack_blast_hole_quality.js';
import { BlastHoleHeapMax } from './modifier_stack_blast_hole_heap.js';

/** Smallest turn, as a sine, that counts as a convex corner. */
const BLAST_HOLE_DECOMPOSE_MIN_TURN = 1e-3;

/**
 * Largest turn, as a sine, of an inner point that counts as lying straight on
 * an edge.
 */
const BLAST_HOLE_DECOMPOSE_STRAIGHT = 1e-9;

/** Convex parts of a polygon and the points they index. */
export interface BlastHoleDecomposition {
  /** Outline points first, then the inner points. */
  points: THREE.Vector2[];
  /** Parts as counter-clockwise index loops. */
  loops: number[][];
}

/** Working state of the part merge. */
interface BlastHoleMergeState {
  points: readonly THREE.Vector2[];
  outlineCount: number;
  parts: number[][];
  owners: Map<string, number>;
}

/**
 * Returns the key of a directed edge.
 *
 * @param from Start index.
 * @param to End index.
 * @returns Key.
 */
function blastHoleEdgeKey(from: number, to: number): string {
  return `${from}>${to}`;
}

/**
 * Returns the turn at one corner of a loop, as a sine.
 *
 * @param points Points.
 * @param loop Loop.
 * @param at Position in the loop.
 * @returns Sine of the turn, positive turning left.
 */
function blastHoleLoopTurn(points: readonly THREE.Vector2[], loop: readonly number[], at: number): number {
  const count = loop.length;
  const a = points[loop[(at + count - 1) % count]!]!;
  const b = points[loop[at]!]!;
  const c = points[loop[(at + 1) % count]!]!;
  return blastHoleCross(a, b, c) / Math.max(1e-24, a.distanceTo(b) * b.distanceTo(c));
}

/**
 * Returns whether the corner at a position of a loop runs straight on: the
 * edges before and after it point the same way.
 *
 * @param points Points.
 * @param loop Loop.
 * @param at Position in the loop.
 * @returns True when the corner does not fold back.
 */
function blastHoleLoopForward(points: readonly THREE.Vector2[], loop: readonly number[], at: number): boolean {
  const count = loop.length;
  const a = points[loop[(at + count - 1) % count]!]!;
  const b = points[loop[at]!]!;
  const c = points[loop[(at + 1) % count]!]!;
  return (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;
}

/**
 * Returns whether a loop is convex: no corner twice, every outline corner turns
 * left clearly; inner points may also lie straight on an edge, as they are
 * dropped after.
 *
 * @param state Merge state.
 * @param loop Corner indices.
 * @returns True when convex.
 */
function blastHoleLoopConvex(state: BlastHoleMergeState, loop: readonly number[]): boolean {
  if (new Set(loop).size !== loop.length) return false;
  return loop.every((index, at) => {
    const turn = blastHoleLoopTurn(state.points, loop, at);
    if (index < state.outlineCount) return turn > BLAST_HOLE_DECOMPOSE_MIN_TURN;
    const straight = Math.abs(turn) < BLAST_HOLE_DECOMPOSE_STRAIGHT && blastHoleLoopForward(state.points, loop, at);
    return turn > BLAST_HOLE_DECOMPOSE_MIN_TURN || straight;
  });
}

/**
 * Joins two loops along their shared edge: the first runs from-to, the second
 * to-from.
 *
 * @param first Loop holding the edge from-to.
 * @param second Loop holding the edge to-from.
 * @param from Edge start.
 * @param to Edge end.
 * @returns Merged loop, counter-clockwise.
 */
function blastHoleLoopJoin(first: readonly number[], second: readonly number[], from: number, to: number): number[] {
  const rotate = (loop: readonly number[], start: number) => {
    const at = loop.indexOf(start);
    return [...loop.slice(at), ...loop.slice(0, at)];
  };
  return [...rotate(first, to).slice(0, -1), ...rotate(second, from).slice(0, -1)];
}

/**
 * Indexes which part owns each directed edge.
 *
 * @param parts Parts as index loops.
 * @returns Owner part per edge key.
 */
function blastHoleEdgeOwners(parts: readonly number[][]): Map<string, number> {
  const owners = new Map<string, number>();
  parts.forEach((loop, part) =>
    loop.forEach((from, at) => owners.set(blastHoleEdgeKey(from, loop[(at + 1) % loop.length]!), part)),
  );
  return owners;
}

/** One possible merge of two parts. */
interface BlastHoleMerge {
  first: number;
  second: number;
  firstLoop: number[];
  secondLoop: number[];
  loop: number[];
  area: number;
}

/**
 * Returns the merge across one inner edge when it gives a convex part.
 *
 * @param state Merge state.
 * @param key Directed edge key owned by the first part.
 * @param first First part.
 * @returns Merge, or null.
 */
function blastHoleMergeAcross(state: BlastHoleMergeState, key: string, first: number): BlastHoleMerge | null {
  const [from, to] = key.split('>').map(Number) as [number, number];
  const second = state.owners.get(blastHoleEdgeKey(to, from));
  if (second === undefined || second <= first) return null;
  const loop = blastHoleLoopJoin(state.parts[first]!, state.parts[second]!, from, to);
  if (!blastHoleLoopConvex(state, loop)) return null;
  const firstLoop = state.parts[first]!;
  const secondLoop = state.parts[second]!;
  return {
    first,
    second,
    firstLoop,
    secondLoop,
    loop,
    area: blastHolePolygonArea(loop.map((index) => state.points[index]!)),
  };
}

/**
 * Queues every convex merge across the edges of one part.
 *
 * @param state Merge state.
 * @param heap Queue of merges by merged area.
 * @param part Part index.
 */
function blastHoleQueueMerges(state: BlastHoleMergeState, heap: BlastHoleHeapMax<BlastHoleMerge>, part: number): void {
  const loop = state.parts[part]!;
  loop.forEach((from, at) => {
    const to = loop[(at + 1) % loop.length]!;
    const other = state.owners.get(blastHoleEdgeKey(to, from));
    if (other === undefined) return;
    const [first, low, high] = other < part ? [other, to, from] : [part, from, to];
    const merge = blastHoleMergeAcross(state, blastHoleEdgeKey(low, high), first);
    if (merge) heap.push(merge.area, merge);
  });
}

/**
 * Applies one merge to the state.
 *
 * @param state Merge state, changed in place.
 * @param merge Merge.
 */
function blastHoleMergeApply(state: BlastHoleMergeState, merge: BlastHoleMerge): void {
  for (const loop of [state.parts[merge.first]!, state.parts[merge.second]!])
    loop.forEach((from, at) => state.owners.delete(blastHoleEdgeKey(from, loop[(at + 1) % loop.length]!)));
  state.parts[merge.first] = merge.loop;
  state.parts[merge.second] = [];
  merge.loop.forEach((from, at) =>
    state.owners.set(blastHoleEdgeKey(from, merge.loop[(at + 1) % merge.loop.length]!), merge.first),
  );
}

/**
 * Merges parts, biggest merged part first, until no two neighbours merge into a
 * convex part (Hertel-Mehlhorn, greedy by area). Queued merges whose parts
 * changed since are skipped.
 *
 * @param state Merge state, changed in place.
 */
function blastHoleMergeAll(state: BlastHoleMergeState): void {
  const heap = new BlastHoleHeapMax<BlastHoleMerge>();
  state.parts.forEach((_, part) => blastHoleQueueMerges(state, heap, part));
  for (let merge = heap.pop(); merge; merge = heap.pop()) {
    if (state.parts[merge.first] !== merge.firstLoop || state.parts[merge.second] !== merge.secondLoop) continue;
    blastHoleMergeApply(state, merge);
    blastHoleQueueMerges(state, heap, merge.first);
  }
}

/**
 * Drops inner points that lie straight on an edge of a part.
 *
 * @param state Merge state.
 * @param loop Loop.
 * @returns Loop without straight inner corners.
 */
function blastHoleLoopStraighten(state: BlastHoleMergeState, loop: readonly number[]): number[] {
  let current = [...loop];
  for (let at = current.length - 1; at >= 0 && current.length > 3; at--)
    if (
      current[at]! >= state.outlineCount &&
      Math.abs(blastHoleLoopTurn(state.points, current, at)) < BLAST_HOLE_DECOMPOSE_STRAIGHT
    )
      current = current.filter((_, position) => position !== at);
  return current;
}

/**
 * Triangulates the outline with the inner points as extra corners.
 *
 * @param points Outline points, then inner points.
 * @param outlineCount Number of outline points.
 * @returns Constrained Delaunay triangles, or null.
 */
function blastHoleTriangulate(points: readonly THREE.Vector2[], outlineCount: number): BlastHoleTriangle[] | null {
  const triangles = blastHoleEarClip(points.slice(0, outlineCount));
  if (!triangles) return null;
  for (let index = outlineCount; index < points.length; index++) blastHoleInsertPoint(points, triangles, index);
  return blastHoleDelaunayFlip(points, triangles, new Set());
}

/**
 * Splits a simple counter-clockwise polygon into convex parts that tile it
 * exactly: a constrained Delaunay triangulation of the outline and the inner
 * points, whose triangles are then merged, biggest merged part first, while the
 * result stays convex (Hertel-Mehlhorn). Inner points let a big convex core
 * form, so the parts along the ragged edge stay short and fat instead of long
 * fans across the hole. Parts share every outline corner.
 *
 * @param outline Polygon points, counter-clockwise.
 * @param inner Points strictly inside it, away from its edges.
 * @returns Parts, or null when the polygon cannot be triangulated.
 */
export function blastHoleConvexDecompose(
  outline: readonly THREE.Vector2[],
  inner: readonly THREE.Vector2[] = [],
): BlastHoleDecomposition | null {
  const points = [...outline, ...inner].map((point) => point.clone());
  const triangles = blastHoleTriangulate(points, outline.length);
  if (!triangles) return null;
  const parts = triangles.map((triangle) => [...triangle]);
  const state: BlastHoleMergeState = {
    points,
    outlineCount: outline.length,
    parts,
    owners: blastHoleEdgeOwners(parts),
  };
  blastHoleMergeAll(state);
  const loops = state.parts.filter((loop) => loop.length >= 3).map((loop) => blastHoleLoopStraighten(state, loop));
  return { points, loops };
}
