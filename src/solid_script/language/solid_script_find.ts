import * as THREE from 'three';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptValueNumbers } from './solid_script_value.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';

/** How Find On can look for a face. */
export const SOLID_SCRIPT_FIND_HOW = ['Closest', 'Ray'] as const;

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
 * Finds the closest point on the faces to From, or the first hit along a ray.
 *
 * @param run Running line.
 * @param faces Faces to search.
 * @returns The hit, or a miss.
 */
export function solidScriptFindOn(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): SolidScriptFindHit {
  const from = solidScriptFindVector(run, 'from', 'From');
  const how = solidScriptFindHow(run);
  if (how === 'Ray') return solidScriptFindRay(from, solidScriptFindDirection(run), faces);
  return solidScriptFindClosest(from, faces);
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
  if (!match) throw new Error(`How needs Closest or Ray, not ${text}`);
  return match;
}

/**
 * Reads a three-number vector field.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field caption.
 * @returns Vector.
 */
function solidScriptFindVector(run: SolidScriptBlockRun, key: string, label: string): THREE.Vector3 {
  const numbers = solidScriptValueNumbers(run.value(key));
  const x = numbers?.[0];
  const y = numbers?.[1];
  const z = numbers?.[2];
  if (!numbers || numbers.length !== 3 || x === undefined || y === undefined || z === undefined)
    throw new Error(`${label} needs three numbers, such as 0, 0, 0`);
  return new THREE.Vector3(x, y, z);
}

/**
 * Reads the ray Direction, which must not be zero.
 *
 * @param run Running line.
 * @returns Unit direction.
 */
function solidScriptFindDirection(run: SolidScriptBlockRun): THREE.Vector3 {
  const direction = solidScriptFindVector(run, 'direction', 'Direction');
  if (direction.lengthSq() < 1e-18) throw new Error('Direction needs a direction that is not 0, 0, 0');
  return direction.normalize();
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
