import { Matrix3, Matrix4, Vector3, type Object3D } from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelLayoutFrameFromPoints, type ModifierBevelLayoutFrame } from './modifier_bevel_uv_layout_frame.js';

const scratchNormalMatrix = new Matrix3();
const cachedNormalElements = new Array<number>(16).fill(0);
let cachedNormalSource: Matrix4 | null = null;

interface ModifierBevelFreshMatrix {
  local: number[];
  parent: number[] | null;
}

const freshMatrices = new WeakMap<Object3D, ModifierBevelFreshMatrix>();

/**
 * Returns the brush mesh world matrix, refreshing it when the pose changed.
 *
 * @param source Authored instance.
 * @returns Local-to-world matrix.
 */
export function modifierBevelLocalToWorld(source: SolidBrushInstance): Matrix4 {
  const mesh = source.mesh;
  if (!mesh) return new Matrix4();
  modifierBevelPrepareLocalMatrix(mesh);
  if (modifierBevelWorldMatrixIsFresh(mesh)) {
    mesh.matrixWorldNeedsUpdate = false;
    return mesh.matrixWorld;
  }
  mesh.updateMatrixWorld(true);
  modifierBevelRememberWorldMatrix(mesh);
  return mesh.matrixWorld;
}

/**
 * Returns the normal matrix for a world matrix, reusing it while the elements
 * match.
 *
 * @param matrix Brush local-to-world matrix.
 * @returns Normal matrix. Callers must not write into it.
 */
export function modifierBevelNormalMatrix(matrix: Matrix4): Matrix3 {
  if (cachedNormalSource === matrix && modifierBevelMatrixElementsMatch(matrix.elements, cachedNormalElements)) {
    return scratchNormalMatrix;
  }
  scratchNormalMatrix.getNormalMatrix(matrix);
  cachedNormalSource = matrix;
  modifierBevelCopyMatrixElements(cachedNormalElements, matrix.elements);
  return scratchNormalMatrix;
}

/**
 * Composes the local matrix when the object updates it from position and
 * rotation.
 *
 * @param mesh Brush mesh.
 */
function modifierBevelPrepareLocalMatrix(mesh: Object3D): void {
  if (mesh.matrixAutoUpdate) mesh.updateMatrix();
}

/**
 * Returns whether the saved world matrix still matches the mesh and its parent.
 *
 * @param mesh Brush mesh.
 * @returns True when another world update would write the same matrix.
 */
function modifierBevelWorldMatrixIsFresh(mesh: Object3D): boolean {
  const saved = freshMatrices.get(mesh);
  if (!saved) return false;
  if (!modifierBevelMatrixElementsMatch(mesh.matrix.elements, saved.local)) return false;
  return modifierBevelParentMatrixIsFresh(mesh, saved.parent);
}

/**
 * Returns whether the parent world matrix matches the saved copy.
 *
 * @param mesh Brush mesh.
 * @param saved Parent elements saved with the last update, or null when there
 *   was no parent.
 * @returns True when the parent contribution is unchanged.
 */
function modifierBevelParentMatrixIsFresh(mesh: Object3D, saved: number[] | null): boolean {
  const parent = mesh.parent?.matrixWorld.elements;
  if (!parent) return saved === null;
  if (!saved) return false;
  return modifierBevelMatrixElementsMatch(parent, saved);
}

/**
 * Stores the local and parent matrices used for the latest world update.
 *
 * @param mesh Brush mesh.
 */
function modifierBevelRememberWorldMatrix(mesh: Object3D): void {
  const saved = freshMatrices.get(mesh) ?? { local: new Array<number>(16).fill(0), parent: null };
  modifierBevelCopyMatrixElements(saved.local, mesh.matrix.elements);
  saved.parent = modifierBevelRememberParent(mesh, saved.parent);
  freshMatrices.set(mesh, saved);
}

/**
 * Copies the parent world matrix into the saved slot.
 *
 * @param mesh Brush mesh.
 * @param saved Previous parent elements.
 * @returns Parent elements, or null when the mesh has no parent.
 */
function modifierBevelRememberParent(mesh: Object3D, saved: number[] | null): number[] | null {
  const parent = mesh.parent?.matrixWorld.elements;
  if (!parent) return null;
  const next = saved ?? new Array<number>(16).fill(0);
  modifierBevelCopyMatrixElements(next, parent);
  return next;
}

/**
 * Returns whether two matrix element lists match.
 *
 * @param elements Live elements.
 * @param saved Saved elements.
 * @returns True when all sixteen values match.
 */
function modifierBevelMatrixElementsMatch(elements: ArrayLike<number>, saved: readonly number[]): boolean {
  for (let index = 0; index < 16; index += 1) {
    if (elements[index] !== saved[index]) return false;
  }
  return true;
}

/**
 * Copies sixteen matrix elements.
 *
 * @param target Destination.
 * @param elements Source elements.
 */
function modifierBevelCopyMatrixElements(target: number[], elements: ArrayLike<number>): void {
  for (let index = 0; index < 16; index += 1) target[index] = elements[index] ?? 0;
}

/**
 * Rewrites an edge frame into world units on the transformed face.
 *
 * @param matrix Brush local-to-world matrix.
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param frame Local edge frame.
 * @returns World frame, or null when the face collapses.
 */
export function modifierBevelWorldLayoutFrame(
  matrix: Matrix4,
  brush: SolidBrush,
  faceIndex: number,
  frame: ModifierBevelLayoutFrame,
): ModifierBevelLayoutFrame | null {
  const along = frame.along.clone().transformDirection(matrix);
  const normal = brush.planes[faceIndex]?.normal;
  if (!normal) return null;
  const across = modifierBevelWorldAcross(matrix, normal, along, frame.across);
  if (!across) return null;
  const origin = frame.origin.clone().applyMatrix4(matrix);
  const points = modifierBevelWorldFacePoints(brush, faceIndex, matrix);
  return modifierBevelLayoutFrameFromPoints(points, origin, along, across);
}

/**
 * Returns a unit step across the transformed edge and into the face.
 *
 * @param matrix Brush local-to-world matrix.
 * @param normal Local face normal.
 * @param along Unit world edge direction.
 * @param acrossLocal Unit local across direction.
 * @returns Unit world direction, or null when the edge is parallel to the
 *   normal.
 */
function modifierBevelWorldAcross(
  matrix: Matrix4,
  normal: Vector3,
  along: Vector3,
  acrossLocal: Vector3,
): Vector3 | null {
  const across = new Vector3().crossVectors(modifierBevelWorldNormal(matrix, normal), along);
  if (across.lengthSq() <= 1e-16) return null;
  across.normalize();
  const hint = acrossLocal.clone().transformDirection(matrix);
  if (across.dot(hint) < 0) across.negate();
  return across;
}

/**
 * Transforms a normal into world space.
 *
 * @param matrix Brush local-to-world matrix.
 * @param normal Local unit normal.
 * @returns Unit world normal.
 */
function modifierBevelWorldNormal(matrix: Matrix4, normal: Vector3): Vector3 {
  const transformed = normal.clone().applyMatrix3(modifierBevelNormalMatrix(matrix));
  if (transformed.lengthSq() <= 1e-16) return normal.clone();
  return transformed.normalize();
}

/**
 * Transforms one face into world space.
 *
 * @param brush Derived brush.
 * @param faceIndex Face index.
 * @param matrix Brush local-to-world matrix.
 * @returns World vertices.
 */
function modifierBevelWorldFacePoints(brush: SolidBrush, faceIndex: number, matrix: Matrix4): Vector3[] {
  const face = brush.faces[faceIndex];
  const points = face ? brush.getFaceVertices(face) : [];
  return points.map((point) => point.clone().applyMatrix4(matrix));
}
