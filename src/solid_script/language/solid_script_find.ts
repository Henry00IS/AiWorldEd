import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptFindAtUv } from './solid_script_find_uv.js';
import { solidScriptVectorThreeRequire } from './solid_script_vector.js';

/** How a find block looks for a face: Find Closest, Raycast or Find At UV. */
export type SolidScriptFindHow = 'Closest' | 'Raycast' | 'At UV';

/** The face a find block hit, or a miss. */
export interface SolidScriptFindHit {
  hit: boolean;
  position?: THREE.Vector3;
  distance?: number;
  normal?: THREE.Vector3;
  face?: SolidScriptFaceFacts;
}

/**
 * What a find block found: one hit, or one per item when From or Direction is a
 * list.
 */
export interface SolidScriptFindFound {
  hits: SolidScriptFindHit[];
  /** Whether From or Direction gave a list, so every result is a list. */
  listed: boolean;
}

/** What Find Closest measures to: face surfaces, face edges or corners. */
export const SOLID_SCRIPT_FIND_TARGETS = ['Faces', 'Edges', 'Corners'] as const;

/** One of the Target words. */
export type SolidScriptFindTarget = (typeof SOLID_SCRIPT_FIND_TARGETS)[number];

/**
 * Finds the closest point on the faces to From, the first hit along a ray, or
 * the point at a UV. A list of points in From (or UV), or of directions in
 * Direction, gives one find per item; a single value is used for every item. A
 * find further than Max Distance is a miss.
 *
 * @param run Running line.
 * @param faces Faces to search.
 * @param how How the block looks.
 * @returns The hits, or misses.
 */
export function solidScriptFindOn(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  how: SolidScriptFindHow,
): SolidScriptFindFound {
  const froms = how === 'At UV' ? solidScriptFindVectors(run, 'uv', 'UV') : solidScriptFindVectors(run, 'from', 'From');
  const directions = how === 'Raycast' ? solidScriptFindVectors(run, 'direction', 'Direction') : null;
  const sizes = [froms, directions].flatMap((list) => (list && list.listed ? [list.vectors.length] : []));
  if (new Set(sizes).size > 1) throw new Error('From and Direction need the same number of items, or one of them one');
  const target = how === 'Closest' ? solidScriptFindWord(run, 'target', SOLID_SCRIPT_FIND_TARGETS, 'Target') : 'Faces';
  const limit = solidScriptFindLimit(run);
  const at = <T>(list: readonly T[], index: number): T => list[list.length === 1 ? 0 : index]!;
  const hits = Array.from({ length: sizes[0] ?? 1 }, (_, index) => {
    const from = at(froms.vectors, index);
    const direction = directions ? at(directions.vectors, index) : null;
    const hit = solidScriptFindOne(how, from, direction, faces, target);
    return hit.distance !== undefined && hit.distance > limit ? { hit: false } : hit;
  });
  return { hits, listed: sizes.length > 0 };
}

/**
 * Finds once, the way How asks.
 *
 * @param how How to look.
 * @param from Point to measure from, start of the ray, or UV point.
 * @param direction Ray direction, for Raycast.
 * @param faces Faces to search.
 * @param target What Closest measures to.
 * @returns The hit, or a miss.
 */
function solidScriptFindOne(
  how: SolidScriptFindHow,
  from: THREE.Vector3,
  direction: THREE.Vector3 | null,
  faces: readonly SolidScriptFaceFacts[],
  target: SolidScriptFindTarget,
): SolidScriptFindHit {
  if (direction) return solidScriptFindRayFrom(from, direction, faces);
  return how === 'At UV' ? solidScriptFindAtUv(from, faces) : solidScriptFindClosest(from, faces, target);
}

/**
 * Casts one ray, after checking its direction.
 *
 * @param from Ray origin.
 * @param direction Direction, any length but 0.
 * @param faces Faces.
 * @returns The first hit, or a miss.
 */
function solidScriptFindRayFrom(
  from: THREE.Vector3,
  direction: THREE.Vector3,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptFindHit {
  if (direction.lengthSq() < 1e-18) throw new Error('Direction needs a direction that is not 0, 0, 0');
  return solidScriptFindRay(from, direction.clone().normalize(), faces);
}

/**
 * Reads Max Distance: empty finds at any distance.
 *
 * @param run Running line.
 * @returns Furthest distance a find may be, in metres.
 */
function solidScriptFindLimit(run: SolidScriptBlockRun): number {
  if (run.source('max_distance').trim() === '') return Number.POSITIVE_INFINITY;
  const value = run.value('max_distance');
  if (typeof value !== 'number' || value < 0) throw new Error('Max Distance needs a number of metres of 0 or more');
  return value;
}

/**
 * Reads a word field, or its first word when the field is empty.
 *
 * @param run Running line.
 * @param key Field key.
 * @param words Words it may hold, the first being the default.
 * @param label Field caption.
 * @returns Word.
 */
export function solidScriptFindWord<T extends string>(
  run: SolidScriptBlockRun,
  key: string,
  words: readonly T[],
  label: string,
): T {
  const text = run.text(key).trim() || words[0]!;
  const match = words.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`${label} needs ${words.join(', ')}, not ${text}`);
  return match;
}

/**
 * Reads a field of one vector, or a list of vectors.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Vectors, and whether the field gave a list: more than one item or a
 *   variable; one vector or a formula of one is not.
 */
function solidScriptFindVectors(
  run: SolidScriptBlockRun,
  key: string,
  label: string,
): { vectors: THREE.Vector3[]; listed: boolean } {
  const value = run.value(key);
  const items = Array.isArray(value) && value.length > 0 && value.every(Array.isArray) ? value : [value];
  const listed = items.length !== 1 || /^\s*\[[^[\]=,]+\]\s*$/.test(run.source(key));
  const vectors = items.map((item) => {
    return solidScriptVectorThreeRequire(item, `${label} needs a vector, such as 0, 0, 0, or a list of them`);
  });
  return { vectors, listed };
}

/**
 * Finds the closest point to a point on the faces' surfaces, edges or corners.
 *
 * @param from Point to measure from.
 * @param faces Faces.
 * @param target What to measure to.
 * @returns The closest hit, or a miss when there is nothing to measure to.
 */
function solidScriptFindClosest(
  from: THREE.Vector3,
  faces: readonly SolidScriptFaceFacts[],
  target: SolidScriptFindTarget,
): SolidScriptFindHit {
  let best: SolidScriptFindHit = { hit: false };
  for (const { point, face } of solidScriptFindNearPoints(from, faces, target)) {
    const distance = point.distanceTo(from);
    if (best.distance !== undefined && distance >= best.distance) continue;
    best = { hit: true, position: point, distance, normal: face.normal, face };
  }
  return best;
}

/**
 * Lists, per triangle, edge or corner of the faces, its point closest to From.
 *
 * @param from Point to measure from.
 * @param faces Faces.
 * @param target What to measure to.
 * @returns Closest points with the face they belong to.
 */
function solidScriptFindNearPoints(
  from: THREE.Vector3,
  faces: readonly SolidScriptFaceFacts[],
  target: SolidScriptFindTarget,
): { point: THREE.Vector3; face: SolidScriptFaceFacts }[] {
  if (target === 'Faces')
    return solidScriptFindTriangles(faces).map((triangle) => ({
      point: triangle.area.closestPointToPoint(from, new THREE.Vector3()),
      face: triangle.face,
    }));
  return faces.flatMap((face) =>
    face.corners.map((corner, index) => {
      if (target === 'Corners') return { point: corner.clone(), face };
      const next = face.corners[(index + 1) % face.corners.length]!;
      return { point: new THREE.Line3(corner, next).closestPointToPoint(from, true, new THREE.Vector3()), face };
    }),
  );
}

/**
 * Finds the first face the ray hits in front of From.
 *
 * @param from Ray origin.
 * @param direction Unit direction.
 * @param faces Faces.
 * @returns The first hit, or a miss.
 */
function solidScriptFindRay(
  from: THREE.Vector3,
  direction: THREE.Vector3,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptFindHit {
  const ray = new THREE.Ray(from, direction);
  const point = new THREE.Vector3();
  let best: SolidScriptFindHit = { hit: false };
  for (const triangle of solidScriptFindTriangles(faces)) {
    const hit = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point);
    if (!hit) continue;
    const distance = hit.distanceTo(from);
    if (best.distance !== undefined && distance >= best.distance) continue;
    best = { hit: true, position: hit.clone(), distance, normal: triangle.face.normal, face: triangle.face };
  }
  return best;
}

/** One triangle of a face, with its corners. */
interface SolidScriptFindTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  area: THREE.Triangle;
  face: SolidScriptFaceFacts;
}

/**
 * Lists every triangle of the faces, fanning from the first corner.
 *
 * @param faces Faces.
 * @returns Triangles.
 */
function solidScriptFindTriangles(faces: readonly SolidScriptFaceFacts[]): SolidScriptFindTriangle[] {
  const triangles: SolidScriptFindTriangle[] = [];
  for (const face of faces)
    for (let corner = 1; corner + 1 < face.corners.length; corner++) {
      const a = face.corners[0];
      const b = face.corners[corner];
      const c = face.corners[corner + 1];
      if (!a || !b || !c) continue;
      triangles.push({ a, b, c, area: new THREE.Triangle(a, b, c), face });
    }
  return triangles;
}
