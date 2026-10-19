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
 * Groups triangles that lie on the same hull face.
 *
 * @param points Hull points.
 * @param triangles Hull triangles.
 * @returns Groups of triangle indices.
 */
function solidHullCoplanarGroups(points: readonly Vector3[], triangles: readonly SolidHullTriangle[]): number[][] {
  const parents = triangles.map((_, index) => index);
  for (let left = 0; left < triangles.length; left += 1) {
    for (let right = left + 1; right < triangles.length; right += 1) {
      solidHullUniteCoplanar(parents, points, triangles, left, right);
    }
  }
  return solidHullCollectGroups(parents);
}

/**
 * Joins two triangles when they share an edge and a plane.
 *
 * @param parents Union-find parents.
 * @param points Hull points.
 * @param triangles Hull triangles.
 * @param left First triangle index.
 * @param right Second triangle index.
 */
function solidHullUniteCoplanar(
  parents: number[],
  points: readonly Vector3[],
  triangles: readonly SolidHullTriangle[],
  left: number,
  right: number,
): void {
  const first = triangles[left];
  const second = triangles[right];
  if (!first || !second || !solidHullTrianglesShareEdge(first, second)) return;
  if (!solidHullTrianglesCoplanar(points, first, second)) return;
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
  const shared = solidHullSharedIndexCount(first, second);
  return shared >= 2;
}

/**
 * Counts vertex indices present in both triangles.
 *
 * @param first First triangle.
 * @param second Second triangle.
 * @returns Shared index count.
 */
function solidHullSharedIndexCount(first: SolidHullTriangle, second: SolidHullTriangle): number {
  const indices = [second.a, second.b, second.c];
  return [first.a, first.b, first.c].filter((index) => indices.includes(index)).length;
}

/**
 * Returns whether two triangles lie on one outward plane.
 *
 * @param points Hull points.
 * @param first First triangle.
 * @param second Second triangle.
 * @returns True when the triangles are coplanar and face the same way.
 */
function solidHullTrianglesCoplanar(
  points: readonly Vector3[],
  first: SolidHullTriangle,
  second: SolidHullTriangle,
): boolean {
  const plane = solidHullTrianglePlane(points, first);
  const other = solidHullTrianglePlane(points, second);
  if (!plane || !other || plane.normal.dot(other.normal) <= 0.999) return false;
  return solidHullTriangleOnPlane(points, second, plane);
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
  return [triangle.a, triangle.b, triangle.c].every((index) => solidHullIndexOnPlane(points, index, plane));
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
  const counts = new Map<string, number>();
  const edges: SolidHullEdge[] = [];
  for (const index of group) solidHullCountTriangleEdges(counts, edges, triangles[index]);
  return edges.filter((edge) => (counts.get(solidHullEdgeKey(edge.to, edge.from)) ?? 0) === 0);
}

/**
 * Counts the three directed edges of one triangle.
 *
 * @param counts Edge counts.
 * @param edges Edge list.
 * @param triangle Triangle, when present.
 */
function solidHullCountTriangleEdges(
  counts: Map<string, number>,
  edges: SolidHullEdge[],
  triangle: SolidHullTriangle | undefined,
): void {
  if (!triangle) return;
  solidHullCountEdge(counts, edges, triangle.a, triangle.b);
  solidHullCountEdge(counts, edges, triangle.b, triangle.c);
  solidHullCountEdge(counts, edges, triangle.c, triangle.a);
}

/**
 * Stores one directed edge.
 *
 * @param counts Edge counts.
 * @param edges Edge list.
 * @param from Start index.
 * @param to End index.
 */
function solidHullCountEdge(counts: Map<string, number>, edges: SolidHullEdge[], from: number, to: number): void {
  const key = solidHullEdgeKey(from, to);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  edges.push({ from, to });
}

/**
 * Builds a map key for a directed edge.
 *
 * @param from Start index.
 * @param to End index.
 * @returns Key.
 */
function solidHullEdgeKey(from: number, to: number): string {
  return `${from}->${to}`;
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
