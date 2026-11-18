import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Axis indices of an Overhead view: U along X, V along Z. */
export const TEXTURE_UV_PROJECT_OVERHEAD = [0, 2] as const;

/** Axis indices of a Front view: U along X, V along Y. */
export const TEXTURE_UV_PROJECT_FRONT = [0, 1] as const;

/** Axis indices of a Side view: U along Z, V along Y. */
export const TEXTURE_UV_PROJECT_SIDE = [2, 1] as const;

/** U and V world-axis indices of a view projection. */
export type TextureUvProjectViewAxes = readonly [number, number];

/**
 * Builds a planar UV matrix from two world axes, in metres, matching Bevel's
 * Overhead, Front and Side layouts at Size 1.
 *
 * @param axes U and V axis indices: 0 is X, 1 is Y, 2 is Z.
 * @param size Metres covered by one texture repeat.
 * @param origin Point that maps to UV (0, 0); the world origin when omitted.
 * @returns UV matrix in the same space as the point and origin.
 */
export function textureUvProjectView(
  axes: TextureUvProjectViewAxes,
  size: number,
  origin = new THREE.Vector3(),
): SurfaceUvMatrix {
  return new SurfaceUvMatrix(
    textureUvProjectAxisRow(axes[0], size, origin),
    textureUvProjectAxisRow(axes[1], size, origin),
  );
}

/**
 * Builds one UV row along a world axis.
 *
 * @param axis Axis index: 0 is X, 1 is Y, 2 is Z.
 * @param size Metres covered by one texture repeat.
 * @param origin Point that maps to 0 on this row.
 * @returns UV row.
 */
function textureUvProjectAxisRow(axis: number, size: number, origin: THREE.Vector3): THREE.Vector4 {
  const scale = 1 / size;
  const direction = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
  return new THREE.Vector4(
    direction.x * scale,
    direction.y * scale,
    direction.z * scale,
    -direction.dot(origin) * scale,
  );
}

/**
 * Picks Overhead, Front or Side from a face normal, the same way Bevel Axis
 * does: the view whose plane is closest to the face.
 *
 * @param normal Unit face normal in the same space as the projection.
 * @param size Metres covered by one texture repeat.
 * @param origin Point that maps to UV (0, 0); the world origin when omitted.
 * @returns UV matrix for that view.
 */
export function textureUvProjectAxis(
  normal: THREE.Vector3,
  size: number,
  origin = new THREE.Vector3(),
): SurfaceUvMatrix {
  return textureUvProjectView(textureUvProjectAxisView(normal), size, origin);
}

/**
 * Returns the Overhead, Front or Side axes Bevel Axis would use for a normal.
 *
 * @param normal Face normal.
 * @returns View axes.
 */
export function textureUvProjectAxisView(normal: THREE.Vector3): TextureUvProjectViewAxes {
  const x = Math.abs(normal.x);
  const y = Math.abs(normal.y);
  const z = Math.abs(normal.z);
  if (y >= x && y >= z) return TEXTURE_UV_PROJECT_OVERHEAD;
  if (z >= x) return TEXTURE_UV_PROJECT_FRONT;
  return TEXTURE_UV_PROJECT_SIDE;
}

/**
 * Reads U and V of a point from a matrix.
 *
 * @param matrix UV matrix.
 * @param point Position in the matrix's space.
 * @returns U and V.
 */
export function textureUvProjectPoint(matrix: SurfaceUvMatrix, point: THREE.Vector3): [number, number] {
  const uv = matrix.project(point);
  return [uv.u, uv.v];
}

/**
 * Builds an Overhead, Front or Side matrix in brush-local coordinates from the
 * brush's local-to-world frame, matching Bevel's Local and World view layouts
 * at Size 1.
 *
 * @param frame Local-to-world matrix of the brush.
 * @param axes U and V axis indices.
 * @param local True when the brush frame is used; false uses world axes.
 * @param size Metres covered by one texture repeat.
 * @returns UV matrix in brush-local coordinates.
 */
export function textureUvProjectViewFromFrame(
  frame: THREE.Matrix4,
  axes: TextureUvProjectViewAxes,
  local: boolean,
  size = 1,
): SurfaceUvMatrix {
  if (local) {
    return new SurfaceUvMatrix(
      textureUvProjectLocalAxisRow(frame, axes[0], size),
      textureUvProjectLocalAxisRow(frame, axes[1], size),
    );
  }
  return textureUvProjectView(axes, size).multiplyMatrix4(frame);
}

/**
 * Builds a UV row along one brush axis, in world metres, expressed in
 * brush-local coordinates.
 *
 * @param frame Local-to-world matrix.
 * @param column Axis index: 0 is X, 1 is Y, 2 is Z.
 * @param size Metres covered by one texture repeat.
 * @returns UV row.
 */
function textureUvProjectLocalAxisRow(frame: THREE.Matrix4, column: number, size: number): THREE.Vector4 {
  const scale = 1 / size;
  const elements = frame.elements;
  const direction = new THREE.Vector3(
    elements[column * 4] ?? 0,
    elements[column * 4 + 1] ?? 0,
    elements[column * 4 + 2] ?? 0,
  );
  if (direction.lengthSq() <= 1e-16) direction.set(column === 0 ? 1 : 0, column === 1 ? 1 : 0, column === 2 ? 1 : 0);
  else direction.normalize();
  return new THREE.Vector4(
    textureUvProjectColumnDot(elements, 0, direction) * scale,
    textureUvProjectColumnDot(elements, 1, direction) * scale,
    textureUvProjectColumnDot(elements, 2, direction) * scale,
    0,
  );
}

/**
 * Dots one matrix column with a direction.
 *
 * @param elements Column-major matrix elements.
 * @param column Column index.
 * @param direction Unit direction.
 * @returns Dot product.
 */
function textureUvProjectColumnDot(elements: ArrayLike<number>, column: number, direction: THREE.Vector3): number {
  const offset = column * 4;
  return (
    (elements[offset] ?? 0) * direction.x +
    (elements[offset + 1] ?? 0) * direction.y +
    (elements[offset + 2] ?? 0) * direction.z
  );
}
