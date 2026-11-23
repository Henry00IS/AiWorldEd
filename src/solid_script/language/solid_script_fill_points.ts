import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptPathFrame } from './solid_script_path_shape.js';
import {
  blastHoleDelaunayFlip,
  blastHoleInsertPoint,
  type BlastHoleTriangle,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_triangulate.js';
import { blastHoleCross } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_simple.js';
import { solidScriptFillConstrain, solidScriptFillRegions } from './solid_script_fill_constrain.js';

/** Most points Fill Points takes. */
export const SOLID_SCRIPT_FILL_POINTS_LIMIT = 5000;

/** Points closer than this on the plane count as one. */
const SOLID_SCRIPT_FILL_POINTS_MERGE = 1e-9;

/**
 * What Fill Points fills with besides the points: groups, kept edges and the
 * kind of faces.
 */
export interface SolidScriptFillPointsOptions {
  /** A group per point, or null for one group. */
  groups: readonly string[] | null;
  /** Pairs of point numbers, from 0, that stay edges of the mesh. */
  edges: readonly [number, number][];
  /** True to join triangles between kept edges into one face each. */
  regions: boolean;
}

/**
 * Fills loose points with triangles whose circles hold no other point, seen on
 * the plane facing Normal; the mesh covers the convex hull round the points of
 * every group, each group filled on its own. Kept edges stay sides of the
 * triangles, split where they run through a point, and only triangles across
 * other edges need the empty circle. With Regions the triangles between kept
 * edges and the hull are joined into one face each. Points repeated on the
 * plane are kept once, and a group with too few points to fill is left out.
 *
 * @param points Points.
 * @param normal Direction the plane and the faces look.
 * @param label Command, for messages.
 * @param options Groups, kept edges and Regions.
 * @returns Mesh facing Normal.
 */
export function solidScriptFillPoints(
  points: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  label: string,
  options: SolidScriptFillPointsOptions,
): SolidScriptShapeMesh {
  if (points.length > SOLID_SCRIPT_FILL_POINTS_LIMIT)
    throw new Error(`${label} takes at most ${SOLID_SCRIPT_FILL_POINTS_LIMIT} points; use fewer points`);
  const frame = solidScriptPathFrame(normal, label);
  const flatAll = points.map((point) => new THREE.Vector2(point.dot(frame.x), point.dot(frame.y)));
  const mesh: SolidScriptShapeMesh = { kind: 'mesh', label: 'mesh', points: [], faces: [], uvs: [] };
  for (const group of solidScriptFillPointsGroups(points.length, options.groups, label))
    solidScriptFillPointsGroup(mesh, points, flatAll, group, options, label);
  if (mesh.faces.length === 0) throw new Error(`${label} needs at least 3 points that are not all in one line`);
  return mesh;
}

/**
 * Fills the points of one group, with the kept edges between its points.
 *
 * @param mesh Mesh to add to.
 * @param points Every point.
 * @param flatAll Every point on the plane.
 * @param group Point numbers of the group.
 * @param options Kept edges and Regions.
 * @param label Command, for messages.
 */
function solidScriptFillPointsGroup(
  mesh: SolidScriptShapeMesh,
  points: readonly THREE.Vector3[],
  flatAll: readonly THREE.Vector2[],
  group: readonly number[],
  options: SolidScriptFillPointsOptions,
  label: string,
): void {
  const { kept, local } = solidScriptFillPointsUnique(group, flatAll);
  const flat = kept.map((index) => flatAll[index]!);
  const hull = solidScriptFillPointsHull(flat);
  const edges = options.edges.flatMap(([a, b]): [number, number][] =>
    local.has(a) && local.has(b) ? [[local.get(a)!, local.get(b)!]] : [],
  );
  if (hull.length < 3) return;
  const how = { edges, label, regions: options.regions };
  solidScriptFillPointsBuild(
    mesh,
    kept.map((index) => points[index]!),
    flat,
    hull,
    how,
  );
}

/**
 * Splits the point numbers by their Group, in the order each group first
 * appears.
 *
 * @param count Number of points.
 * @param groups A group per point, or null for one group.
 * @param label Command, for messages.
 * @returns Point numbers of every group.
 */
function solidScriptFillPointsGroups(count: number, groups: readonly string[] | null, label: string): number[][] {
  const all = Array.from({ length: count }, (_, index) => index);
  if (!groups) return [all];
  if (groups.length !== count) throw new Error(`${label} needs one Group per point, ${count}, not ${groups.length}`);
  const split = new Map<string, number[]>();
  all.forEach((index) => split.set(groups[index] ?? '', [...(split.get(groups[index] ?? '') ?? []), index]));
  return [...split.values()];
}

/**
 * Inserts the non-hull points into a fan of triangles, keeps the kept edges,
 * turns other edges to empty each triangle's circle, and adds the points and
 * faces to a mesh.
 *
 * @param mesh Mesh to add to.
 * @param kept Points in space.
 * @param flat Points on the plane.
 * @param hull Convex hull corner numbers.
 * @param how Kept edges by point number in Kept, Regions, and the command for
 *   messages.
 */
function solidScriptFillPointsBuild(
  mesh: SolidScriptShapeMesh,
  kept: THREE.Vector3[],
  flat: THREE.Vector2[],
  hull: number[],
  how: { edges: readonly [number, number][]; regions: boolean; label: string },
): void {
  const triangles = hull.slice(1, -1).map((corner, at): BlastHoleTriangle => [hull[0]!, corner, hull[at + 2]!]);
  const onHull = new Set(hull);
  flat.forEach((_, index) => {
    if (!onHull.has(index) && !blastHoleInsertPoint(flat, triangles, index))
      solidScriptFillPointsSplitEdge(flat, triangles, index);
  });
  const fixed = solidScriptFillConstrain(flat, triangles, how.edges, how.label);
  blastHoleDelaunayFlip(flat, triangles, fixed);
  const faces = how.regions ? solidScriptFillRegions(triangles, fixed) : triangles;
  const base = mesh.points.length;
  mesh.points.push(...kept);
  mesh.faces.push(...faces.map((face) => face.map((corner) => base + corner)));
  mesh.uvs.push(...faces.map(() => null));
}

/**
 * Keeps the first of every set of points at the same place on the plane, and
 * numbers the kept ones from 0.
 *
 * @param group Point numbers of the group.
 * @param flat Every point on the plane.
 * @returns Point numbers kept, and the kept number of every point number in the
 *   group, a repeated point taking that of the first at its place.
 */
function solidScriptFillPointsUnique(
  group: readonly number[],
  flat: readonly THREE.Vector2[],
): { kept: number[]; local: Map<number, number> } {
  const kept: number[] = [];
  const local = new Map<number, number>();
  for (const index of group) {
    const same = kept.findIndex((other) => flat[other]!.distanceTo(flat[index]!) <= SOLID_SCRIPT_FILL_POINTS_MERGE);
    if (same < 0) kept.push(index);
    local.set(index, same < 0 ? kept.length - 1 : same);
  }
  return { kept, local };
}

/**
 * The corners of the convex hull round the points, counter-clockwise, by
 * walking the points sorted along X once each way; points on a straight stretch
 * are left for later.
 *
 * @param flat Points on the plane.
 * @returns Point numbers of the hull corners.
 */
function solidScriptFillPointsHull(flat: readonly THREE.Vector2[]): number[] {
  const sorted = flat.map((_, index) => index).sort((a, b) => flat[a]!.x - flat[b]!.x || flat[a]!.y - flat[b]!.y);
  const half = (order: readonly number[]): number[] => {
    const chain: number[] = [];
    for (const index of order) {
      while (
        chain.length >= 2 &&
        blastHoleCross(flat[chain[chain.length - 2]!]!, flat[chain[chain.length - 1]!]!, flat[index]!) <= 1e-12
      )
        chain.pop();
      chain.push(index);
    }
    return chain.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * Adds a point that lies on an edge: every triangle along that edge is split in
 * two at the point.
 *
 * @param flat Points on the plane.
 * @param triangles Triangles, changed in place.
 * @param index Number of the point.
 */
function solidScriptFillPointsSplitEdge(
  flat: readonly THREE.Vector2[],
  triangles: BlastHoleTriangle[],
  index: number,
): void {
  const point = flat[index]!;
  for (let at = triangles.length - 1; at >= 0; at--) {
    const triangle = triangles[at]!;
    for (let corner = 0; corner < 3; corner++) {
      const [a, b, c] = [0, 1, 2].map((step) => triangle[(corner + step) % 3]!) as BlastHoleTriangle;
      const along = flat[b]!.clone().sub(flat[a]!);
      const t = point.clone().sub(flat[a]!).dot(along) / along.lengthSq();
      if (Math.abs(blastHoleCross(flat[a]!, flat[b]!, point)) > 1e-9 * along.lengthSq() || t <= 0 || t >= 1) continue;
      triangles.splice(at, 1, [a, index, c], [index, b, c]);
      break;
    }
  }
}
