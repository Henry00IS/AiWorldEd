import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { solidScriptHullBrush } from './solid_script_body_hull.js';
import { solidScriptMeshLoopNormal } from './solid_script_mesh.js';

/**
 * Corners and faces of a convex solid: each face is a loop of corner numbers,
 * counter-clockwise seen from outside, the same layout a scene brush has.
 */
export interface SolidScriptBody {
  points: THREE.Vector3[];
  faces: number[][];
}

/**
 * Farthest a corner may lie off a face plane and still count as on it, in
 * metres.
 */
export const SOLID_SCRIPT_BODY_EPSILON = 1e-5;

/**
 * Reads the corners and faces of a brush, keeping its face order.
 *
 * @param brush Brush.
 * @returns Body.
 */
export function solidScriptBodyFromBrush(brush: SolidBrush): SolidScriptBody {
  return {
    points: brush.vertices.map((vertex) => vertex.clone()),
    faces: brush.faces.map((face) => brush.getFaceVertexIndices(face)),
  };
}

/**
 * The message for a solid with no volume.
 *
 * @param label Command or line.
 * @returns Message.
 */
function solidScriptBodyFlatMessage(label: string): string {
  return `${label} is flat or degenerate; give it a non-zero size on all three axes`;
}

/**
 * Builds the convex hull of loose points: the one place a script solid is made
 * from corners alone, such as a Polyhedron or the Hull block.
 *
 * @param points Points.
 * @param label Command or line, for the message.
 * @returns Body.
 */
export function solidScriptBodyHull(points: readonly THREE.Vector3[], label: string): SolidScriptBody {
  const brush = solidScriptHullBrush(points);
  if (!brush) throw new Error(solidScriptBodyFlatMessage(label));
  return solidScriptBodyFromBrush(brush);
}

/**
 * An axis-aligned box with the editor's own box faces.
 *
 * @param min Lowest corner.
 * @param max Highest corner.
 * @returns Body.
 */
export function solidScriptBodyBox(min: THREE.Vector3, max: THREE.Vector3): SolidScriptBody {
  return solidScriptBodyFromBrush(SolidBrushFactory.createBox(min, max));
}

/**
 * Face loops after a transform: a mirroring transform turns every loop around
 * so faces still wind counter-clockwise from outside.
 *
 * @param faces Face loops.
 * @param matrix Transform.
 * @returns Face loops.
 */
export function solidScriptBodyFacesMoved(faces: number[][], matrix: THREE.Matrix4): number[][] {
  return matrix.determinant() < 0 ? faces.map((loop) => [...loop].reverse()) : faces;
}

/**
 * Turns a body into a scene brush from its own faces, without a hull.
 *
 * @param body Body.
 * @param label Command or line, for the message.
 * @returns Brush.
 */
export function solidScriptBodyBrush(body: SolidScriptBody, label: string): SolidBrush {
  const brush = solidScriptBodySolid(body)
    ? SolidBrushFactory.createFromFaceLoops(body.faces.map((loop) => loop.map((index) => body.points[index]!)))
    : null;
  if (!brush) throw new Error(solidScriptBodyFlatMessage(label));
  return brush;
}

/**
 * Tells whether a body has volume: it has four faces or more and every face has
 * a corner well behind it.
 *
 * @param body Body.
 * @returns True when it does.
 */
export function solidScriptBodySolid(body: SolidScriptBody): boolean {
  if (body.faces.length < 4) return false;
  return body.faces.every((loop) => {
    const normal = solidScriptMeshLoopNormal(body.points, loop);
    if (normal.lengthSq() === 0) return false;
    const constant = normal.dot(body.points[loop[0]!]!);
    return body.points.some((point) => normal.dot(point) - constant < -SOLID_SCRIPT_BODY_EPSILON);
  });
}

/**
 * Tells whether a body's faces still make a strictly convex brush: every face
 * is flat and turns the same way at each corner, and every corner off a face
 * lies behind it. Much cheaper than a hull, so edits check with it first.
 *
 * @param body Body.
 * @returns True when it does.
 */
export function solidScriptBodyConvex(body: SolidScriptBody): boolean {
  if (!solidScriptBodySolid(body)) return false;
  return body.faces.every((loop) => {
    const normal = solidScriptMeshLoopNormal(body.points, loop);
    const constant = normal.dot(body.points[loop[0]!]!);
    const on = new Set(loop);
    return (
      solidScriptBodyLoopConvex(body.points, loop, normal) &&
      loop.every((index) => Math.abs(normal.dot(body.points[index]!) - constant) <= SOLID_SCRIPT_BODY_EPSILON) &&
      body.points.every((point, index) => on.has(index) || normal.dot(point) - constant < -SOLID_SCRIPT_BODY_EPSILON)
    );
  });
}

/**
 * Tells whether a face loop turns left at every corner around its normal.
 *
 * @param points Corners.
 * @param loop Face loop.
 * @param normal Face normal.
 * @returns True when it does.
 */
function solidScriptBodyLoopConvex(
  points: readonly THREE.Vector3[],
  loop: readonly number[],
  normal: THREE.Vector3,
): boolean {
  const into = new THREE.Vector3();
  const out = new THREE.Vector3();
  return loop.every((index, at) => {
    const before = points[loop[(at + loop.length - 1) % loop.length]!]!;
    const after = points[loop[(at + 1) % loop.length]!]!;
    into.subVectors(points[index]!, before);
    out.subVectors(after, points[index]!);
    return into.cross(out).dot(normal) > SOLID_SCRIPT_BODY_EPSILON * SOLID_SCRIPT_BODY_EPSILON;
  });
}

/**
 * Builds a body from given faces, welding corners that meet and dropping faces
 * that close up. Faces that do not lie flat, such as the twisted sides of an
 * unevenly scaled extrusion, are rebuilt from the corners instead.
 *
 * @param points Corners.
 * @param faces Face loops.
 * @param label Command or line, for the message.
 * @returns Body.
 */
export function solidScriptBodyFromLoops(
  points: readonly THREE.Vector3[],
  faces: readonly number[][],
  label: string,
): SolidScriptBody {
  const body = solidScriptBodyWelded(points, faces);
  return solidScriptBodyConvex(body) ? body : solidScriptBodyHull(body.points, label);
}

/**
 * Welds corners closer than the tolerance and drops repeated corners and faces
 * left with fewer than three.
 *
 * @param points Corners.
 * @param faces Face loops.
 * @returns Body.
 */
export function solidScriptBodyWelded(points: readonly THREE.Vector3[], faces: readonly number[][]): SolidScriptBody {
  const kept: THREE.Vector3[] = [];
  const map = points.map((point) => {
    const known = kept.findIndex((other) => other.distanceTo(point) <= SOLID_SCRIPT_BODY_EPSILON);
    if (known >= 0) return known;
    kept.push(point.clone());
    return kept.length - 1;
  });
  const loops = faces.map((loop) => solidScriptBodyLoopClean(loop.map((index) => map[index]!)));
  return { points: kept, faces: loops.filter((loop) => loop.length >= 3) };
}

/**
 * Drops corners that repeat the corner before them, around the loop.
 *
 * @param loop Face loop.
 * @returns Loop.
 */
function solidScriptBodyLoopClean(loop: readonly number[]): number[] {
  return loop.filter((index, at) => index !== loop[(at + loop.length - 1) % loop.length] || loop.length === 1);
}

/**
 * A prism between two matching flat loops, such as a face and its offset copy:
 * the loops become the end faces and each pair of edges a side.
 *
 * @param bottom First loop.
 * @param top Matching second loop.
 * @param label Command or line, for the message.
 * @returns Body.
 */
export function solidScriptBodyPrism(
  bottom: readonly THREE.Vector3[],
  top: readonly THREE.Vector3[],
  label: string,
): SolidScriptBody {
  const count = bottom.length;
  const points = [...bottom, ...top];
  const lower = bottom.map((_, index) => index);
  const way = solidScriptMeshLoopNormal(points, lower);
  const rise = top
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .sub(bottom.reduce((sum, point) => sum.add(point), new THREE.Vector3()));
  const order = way.dot(rise) >= 0 ? lower : [...lower].reverse();
  const sides = order.map((index, at) => {
    const next = order[(at + 1) % count]!;
    return [index, next, next + count, index + count];
  });
  return solidScriptBodyFromLoops(points, [[...order].reverse(), order.map((index) => index + count), ...sides], label);
}
