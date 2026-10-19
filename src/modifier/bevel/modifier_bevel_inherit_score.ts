import { Matrix3, Matrix4, Vector3 } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvFlow,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** World size and direction of one authored face. */
export interface ModifierBevelParentScore {
  /** Area after the brush world matrix. */
  area: number;
  /** Area in brush space, before mesh scale. */
  localArea: number;
  /** Unit world normal. */
  normal: Vector3;
}

const scratchNormalMatrix = new Matrix3();
const scratchSample = new Vector3();
const scratchAnchor = new Vector3();
const scratchPlaneNormal = new Vector3();
const scratchFaceNormal = new Vector3();

const SCORE_TIE = 1e-8;

/**
 * Measures every authored face in world space.
 *
 * @param source Authored brush.
 * @param worldMatrix Brush mesh world matrix.
 * @returns One score per plane, in face order.
 */
export function modifierBevelParentScores(source: SolidBrush, worldMatrix: Matrix4): ModifierBevelParentScore[] {
  const normalMatrix = new Matrix3().getNormalMatrix(worldMatrix);
  return source.planes.map((plane, index) => modifierBevelScoreFace(source, index, plane, worldMatrix, normalMatrix));
}

/**
 * Returns whether the left parent should be considered before the right one.
 *
 * @param mode UV flow.
 * @param scores Authored face scores.
 * @param leftParent Left authored face.
 * @param rightParent Right authored face.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Negative when left wins, positive when right wins, zero on a tie.
 */
export function modifierBevelRankParents(
  mode: ModifierBevelUvFlow,
  scores: readonly ModifierBevelParentScore[],
  leftParent: number,
  rightParent: number,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): number {
  if (mode === MODIFIER_VOLUME_BEVEL_UV_WINDING) return leftParent - rightParent;
  if (mode === MODIFIER_VOLUME_BEVEL_UV_REVERSE) return rightParent - leftParent;
  const scored = modifierBevelScoreRank(mode, scores, leftParent, rightParent, space, matrix);
  if (scored !== 0) return scored;
  return leftParent - rightParent;
}

/**
 * Returns whether a corner should switch to the next assigned neighbor.
 *
 * @param mode UV flow.
 * @param scores Authored face scores.
 * @param current Neighbor already chosen.
 * @param next Neighbor being considered.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns True when next replaces current.
 */
export function modifierBevelRemainderPrefers(
  mode: ModifierBevelUvFlow,
  scores: readonly ModifierBevelParentScore[],
  current: { parent: number; length: number },
  next: { parent: number; length: number },
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): boolean {
  if (mode === MODIFIER_VOLUME_BEVEL_UV_WINDING) return next.length > current.length;
  if (mode === MODIFIER_VOLUME_BEVEL_UV_REVERSE) return next.length < current.length;
  const scored = modifierBevelScoreRank(mode, scores, next.parent, current.parent, space, matrix);
  if (scored !== 0) return scored < 0;
  return next.length > current.length;
}

/**
 * Builds one authored face score.
 *
 * @param source Authored brush.
 * @param index Face index.
 * @param plane Face plane.
 * @param worldMatrix Brush mesh world matrix.
 * @param normalMatrix Normal matrix of the brush.
 * @returns World area and world normal.
 */
function modifierBevelScoreFace(
  source: SolidBrush,
  index: number,
  plane: SolidPlane | undefined,
  worldMatrix: Matrix4,
  normalMatrix: Matrix3,
): ModifierBevelParentScore {
  return {
    area: modifierBevelWorldFaceArea(source, index, worldMatrix),
    localArea: modifierBevelLocalFaceArea(source, index),
    normal: modifierBevelWorldNormal(plane, normalMatrix),
  };
}

/**
 * Returns the face area in brush space.
 *
 * @param source Authored brush.
 * @param index Face index.
 * @returns Unscaled area.
 */
function modifierBevelLocalFaceArea(source: SolidBrush, index: number): number {
  const face = source.faces[index];
  if (!face) return 0;
  return modifierBevelPolygonArea(source.getFaceVertices(face));
}

/**
 * Compares two parents by area or axis. Zero means the scores tie.
 *
 * @param mode UV flow.
 * @param scores Authored face scores.
 * @param leftParent Left authored face.
 * @param rightParent Right authored face.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Negative when left wins.
 */
function modifierBevelScoreRank(
  mode: ModifierBevelUvFlow,
  scores: readonly ModifierBevelParentScore[],
  leftParent: number,
  rightParent: number,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): number {
  const left = scores[leftParent];
  const right = scores[rightParent];
  if (!left || !right) return 0;
  if (mode === MODIFIER_VOLUME_BEVEL_UV_LARGEST)
    return modifierBevelHigherFirst(modifierBevelScoreArea(right, space), modifierBevelScoreArea(left, space));
  if (mode === MODIFIER_VOLUME_BEVEL_UV_SMALLEST)
    return modifierBevelHigherFirst(modifierBevelScoreArea(left, space), modifierBevelScoreArea(right, space));
  const axis = modifierBevelScoreAxis(mode, space, matrix);
  if (!axis) return 0;
  return modifierBevelHigherFirst(modifierBevelAxisDot(right, axis), modifierBevelAxisDot(left, axis));
}

/**
 * Returns the area used by the active space.
 *
 * @param score Face score.
 * @param space Map axes or brush axes.
 * @returns Area.
 */
function modifierBevelScoreArea(score: ModifierBevelParentScore, space: ModifierBevelUvSpace): number {
  if (space === MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL) return score.localArea;
  return score.area;
}

/**
 * Returns the axis a flow compares, in world space.
 *
 * @param mode UV flow.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Unit axis, or null when the mode is not axial.
 */
function modifierBevelScoreAxis(
  mode: ModifierBevelUvFlow,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): Vector3 | null {
  const local = modifierBevelFlowAxis(mode);
  if (!local || space !== MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL) return local;
  return modifierBevelBrushAxis(matrix, local);
}

/**
 * Turns a unit mesh axis into the brush's scaled direction.
 *
 * @param matrix Brush mesh world matrix.
 * @param local Unit axis in mesh space.
 * @returns Unit world direction.
 */
function modifierBevelBrushAxis(matrix: Matrix4, local: Vector3): Vector3 {
  const column = Math.abs(local.y) > 0.5 ? 1 : 0;
  const index = Math.abs(local.z) > 0.5 ? 2 : column;
  const direction = modifierBevelMatrixColumn(matrix, index);
  if (local.x + local.y + local.z < 0) direction.negate();
  return direction;
}

/**
 * Returns one normalized column of a matrix.
 *
 * @param matrix Brush mesh world matrix.
 * @param column Column index.
 * @returns Unit column, or a mesh axis when the column collapses.
 */
function modifierBevelMatrixColumn(matrix: Matrix4, column: number): Vector3 {
  const offset = column * 4;
  const direction = new Vector3(matrix.elements[offset], matrix.elements[offset + 1], matrix.elements[offset + 2]);
  if (direction.lengthSq() <= 1e-16)
    return new Vector3(column === 0 ? 1 : 0, column === 1 ? 1 : 0, column === 2 ? 1 : 0);
  return direction.normalize();
}

/**
 * Returns a fixed world axis for an axial flow, or null.
 *
 * @param mode UV flow.
 * @returns Unit axis, or null when the mode is not axial.
 */
function modifierBevelFlowAxis(mode: ModifierBevelUvFlow): Vector3 | null {
  if (mode === MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y) return new Vector3(0, 1, 0);
  if (mode === MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y) return new Vector3(0, -1, 0);
  if (mode === MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X) return new Vector3(1, 0, 0);
  if (mode === MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X) return new Vector3(-1, 0, 0);
  if (mode === MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z) return new Vector3(0, 0, 1);
  if (mode === MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z) return new Vector3(0, 0, -1);
  return null;
}

/**
 * Returns the projection of a face normal onto an axis.
 *
 * @param score Face score.
 * @param axis Unit world axis.
 * @returns Dot product.
 */
function modifierBevelAxisDot(score: ModifierBevelParentScore, axis: Vector3): number {
  return score.normal.dot(axis);
}

/**
 * Subtracts two scores, treating a tiny gap as a tie.
 *
 * @param later Score that should win when it is larger.
 * @param earlier Score compared against later.
 * @returns Negative when earlier is larger.
 */
function modifierBevelHigherFirst(later: number, earlier: number): number {
  const delta = later - earlier;
  if (Math.abs(delta) <= SCORE_TIE) return 0;
  return delta;
}

/**
 * Returns the plane distance in the active space.
 *
 * @param plane Authored plane.
 * @param point Sample point in brush space.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Absolute distance.
 */
export function modifierBevelSpacedPlaneDistance(
  plane: SolidPlane | undefined,
  point: Vector3,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): number {
  if (!plane) return Number.POSITIVE_INFINITY;
  if (space === MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL) return Math.abs(plane.signedDistance(point));
  return Math.abs(modifierBevelWorldPlaneDistance(plane, point, matrix));
}

/**
 * Returns the world distance from a brush-space point to a plane.
 *
 * @param plane Authored plane.
 * @param point Sample point in brush space.
 * @param matrix Brush mesh world matrix.
 * @returns Signed world distance.
 */
function modifierBevelWorldPlaneDistance(plane: SolidPlane, point: Vector3, matrix: Matrix4): number {
  const normal = modifierBevelCopyScaledNormal(plane.normal, matrix, scratchPlaneNormal);
  const anchor = scratchAnchor.copy(plane.normal).multiplyScalar(-plane.offset).applyMatrix4(matrix);
  const sample = scratchSample.copy(point).applyMatrix4(matrix);
  return normal.dot(sample) - normal.dot(anchor);
}

/**
 * Returns how aligned two normals are in the active space.
 *
 * @param planeNormal Authored normal.
 * @param faceNormal Generated normal.
 * @param space Map axes or brush axes.
 * @param matrix Brush mesh world matrix.
 * @returns Dot product. Larger means closer.
 */
export function modifierBevelSpacedNormalDot(
  planeNormal: Vector3 | undefined,
  faceNormal: Vector3 | undefined,
  space: ModifierBevelUvSpace,
  matrix: Matrix4,
): number {
  if (!planeNormal || !faceNormal) return -2;
  if (space === MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL) return planeNormal.dot(faceNormal);
  const plane = modifierBevelCopyScaledNormal(planeNormal, matrix, scratchPlaneNormal);
  const face = modifierBevelCopyScaledNormal(faceNormal, matrix, scratchFaceNormal);
  return plane.dot(face);
}

/**
 * Writes a unit normal transformed by the mesh scale.
 *
 * @param normal Brush-space normal.
 * @param matrix Brush mesh world matrix.
 * @param output Destination vector.
 * @returns Unit world normal.
 */
function modifierBevelCopyScaledNormal(normal: Vector3, matrix: Matrix4, output: Vector3): Vector3 {
  output.copy(normal).applyMatrix3(scratchNormalMatrix.getNormalMatrix(matrix));
  if (output.lengthSq() < 1e-12) return output.set(0, 1, 0);
  return output.normalize();
}

/**
 * Returns the world area of one authored face.
 *
 * @param brush Authored brush.
 * @param faceIndex Face index.
 * @param worldMatrix Brush mesh world matrix.
 * @returns Area, or 0 when the face is missing.
 */
function modifierBevelWorldFaceArea(brush: SolidBrush, faceIndex: number, worldMatrix: Matrix4): number {
  const face = brush.faces[faceIndex];
  if (!face) return 0;
  const points = brush.getFaceVertices(face);
  for (const point of points) point.applyMatrix4(worldMatrix);
  return modifierBevelPolygonArea(points);
}

/**
 * Returns the area of a planar polygon.
 *
 * @param points Polygon vertices in order.
 * @returns Area.
 */
function modifierBevelPolygonArea(points: readonly Vector3[]): number {
  const origin = points[0];
  if (!origin || points.length < 3) return 0;
  const sum = new Vector3();
  const cross = new Vector3();
  for (let index = 1; index < points.length - 1; index += 1) {
    modifierBevelAddFan(sum, cross, origin, points[index], points[index + 1]);
  }
  return sum.length() * 0.5;
}

/**
 * Adds one triangle of a polygon fan into an accumulator.
 *
 * @param sum Accumulated cross product.
 * @param cross Scratch cross product.
 * @param origin Fan origin.
 * @param left Middle vertex.
 * @param right Far vertex.
 */
function modifierBevelAddFan(
  sum: Vector3,
  cross: Vector3,
  origin: Vector3,
  left: Vector3 | undefined,
  right: Vector3 | undefined,
): void {
  if (!left || !right) return;
  sum.add(cross.crossVectors(left.clone().sub(origin), right.clone().sub(origin)));
}

/**
 * Returns the unit world normal of a plane.
 *
 * @param plane Face plane.
 * @param normalMatrix Normal matrix of the brush.
 * @returns Unit world normal.
 */
function modifierBevelWorldNormal(plane: SolidPlane | undefined, normalMatrix: Matrix3): Vector3 {
  const normal = plane?.normal.clone() ?? new Vector3(0, 1, 0);
  normal.applyMatrix3(normalMatrix);
  if (normal.lengthSq() < 1e-12) return new Vector3(0, 1, 0);
  return normal.normalize();
}
