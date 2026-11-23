import * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptPathFrame } from './solid_script_path_shape.js';
import {
  blastHoleDelaunayFlip,
  blastHoleInsertPoint,
  type BlastHoleTriangle,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_triangulate.js';
import { blastHoleCross } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_simple.js';

/** Most points Fill Points takes. */
export const SOLID_SCRIPT_FILL_POINTS_LIMIT = 5000;

/** Points closer than this on the plane count as one. */
const SOLID_SCRIPT_FILL_POINTS_MERGE = 1e-9;

/**
 * Fills loose points with triangles whose circles hold no other point, seen on
 * the plane facing Normal; the mesh covers the convex hull round all points.
 * Points repeated on the plane are kept once.
 *
 * @param points Points.
 * @param normal Direction the plane and the faces look.
 * @param label Command, for messages.
 * @returns Mesh of triangles facing Normal.
 */
export function solidScriptFillPoints(
  points: readonly THREE.Vector3[],
  normal: THREE.Vector3,
  label: string,
): SolidScriptShapeMesh {
  if (points.length > SOLID_SCRIPT_FILL_POINTS_LIMIT)
    throw new Error(`${label} takes at most ${SOLID_SCRIPT_FILL_POINTS_LIMIT} points; use fewer points`);
  const frame = solidScriptPathFrame(normal, label);
  const kept = solidScriptFillPointsUnique(points, frame);
  const flat = kept.map((point) => new THREE.Vector2(point.dot(frame.x), point.dot(frame.y)));
  const hull = solidScriptFillPointsHull(flat);
  if (hull.length < 3) throw new Error(`${label} needs at least 3 points that are not all in one line`);
  return solidScriptFillPointsBuild(kept, flat, hull);
}

/**
 * Inserts the non-hull points into a fan of triangles, then turns edges to
 * empty each triangle's circle.
 *
 * @param kept Points in space.
 * @param flat Points on the plane.
 * @param hull Convex hull corner numbers.
 * @returns Triangulated mesh.
 */
function solidScriptFillPointsBuild(
  kept: THREE.Vector3[],
  flat: THREE.Vector2[],
  hull: number[],
): SolidScriptShapeMesh {
  const triangles = hull.slice(1, -1).map((corner, at): BlastHoleTriangle => [hull[0]!, corner, hull[at + 2]!]);
  const onHull = new Set(hull);
  flat.forEach((_, index) => {
    if (!onHull.has(index) && !blastHoleInsertPoint(flat, triangles, index))
      solidScriptFillPointsSplitEdge(flat, triangles, index);
  });
  blastHoleDelaunayFlip(flat, triangles);
  return { kind: 'mesh', label: 'mesh', points: kept, faces: triangles, uvs: triangles.map(() => null) };
}

/**
 * Keeps the first of every group of points at the same place on the plane.
 *
 * @param points Points.
 * @param frame Plane axes.
 * @returns Points left.
 */
function solidScriptFillPointsUnique(
  points: readonly THREE.Vector3[],
  frame: { x: THREE.Vector3; y: THREE.Vector3 },
): THREE.Vector3[] {
  const seen: THREE.Vector2[] = [];
  return points.filter((point) => {
    const flat = new THREE.Vector2(point.dot(frame.x), point.dot(frame.y));
    if (seen.some((other) => other.distanceTo(flat) <= SOLID_SCRIPT_FILL_POINTS_MERGE)) return false;
    seen.push(flat);
    return true;
  });
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
