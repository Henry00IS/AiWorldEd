import * as THREE from 'three';
import type { SolidScriptEdgeFacts, SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptFaceCornerUvs } from './solid_script_uvs.js';

/** Closest two points or UVs may be and still count as the same. */
const SOLID_SCRIPT_CORNER_SAME = 1e-6;

/**
 * Gives the angle inside a face at each of its corners, in corner order.
 *
 * @param face Face.
 * @returns Degrees per corner.
 */
export function solidScriptCornerAngles(face: SolidScriptFaceFacts): number[] {
  const corners = face.corners;
  return corners.map((corner, index) => {
    const before = corners[(index + corners.length - 1) % corners.length] ?? corner;
    const after = corners[(index + 1) % corners.length] ?? corner;
    return THREE.MathUtils.radToDeg(before.clone().sub(corner).angleTo(after.clone().sub(corner)));
  });
}

/**
 * Tells whether the faces at a point give it different UVs.
 *
 * @param faces Faces of the object.
 * @param point Corner position.
 * @returns True when two faces using the point disagree on its UV.
 */
export function solidScriptCornerUvSplit(faces: readonly SolidScriptFaceFacts[], point: THREE.Vector3): boolean {
  const uvs = faces.flatMap((face) => {
    const uv = solidScriptCornerUvAt(face, point);
    return uv ? [uv] : [];
  });
  return uvs.some((uv) => solidScriptCornerUvDiffers(uv, uvs[0]));
}

/**
 * Tells whether the two faces at an edge give either of its ends different UVs.
 *
 * @param edge Edge piece.
 * @returns True when the faces disagree; an edge with one face is never split.
 */
export function solidScriptCornerEdgeUvSplit(edge: SolidScriptEdgeFacts): boolean {
  const [first, second] = edge.faces;
  if (!second) return false;
  return [edge.start, edge.end].some((point) =>
    solidScriptCornerUvDiffers(solidScriptCornerUvAt(first, point), solidScriptCornerUvAt(second, point)),
  );
}

/**
 * Reads a face's UV at one of its corners.
 *
 * @param face Face.
 * @param point Corner position.
 * @returns UV, or undefined when the face has no corner there.
 */
function solidScriptCornerUvAt(face: SolidScriptFaceFacts, point: THREE.Vector3): [number, number] | undefined {
  const index = face.corners.findIndex((corner) => corner.distanceTo(point) < SOLID_SCRIPT_CORNER_SAME);
  return index < 0 ? undefined : solidScriptFaceCornerUvs(face)[index];
}

/**
 * Tells whether two UVs differ; a missing one never differs.
 *
 * @param a First UV.
 * @param b Second UV.
 * @returns True when both are given and apart.
 */
function solidScriptCornerUvDiffers(a: [number, number] | undefined, b: [number, number] | undefined): boolean {
  if (!a || !b) return false;
  return Math.hypot(a[0] - b[0], a[1] - b[1]) > SOLID_SCRIPT_CORNER_SAME;
}

/** Most a face's corners may spread along its normal and still count as flat. */
const SOLID_SCRIPT_CORNER_PLANAR = 0.01;

/**
 * Measures how far a face is bent: how far its corners spread along its normal,
 * 0 for a flat face.
 *
 * @param pieces Pieces of the face, at least one.
 * @returns Spread in metres.
 */
export function solidScriptCornerWarp(pieces: readonly SolidScriptFaceFacts[]): number {
  const normal = pieces[0]?.normal;
  if (!normal) return 0;
  const heights = pieces.flatMap((face) => face.corners.map((corner) => corner.dot(normal)));
  return Math.max(...heights) - Math.min(...heights);
}

/**
 * Tells whether a face is flat: its corners spread less than a centimetre along
 * its normal.
 *
 * @param pieces Pieces of the face, at least one.
 * @returns True for a flat face.
 */
export function solidScriptCornerPlanar(pieces: readonly SolidScriptFaceFacts[]): boolean {
  return solidScriptCornerWarp(pieces) <= SOLID_SCRIPT_CORNER_PLANAR;
}
