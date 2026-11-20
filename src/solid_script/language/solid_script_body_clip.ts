import * as THREE from 'three';
import { SOLID_SCRIPT_BODY_EPSILON, solidScriptBodyWelded, type SolidScriptBody } from './solid_script_body.js';
import { solidScriptMeshLoopNormal } from './solid_script_mesh.js';

/** A body being rebuilt as its faces are clipped. */
interface SolidScriptBodyClipBuild {
  body: SolidScriptBody;
  /** Signed distance of every old corner from the plane. */
  sides: number[];
  /** New number of every kept old corner. */
  kept: Map<number, number>;
  /** New number of the point where the plane crosses an old edge. */
  crossings: Map<string, number>;
}

/**
 * Cuts a convex body with a plane and keeps the part behind it: each face is
 * cut along the plane and one new face closes the cut, so the faces that stay
 * keep their corners and order.
 *
 * @param body Body.
 * @param normal Unit plane direction; the part it points toward is cut away.
 * @param constant Plane offset: points p with normal · p = constant lie on it.
 * @returns Kept body; it may be flat when the plane leaves no thickness.
 */
export function solidScriptBodyClip(body: SolidScriptBody, normal: THREE.Vector3, constant: number): SolidScriptBody {
  const sides = body.points.map((point) => normal.dot(point) - constant);
  if (sides.every((side) => side <= SOLID_SCRIPT_BODY_EPSILON)) return body;
  const build: SolidScriptBodyClipBuild = {
    body: { points: [], faces: [] },
    sides,
    kept: new Map(),
    crossings: new Map(),
  };
  for (const loop of body.faces) {
    const face = solidScriptBodyClipFace(body, loop, build);
    if (face.length >= 3) build.body.faces.push(face);
  }
  const cap = solidScriptBodyClipCap(build.body, normal, constant);
  if (cap) build.body.faces.push(cap);
  return solidScriptBodyWelded(build.body.points, build.body.faces);
}

/**
 * Cuts one face loop and returns the part behind the plane.
 *
 * @param body Old body.
 * @param loop Face loop.
 * @param build Body being rebuilt.
 * @returns New face loop; fewer than three corners when the face is cut away.
 */
function solidScriptBodyClipFace(
  body: SolidScriptBody,
  loop: readonly number[],
  build: SolidScriptBodyClipBuild,
): number[] {
  const face: number[] = [];
  loop.forEach((index, at) => {
    const next = loop[(at + 1) % loop.length]!;
    if (build.sides[index]! <= SOLID_SCRIPT_BODY_EPSILON) face.push(solidScriptBodyClipKept(body, index, build));
    const crossing = solidScriptBodyClipCrossing(body, index, next, build);
    if (crossing !== undefined) face.push(crossing);
  });
  return face;
}

/**
 * New number of a kept old corner, adding it the first time.
 *
 * @param body Old body.
 * @param index Old corner number.
 * @param build Body being rebuilt.
 * @returns New corner number.
 */
function solidScriptBodyClipKept(body: SolidScriptBody, index: number, build: SolidScriptBodyClipBuild): number {
  const known = build.kept.get(index);
  if (known !== undefined) return known;
  build.body.points.push(body.points[index]!.clone());
  build.kept.set(index, build.body.points.length - 1);
  return build.body.points.length - 1;
}

/**
 * New number of the point where the plane crosses an edge, when it does.
 *
 * @param body Old body.
 * @param a Edge start.
 * @param b Edge end.
 * @param build Body being rebuilt.
 * @returns New corner number, or undefined when the edge does not cross.
 */
function solidScriptBodyClipCrossing(
  body: SolidScriptBody,
  a: number,
  b: number,
  build: SolidScriptBodyClipBuild,
): number | undefined {
  const da = build.sides[a]!;
  const db = build.sides[b]!;
  const crosses =
    (da < -SOLID_SCRIPT_BODY_EPSILON && db > SOLID_SCRIPT_BODY_EPSILON) ||
    (db < -SOLID_SCRIPT_BODY_EPSILON && da > SOLID_SCRIPT_BODY_EPSILON);
  if (!crosses) return undefined;
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const known = build.crossings.get(key);
  if (known !== undefined) return known;
  const [from, to, t] = a < b ? [a, b, da / (da - db)] : [b, a, db / (db - da)];
  build.body.points.push(body.points[from]!.clone().lerp(body.points[to]!, t));
  build.crossings.set(key, build.body.points.length - 1);
  return build.body.points.length - 1;
}

/**
 * The face that closes the cut: every new corner on the plane, in order around
 * their middle and facing along the plane. None when a kept face already lies
 * on the plane or fewer than three corners touch it.
 *
 * @param body Rebuilt body without its cap.
 * @param normal Unit plane direction.
 * @param constant Plane offset.
 * @returns Cap loop, or null.
 */
function solidScriptBodyClipCap(body: SolidScriptBody, normal: THREE.Vector3, constant: number): number[] | null {
  const on = (index: number) => Math.abs(normal.dot(body.points[index]!) - constant) <= SOLID_SCRIPT_BODY_EPSILON;
  const cap = body.points.map((_, index) => index).filter(on);
  if (cap.length < 3 || body.faces.some((loop) => loop.every(on))) return null;
  const middle = cap.reduce((sum, index) => sum.add(body.points[index]!), new THREE.Vector3()).divideScalar(cap.length);
  const across = body.points[cap[0]!]!.clone().sub(middle).normalize();
  const up = normal.clone().cross(across);
  const angle = (index: number) => {
    const offset = body.points[index]!.clone().sub(middle);
    return Math.atan2(offset.dot(up), offset.dot(across));
  };
  const loop = cap.sort((a, b) => angle(a) - angle(b));
  return solidScriptMeshLoopNormal(body.points, loop).dot(normal) < 0 ? loop.reverse() : loop;
}
