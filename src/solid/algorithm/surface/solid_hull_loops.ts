import { Vector3 } from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';

/** One outward hull triangle. */
interface SolidHullTriangle {
  /** First vertex index. */
  a: number;
  /** Second vertex index. */
  b: number;
  /** Third vertex index. */
  c: number;
}

/**
 * Most triangles a hull may have for its coplanar faces to be found by testing
 * every pair; larger hulls only test triangles on each other's edges.
 */
const SOLID_HULL_PAIRS_MAX = 48;

/** Directed edge of a hull triangle. */
interface SolidHullEdge {
  /** Edge start index. */
  from: number;
  /** Edge end index. */
  to: number;
}

/**
 * Builds outward polygon loops for the convex hull of a point set.
 *
 * @param points Unique points.
 * @param triangles Outward triangle index triples.
 * @returns Face loops, or null when a face does not close.
 */
export function solidHullLoops(points: readonly Vector3[], triangles: readonly number[][]): Vector3[][] | null {
  const records = solidHullTriangleRecords(triangles);
  const groups = solidHullCoplanarGroups(points, records);
  const loops: Vector3[][] = [];
  for (const group of groups) {
    const faces = solidHullGroupLoops(points, records, group);
    if (!faces) return null;
    for (const face of faces) loops.push(face);
  }
  return loops.length >= 4 ? loops : null;
}

/**
 * Copies triangle index triples into records.
 *
 * @param triangles Triangle index triples.
 * @returns Triangle records.
 */
function solidHullTriangleRecords(triangles: readonly number[][]): SolidHullTriangle[] {
  const records: SolidHullTriangle[] = [];
  for (const triangle of triangles) {
    const record = solidHullTriangleRecord(triangle);
    if (record) records.push(record);
  }
  return records;
}

/**
 * Reads one triangle when it has three indices.
 *
 * @param triangle Index triple.
 * @returns Triangle, or null when the triple is short.
 */
function solidHullTriangleRecord(triangle: readonly number[]): SolidHullTriangle | null {
  const a = triangle[0];
  const b = triangle[1];
  const c = triangle[2];
  if (a === undefined || b === undefined || c === undefined) return null;
  return { a, b, c };
}

/**
 * Groups triangles that lie on the same hull face. Only triangles that share an
 * edge can join: a small hull tests every pair, a large one only the triangles
 * on each triangle's edges, in the same order.
 *
 * @param points Hull points.
 * @param triangles Hull triangles.
 * @returns Groups of triangle indices.
 */
function solidHullCoplanarGroups(points: readonly Vector3[], triangles: readonly SolidHullTriangle[]): number[][] {
  const parents = triangles.map((_, index) => index);
  const planes = triangles.map((triangle) => solidHullTrianglePlane(points, triangle));
  const neighbours = triangles.length > SOLID_HULL_PAIRS_MAX ? solidHullEdgeNeighbours(triangles) : null;
  for (let left = 0; left < triangles.length; left += 1) {
    const first = triangles[left];
    if (!first) continue;
    const candidates = neighbours ? (neighbours[left] ?? []) : null;
    const count = candidates ? candidates.length : triangles.length;
    for (let at = candidates ? 0 : left + 1; at < count; at += 1) {
      const right = candidates ? (candidates[at] ?? 0) : at;
      const second = triangles[right];
      if (right > left && second && solidHullTrianglesShareEdge(first, second))
        solidHullUniteCoplanar(parents, points, second, planes, left, right);
    }
  }
  return solidHullCollectGroups(parents);
}

/**
 * Lists, for each triangle, the triangles that hold at least two of its vertex
 * indices, in ascending order.
 *
 * @param triangles Hull triangles.
 * @returns Sorted neighbour indices per triangle.
 */
function solidHullEdgeNeighbours(triangles: readonly SolidHullTriangle[]): number[][] {
  const byVertex = new Map<number, number[]>();
  triangles.forEach((triangle, index) => {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) solidHullListAdd(byVertex, vertex, index);
  });
  return triangles.map((triangle, index) => solidHullTriangleNeighbours(triangles, byVertex, triangle, index));
}

/**
 * Adds a triangle to the list of a vertex once.
 *
 * @param byVertex Triangles by vertex index.
 * @param vertex Vertex index.
 * @param index Triangle index.
 */
function solidHullListAdd(byVertex: Map<number, number[]>, vertex: number, index: number): void {
  const list = byVertex.get(vertex);
  if (!list) byVertex.set(vertex, [index]);
  else if (list[list.length - 1] !== index) list.push(index);
}

/**
 * Lists the triangles that hold at least two vertex indices of one triangle, in
 * ascending order: those on any of its edges.
 *
 * @param triangles Hull triangles.
 * @param byVertex Triangles by vertex index, ascending.
 * @param triangle Triangle.
 * @param index Its index.
 * @returns Sorted neighbour indices.
 */
function solidHullTriangleNeighbours(
  triangles: readonly SolidHullTriangle[],
  byVertex: ReadonlyMap<number, readonly number[]>,
  triangle: SolidHullTriangle,
  index: number,
): number[] {
  if (triangle.a === triangle.b || triangle.b === triangle.c || triangle.c === triangle.a)
    return solidHullTriangleNeighboursDegenerate(triangles, byVertex, triangle, index);
  const found = new Set<number>();
  const empty: readonly number[] = [];
  const lists = [
    byVertex.get(triangle.a) ?? empty,
    byVertex.get(triangle.b) ?? empty,
    byVertex.get(triangle.c) ?? empty,
  ];
  for (let first = 0; first < 3; first += 1) {
    const second = (first + 1) % 3;
    for (const other of solidHullSortedCommon(lists[first] ?? empty, lists[second] ?? empty))
      if (other !== index) found.add(other);
  }
  return [...found].sort((left, right) => left - right);
}

/**
 * Returns the entries two ascending lists have in common.
 *
 * @param left First ascending list.
 * @param right Second ascending list.
 * @returns Common entries, ascending.
 */
function solidHullSortedCommon(left: readonly number[], right: readonly number[]): number[] {
  const common: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i] ?? 0;
    const b = right[j] ?? 0;
    if (a === b) common.push(a);
    if (a <= b) i += 1;
    if (b <= a) j += 1;
  }
  return common;
}

/**
 * Lists the triangles that hold at least two vertex indices of a triangle that
 * repeats an index, counting the repeated index twice.
 *
 * @param triangles Hull triangles.
 * @param byVertex Triangles by vertex index.
 * @param triangle Triangle.
 * @param index Its index.
 * @returns Sorted neighbour indices.
 */
function solidHullTriangleNeighboursDegenerate(
  triangles: readonly SolidHullTriangle[],
  byVertex: ReadonlyMap<number, readonly number[]>,
  triangle: SolidHullTriangle,
  index: number,
): number[] {
  const candidates = new Set<number>();
  for (const vertex of [triangle.a, triangle.b, triangle.c])
    for (const other of byVertex.get(vertex) ?? []) if (other !== index) candidates.add(other);
  const sharing = [...candidates].filter((other) => {
    const second = triangles[other];
    return second !== undefined && solidHullTrianglesShareEdge(triangle, second);
  });
  return sharing.sort((left, right) => left - right);
}

/**
 * Joins two edge-sharing triangles when they lie on one outward plane.
 *
 * @param parents Union-find parents.
 * @param points Hull points.
 * @param second Second triangle.
 * @param planes Plane of each triangle, or null.
 * @param left First triangle index.
 * @param right Second triangle index.
 */
function solidHullUniteCoplanar(
  parents: number[],
  points: readonly Vector3[],
  second: SolidHullTriangle,
  planes: readonly (SolidPlane | null)[],
  left: number,
  right: number,
): void {
  const plane = planes[left];
  const other = planes[right];
  if (!plane || !other || plane.normal.dot(other.normal) <= 0.999) return;
  if (!solidHullTriangleOnPlane(points, second, plane)) return;
  solidHullUnite(parents, left, right);
}

/**
 * Returns whether two triangles share two vertex indices.
 *
 * @param first First triangle.
 * @param second Second triangle.
 * @returns True when an edge is shared.
 */
function solidHullTrianglesShareEdge(first: SolidHullTriangle, second: SolidHullTriangle): boolean {
  return solidHullSharedIndexCount(first, second) >= 2;
}

/**
 * Counts the vertex indices of the first triangle that are also in the second.
 *
 * @param first First triangle.
 * @param second Second triangle.
 * @returns Shared index count.
 */
function solidHullSharedIndexCount(first: SolidHullTriangle, second: SolidHullTriangle): number {
  return (
    solidHullTriangleHas(second, first.a) +
    solidHullTriangleHas(second, first.b) +
    solidHullTriangleHas(second, first.c)
  );
}

/**
 * Returns 1 when a triangle uses a vertex index, else 0.
 *
 * @param triangle Triangle.
 * @param index Vertex index.
 * @returns 1 or 0.
 */
function solidHullTriangleHas(triangle: SolidHullTriangle, index: number): number {
  return triangle.a === index || triangle.b === index || triangle.c === index ? 1 : 0;
}

/**
 * Returns the plane of one triangle.
 *
 * @param points Hull points.
 * @param triangle Triangle.
 * @returns Plane, or null when a vertex is missing.
 */
function solidHullTrianglePlane(points: readonly Vector3[], triangle: SolidHullTriangle): SolidPlane | null {
  const a = points[triangle.a];
  const b = points[triangle.b];
  const c = points[triangle.c];
  if (!a || !b || !c) return null;
  return SolidPlane.fromPoints(a, b, c);
}

/**
 * Returns whether every vertex of a triangle lies on a plane.
 *
 * @param points Hull points.
 * @param triangle Triangle.
 * @param plane Face plane.
 * @returns True when the triangle is on the plane.
 */
function solidHullTriangleOnPlane(points: readonly Vector3[], triangle: SolidHullTriangle, plane: SolidPlane): boolean {
  return (
    solidHullIndexOnPlane(points, triangle.a, plane) &&
    solidHullIndexOnPlane(points, triangle.b, plane) &&
    solidHullIndexOnPlane(points, triangle.c, plane)
  );
}

/**
 * Returns whether one vertex lies on a plane.
 *
 * @param points Hull points.
 * @param index Vertex index.
 * @param plane Face plane.
 * @returns True when the vertex is on the plane.
 */
function solidHullIndexOnPlane(points: readonly Vector3[], index: number, plane: SolidPlane): boolean {
  const point = points[index];
  if (!point) return false;
  return Math.abs(plane.signedDistance(point)) <= 1e-4;
}

/**
 * Joins two union-find roots.
 *
 * @param parents Parent of each triangle.
 * @param left First triangle index.
 * @param right Second triangle index.
 */
function solidHullUnite(parents: number[], left: number, right: number): void {
  const leftRoot = solidHullFind(parents, left);
  const rightRoot = solidHullFind(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

/**
 * Returns the root of a triangle.
 *
 * @param parents Parent of each triangle.
 * @param index Triangle index.
 * @returns Root index.
 */
function solidHullFind(parents: number[], index: number): number {
  let cursor = index;
  while (parents[cursor] !== cursor) {
    const parent = parents[cursor];
    if (parent === undefined) return cursor;
    parents[cursor] = parent;
    cursor = parent;
  }
  return cursor;
}

/**
 * Lists triangle indices under each union-find root.
 *
 * @param parents Parent of each triangle.
 * @returns Groups.
 */
function solidHullCollectGroups(parents: number[]): number[][] {
  const groups = new Map<number, number[]>();
  for (let index = 0; index < parents.length; index += 1) solidHullPushGroup(groups, parents, index);
  return [...groups.values()];
}

/**
 * Adds one triangle to its root group.
 *
 * @param groups Groups by root.
 * @param parents Parent of each triangle.
 * @param index Triangle index.
 */
function solidHullPushGroup(groups: Map<number, number[]>, parents: number[], index: number): void {
  const root = solidHullFind(parents, index);
  const group = groups.get(root) ?? [];
  group.push(index);
  groups.set(root, group);
}

/**
 * Builds the loops of one coplanar group.
 *
 * @param points Hull points.
 * @param triangles Hull triangles.
 * @param group Triangle indices.
 * @returns Loops, or null when a triangle is missing.
 */
function solidHullGroupLoops(
  points: readonly Vector3[],
  triangles: readonly SolidHullTriangle[],
  group: readonly number[],
): Vector3[][] | null {
  const indices = solidHullBoundaryIndices(triangles, group);
  const merged = indices ? solidHullPointsForIndices(points, indices) : null;
  if (merged) return [merged];
  return solidHullSeparateTriangles(points, triangles, group);
}

/**
 * Walks the unshared edges of a group.
 *
 * @param triangles Hull triangles.
 * @param group Triangle indices.
 * @returns Vertex indices, or null when the boundary branches.
 */
function solidHullBoundaryIndices(triangles: readonly SolidHullTriangle[], group: readonly number[]): number[] | null {
  const edges = solidHullBoundaryEdges(triangles, group);
  return solidHullWalkEdges(edges);
}

/**
 * Lists directed edges that belong to only one triangle in the group.
 *
 * @param triangles Hull triangles.
 * @param group Triangle indices.
 * @returns Boundary edges.
 */
function solidHullBoundaryEdges(triangles: readonly SolidHullTriangle[], group: readonly number[]): SolidHullEdge[] {
  const counts = new Map<number, number>();
  const edges: SolidHullEdge[] = [];
  const stride = solidHullEdgeStride(triangles, group);
  for (const index of group) solidHullCountTriangleEdges(counts, edges, stride, triangles[index]);
  return edges.filter((edge) => (counts.get(edge.to * stride + edge.from) ?? 0) === 0);
}

/**
 * Returns one more than the largest vertex index of a group, so from * stride.
 *
 * - To names each directed edge once.
 *
 * @param triangles Hull triangles.
 * @param group Triangle indices.
 * @returns Stride.
 */
function solidHullEdgeStride(triangles: readonly SolidHullTriangle[], group: readonly number[]): number {
  let largest = 0;
  for (const index of group) {
    const triangle = triangles[index];
    if (triangle) largest = Math.max(largest, triangle.a, triangle.b, triangle.c);
  }
  return largest + 1;
}

/**
 * Counts the three directed edges of one triangle.
 *
 * @param counts Edge counts.
 * @param edges Edge list.
 * @param stride Edge key stride.
 * @param triangle Triangle, when present.
 */
function solidHullCountTriangleEdges(
  counts: Map<number, number>,
  edges: SolidHullEdge[],
  stride: number,
  triangle: SolidHullTriangle | undefined,
): void {
  if (!triangle) return;
  solidHullCountEdge(counts, edges, stride, triangle.a, triangle.b);
  solidHullCountEdge(counts, edges, stride, triangle.b, triangle.c);
  solidHullCountEdge(counts, edges, stride, triangle.c, triangle.a);
}

/**
 * Stores one directed edge.
 *
 * @param counts Edge counts.
 * @param edges Edge list.
 * @param stride Edge key stride.
 * @param from Start index.
 * @param to End index.
 */
function solidHullCountEdge(
  counts: Map<number, number>,
  edges: SolidHullEdge[],
  stride: number,
  from: number,
  to: number,
): void {
  const key = from * stride + to;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  edges.push({ from, to });
}

/**
 * Follows boundary edges into one vertex ring.
 *
 * @param edges Boundary edges.
 * @returns Vertex indices, or null when the ring branches or stays open.
 */
function solidHullWalkEdges(edges: readonly SolidHullEdge[]): number[] | null {
  const next = solidHullEdgeMap(edges);
  if (!next || edges.length < 3) return null;
  const start = edges[0]?.from;
  if (start === undefined) return null;
  return solidHullWalkRing(next, start, edges.length);
}

/**
 * Maps each boundary start to its end when the map is a single cycle.
 *
 * @param edges Boundary edges.
 * @returns Successor map, or null when a vertex has two exits.
 */
function solidHullEdgeMap(edges: readonly SolidHullEdge[]): Map<number, number> | null {
  const next = new Map<number, number>();
  for (const edge of edges) {
    if (next.has(edge.from)) return null;
    next.set(edge.from, edge.to);
  }
  return next.size === edges.length ? next : null;
}

/**
 * Walks successors until the ring returns to its start.
 *
 * @param next Successor of each vertex.
 * @param start First vertex.
 * @param limit Maximum steps.
 * @returns Vertex indices, or null when the ring stays open.
 */
function solidHullWalkRing(next: ReadonlyMap<number, number>, start: number, limit: number): number[] | null {
  const ring = [start];
  let cursor = next.get(start);
  while (cursor !== undefined && cursor !== start && ring.length <= limit) {
    ring.push(cursor);
    cursor = next.get(cursor);
  }
  return cursor === start && ring.length >= 3 ? ring : null;
}

/**
 * Uses each triangle as its own loop when the group boundary does not close.
 *
 * @param points Hull points.
 * @param triangles Hull triangles.
 * @param group Triangle indices.
 * @returns Triangle loops, or null when a triangle is missing.
 */
function solidHullSeparateTriangles(
  points: readonly Vector3[],
  triangles: readonly SolidHullTriangle[],
  group: readonly number[],
): Vector3[][] | null {
  const loops: Vector3[][] = [];
  for (const index of group) {
    const loop = solidHullOneTriangle(points, triangles[index]);
    if (!loop) return null;
    loops.push(loop);
  }
  return loops;
}

/**
 * Copies one triangle into a loop.
 *
 * @param points Hull points.
 * @param triangle Triangle, when present.
 * @returns Loop, or null when the triangle is missing.
 */
function solidHullOneTriangle(points: readonly Vector3[], triangle: SolidHullTriangle | undefined): Vector3[] | null {
  if (!triangle) return null;
  return solidHullPointsForIndices(points, [triangle.a, triangle.b, triangle.c]);
}

/**
 * Copies points for a ring of indices.
 *
 * @param points Hull points.
 * @param indices Vertex indices.
 * @returns Loop, or null when a vertex is missing.
 */
function solidHullPointsForIndices(points: readonly Vector3[], indices: readonly number[]): Vector3[] | null {
  const loop: Vector3[] = [];
  for (const index of indices) {
    const point = points[index];
    if (!point) return null;
    loop.push(point.clone());
  }
  return loop;
}
