import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { fitSurfaceUvMatrixFromWorldSamples } from '@/texture/uv_matrix/surface_uv_matrix_fit.js';
import { createDefaultFaceSurface, orientDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { textureUvProjectAxis, textureUvProjectPoint } from '@/texture/uv_project/texture_uv_project_view.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptValueNumbers, type SolidScriptValue } from './solid_script_value.js';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import type { SolidScriptFaceUv, SolidScriptShapeSolid } from './solid_script_shape.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/** Closest a stored UV record may be to a face plane to count as that face. */
const SOLID_SCRIPT_FACE_UV_ALIGN = 0.99;
const SOLID_SCRIPT_FACE_UV_GAP = 1e-4;

/**
 * Builds a stored UV record for one face, in script space.
 *
 * @param face Face facts.
 * @param uv UV matrix in script space.
 * @returns Record.
 */
export function solidScriptFaceUvRecord(face: SolidScriptFaceFacts, uv: SurfaceUvMatrix): SolidScriptFaceUv {
  return { point: face.center.clone(), normal: face.normal.clone(), uv };
}

/**
 * Replaces the UV records of the given faces on a solid, leaving other faces as
 * they were.
 *
 * @param leaf Solid.
 * @param added Records to store.
 * @returns Solid with those records.
 */
export function solidScriptSolidFaceUvsWrite(
  leaf: SolidScriptShapeSolid,
  added: readonly SolidScriptFaceUv[],
): SolidScriptShapeSolid {
  const kept = (leaf.faceUvs ?? []).filter((old) => !added.some((next) => solidScriptFaceUvSame(old, next)));
  const { boxUvSize: _boxUvSize, ...rest } = leaf;
  void _boxUvSize;
  return { ...rest, faceUvs: [...kept, ...added] };
}

/**
 * Tells whether two records describe the same face plane.
 *
 * @param left First record.
 * @param right Second record.
 * @returns True when they share a plane.
 */
function solidScriptFaceUvSame(left: SolidScriptFaceUv, right: SolidScriptFaceUv): boolean {
  return (
    left.normal.dot(right.normal) >= SOLID_SCRIPT_FACE_UV_ALIGN &&
    Math.abs(left.normal.dot(left.point.clone().sub(right.point))) <= SOLID_SCRIPT_FACE_UV_GAP
  );
}

/**
 * Moves stored UV records with a solid: points and normals follow the matrix,
 * and each UV matrix is multiplied by its inverse so the mapping stays on the
 * face.
 *
 * @param records Records in the old space.
 * @param matrix Transform applied to the solid's points.
 * @returns Records in the new space.
 */
export function solidScriptFaceUvsTransform(
  records: readonly SolidScriptFaceUv[],
  matrix: THREE.Matrix4,
): SolidScriptFaceUv[] {
  const normals = new THREE.Matrix3().getNormalMatrix(matrix);
  const inverse = matrix.clone().invert();
  return records.map((face) => ({
    point: face.point.clone().applyMatrix4(matrix),
    normal: face.normal.clone().applyMatrix3(normals).normalize(),
    uv: face.uv.multiplyMatrix4(inverse),
  }));
}

/**
 * Finds the stored UV matrix of a face, or a box projection, or the default
 * mapping aimed at the face.
 *
 * @param face Face facts.
 * @returns UV matrix in script space.
 */
export function solidScriptFaceUvMatrix(face: SolidScriptFaceFacts): SurfaceUvMatrix {
  const leaf = face.leaf;
  if (leaf.kind === 'solid') {
    const stored = solidScriptFaceUvLookup(leaf, face.center, face.normal);
    if (stored) return stored;
    if (leaf.boxUvSize !== undefined && leaf.boxUvSize > 0) return textureUvProjectAxis(face.normal, leaf.boxUvSize);
  }
  return orientDefaultFaceSurface(createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID), face.normal).uv;
}

/**
 * Finds a stored matrix whose plane matches a point and normal.
 *
 * @param leaf Solid.
 * @param point A point on the face, in script space.
 * @param normal Face normal in script space.
 * @returns Matrix, or null when none matches.
 */
export function solidScriptFaceUvLookup(
  leaf: SolidScriptShapeSolid,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): SurfaceUvMatrix | null {
  for (const record of leaf.faceUvs ?? []) {
    if (
      record.normal.dot(normal) >= SOLID_SCRIPT_FACE_UV_ALIGN &&
      Math.abs(record.normal.dot(record.point.clone().sub(point))) <= SOLID_SCRIPT_FACE_UV_GAP
    )
      return record.uv;
  }
  return null;
}

/**
 * Reads the UV of every corner of a face, from stored records, mesh corners, or
 * the default mapping.
 *
 * @param face Face facts.
 * @returns U and V of each corner, in order.
 */
export function solidScriptFaceCornerUvs(face: SolidScriptFaceFacts): [number, number][] {
  const leaf = face.leaf;
  if (leaf.kind === 'mesh') {
    const stored = leaf.uvs[face.index];
    if (stored && stored.length === face.corners.length) return stored.map(([u, v]) => [u, v]);
  }
  const matrix = solidScriptFaceUvMatrix(face);
  return face.corners.map((corner) => textureUvProjectPoint(matrix, corner));
}

/**
 * Writes per-corner UVs onto a mesh face.
 *
 * @param leaf Mesh.
 * @param index Face index.
 * @param uvs Corner coordinates in order.
 * @returns Mesh with those coordinates.
 */
export function solidScriptMeshFaceUvsWrite(
  leaf: SolidScriptShapeMesh,
  index: number,
  uvs: readonly [number, number][],
): SolidScriptShapeMesh {
  const next = leaf.uvs.map((entry, entryIndex) =>
    entryIndex === index ? uvs.map(([u, v]) => [u, v] as [number, number]) : entry,
  );
  return { ...leaf, uvs: next };
}

/**
 * Bounds centre of a solid or mesh, in script space.
 *
 * @param leaf Solid or mesh.
 * @returns Centre.
 */
export function solidScriptLeafCentre(leaf: SolidScriptGeometryLeaf): THREE.Vector3 {
  const points = leaf.kind === 'solid' ? leaf.points : leaf.points;
  const box = new THREE.Box3().setFromPoints(points);
  return box.getCenter(new THREE.Vector3());
}

/**
 * Reads a list of corner UVs from a value, such as a list of vectors; Z is
 * ignored.
 *
 * @param value Value.
 * @returns U and V of each corner.
 */
export function solidScriptUvsFromValue(value: SolidScriptValue): [number, number][] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Face.UVs needs a list of U and V pairs, one per corner');
  return value.map((item, index) => {
    const numbers = solidScriptValueNumbers(Array.isArray(item) ? [...item] : item);
    if (!numbers || (numbers.length !== 2 && numbers.length !== 3))
      throw new Error(`Face.UVs item ${index} needs two or three numbers, such as 0, 0, 0`);
    const u = numbers[0];
    const v = numbers[1];
    if (u === undefined || v === undefined)
      throw new Error(`Face.UVs item ${index} needs two or three numbers, such as 0, 0, 0`);
    return [u, v];
  });
}

/**
 * How close a fitted UV must be to each given corner, or the mapping is not
 * planar.
 */
const SOLID_SCRIPT_FACE_UV_FIT = 1e-4;

/**
 * Fits a planar UV matrix to corner UVs of a face, or stops when they are not a
 * planar mapping.
 *
 * @param face Face facts.
 * @param uvs Corner UVs in order.
 * @returns Fitted record.
 */
export function solidScriptFaceUvsFit(face: SolidScriptFaceFacts, uvs: readonly [number, number][]): SolidScriptFaceUv {
  if (uvs.length !== face.corners.length)
    throw new Error(`Face.UVs needs ${face.corners.length} corners, not ${uvs.length}`);
  const samples = face.corners.map((corner, index) => {
    const uv = uvs[index];
    if (!uv) throw new Error('Face.UVs needs a U and V for every corner');
    return { world: corner, u: uv[0], v: uv[1] };
  });
  const fitted = fitSurfaceUvMatrixFromWorldSamples(samples);
  if (!fitted || !solidScriptFaceUvsFitClose(fitted, samples))
    throw new Error('those UVs do not lie on a plane, so they cannot be stored on a brush face');
  return solidScriptFaceUvRecord(face, fitted);
}

/**
 * Tells whether a fitted matrix reproduces every sample.
 *
 * @param fitted Matrix.
 * @param samples Corner samples.
 * @returns True when every sample is close enough.
 */
function solidScriptFaceUvsFitClose(
  fitted: SurfaceUvMatrix,
  samples: readonly { world: THREE.Vector3; u: number; v: number }[],
): boolean {
  return samples.every((sample) => {
    const got = fitted.project(sample.world);
    return Math.hypot(got.u - sample.u, got.v - sample.v) <= SOLID_SCRIPT_FACE_UV_FIT;
  });
}
