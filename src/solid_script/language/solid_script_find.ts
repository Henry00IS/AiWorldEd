import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptValueNumbers } from './solid_script_value.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';

/** How Find On can look for a face. */
export const SOLID_SCRIPT_FIND_HOW = ['Closest', 'Along Ray'] as const;

/** One of the How words. */
export type SolidScriptFindHow = (typeof SOLID_SCRIPT_FIND_HOW)[number];

/** The face Find On hit, or a miss. */
export interface SolidScriptFindHit {
  hit: boolean;
  position?: THREE.Vector3;
  distance?: number;
  normal?: THREE.Vector3;
  face?: SolidScriptFaceFacts;
}

/**
 * What Find On found: one hit, or one per item when From or Direction is a
 * list.
 */
export interface SolidScriptFindFound {
  hits: SolidScriptFindHit[];
  /** Whether From or Direction gave a list, so every result is a list. */
  listed: boolean;
}

/**
 * Finds the closest point on the faces to From, or the first hit along a ray. A
 * list of points in From, or of directions in Direction, gives one find per
 * item; a single value is used for every item.
 *
 * @param run Running line.
 * @param faces Faces to search.
 * @returns The hits, or misses.
 */
export function solidScriptFindOn(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptFindFound {
  const how = solidScriptFindHow(run);
  const froms = solidScriptFindVectors(run, 'from', 'From');
  const directions = how === 'Along Ray' ? solidScriptFindVectors(run, 'direction', 'Direction') : null;
  const sizes = [froms, directions].flatMap((list) => (list && list.listed ? [list.vectors.length] : []));
  if (new Set(sizes).size > 1) throw new Error('From and Direction need the same number of items, or one of them one');
  const count = sizes[0] ?? 1;
  const at = <T>(list: readonly T[], index: number): T => list[list.length === 1 ? 0 : index]!;
  const hits = Array.from({ length: count }, (_, index) => {
    const from = at(froms.vectors, index);
    if (!directions) return solidScriptFindClosest(from, faces);
    const direction = at(directions.vectors, index);
    if (direction.lengthSq() < 1e-18) throw new Error('Direction needs a direction that is not 0, 0, 0');
    return solidScriptFindRay(from, direction.clone().normalize(), faces);
  });
  return { hits, listed: sizes.length > 0 };
}

/**
 * Reads How, or Closest when the field is empty.
 *
 * @param run Running line.
 * @returns How word.
 */
function solidScriptFindHow(run: SolidScriptBlockRun): SolidScriptFindHow {
  const text = run.text('how').trim() || 'Closest';
  const match = SOLID_SCRIPT_FIND_HOW.find((word) => word.toLowerCase() === text.toLowerCase());
  if (!match) throw new Error(`How needs Closest or Along Ray, not ${text}`);
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
    const numbers = solidScriptValueNumbers(item);
    if (!numbers || numbers.length !== 3)
      throw new Error(`${label} needs three numbers, such as 0, 0, 0, or a list of them`);
    return new THREE.Vector3(numbers[0], numbers[1], numbers[2]);
  });
  return { vectors, listed };
}

/**
 * Finds the closest point on any face triangle to a point.
 *
 * @param from Point to measure from.
 * @param faces Faces.
 * @returns The closest hit, or a miss when there are no triangles.
 */
function solidScriptFindClosest(from: THREE.Vector3, faces: readonly SolidScriptFaceFacts[]): SolidScriptFindHit {
  let best: SolidScriptFindHit = { hit: false };
  const point = new THREE.Vector3();
  for (const triangle of solidScriptFindTriangles(faces)) {
    triangle.area.closestPointToPoint(from, point);
    const distance = point.distanceTo(from);
    if (best.distance !== undefined && distance >= best.distance) continue;
    best = { hit: true, position: point.clone(), distance, normal: triangle.face.normal, face: triangle.face };
  }
  return best;
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
