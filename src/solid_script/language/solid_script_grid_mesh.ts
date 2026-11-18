import * as THREE from 'three';
import { SOLID_SCRIPT_ANCHOR_SOLID, solidScriptAnchorMin } from '@/solid_script/language/solid_script_anchor.js';
import type { SolidScriptBlockArguments } from '@/solid_script/language/solid_script_block_arguments.js';
import type { SolidScriptShapeMesh, SolidScriptUv } from '@/solid_script/language/solid_script_mesh.js';

/** Fewest faces along one side of a Grid Mesh. */
export const SOLID_SCRIPT_GRID_MESH_COUNT_MIN = 1;

/** Most faces along one side of a Grid Mesh. */
export const SOLID_SCRIPT_GRID_MESH_COUNT_MAX = 256;

/** Axes of a flat Grid Mesh: Columns, Rows and the thin direction. */
type SolidScriptGridMeshPlane = { columns: number; rows: number; thin: number };

/**
 * Builds a Grid Mesh from its fields: a grid of quads in the plane of Size.
 *
 * @param args Block fields.
 * @returns Mesh.
 */
export function solidScriptGridMesh(args: SolidScriptBlockArguments): SolidScriptShapeMesh {
  const size = args.vector('size', [2, 0, 2]);
  const plane = solidScriptGridMeshPlane(size, args);
  const columns = solidScriptGridMeshCount(args.number('columns', 4), 'Columns');
  const rows = solidScriptGridMeshCount(args.number('rows', 4), 'Rows');
  const min = solidScriptAnchorMin(size, args.anchor(SOLID_SCRIPT_ANCHOR_SOLID));
  return solidScriptGridMeshBuild(size, min, plane, columns, rows);
}

/**
 * Reads the plane of a Grid Mesh: one Size axis is 0, the other two are above
 * 0.
 *
 * @param size Width, height and depth.
 * @param args Block fields, for messages.
 * @returns Column, row and thin axes.
 */
function solidScriptGridMeshPlane(size: number[], args: SolidScriptBlockArguments): SolidScriptGridMeshPlane {
  if (size.some((length) => length < 0)) throw args.error('size', 'must be 0 or more on every axis', size);
  const thin = size.findIndex((length) => length === 0);
  if (thin < 0 || size.filter((length) => length === 0).length !== 1)
    throw args.error(
      'size',
      'needs one length at 0 so the grid is flat, such as 2, 0, 2 for a grid on the ground',
      size,
    );
  const columns = size[0] !== 0 ? 0 : 2;
  return { columns, rows: 3 - thin - columns, thin };
}

/**
 * Checks a face count.
 *
 * @param value Requested count.
 * @param label Field caption.
 * @returns Whole count.
 */
function solidScriptGridMeshCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < SOLID_SCRIPT_GRID_MESH_COUNT_MIN || value > SOLID_SCRIPT_GRID_MESH_COUNT_MAX)
    throw new Error(
      `${label} must be a whole number from ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}, not ${value}`,
    );
  return value;
}

/**
 * Builds the points, faces and texture coordinates of a Grid Mesh.
 *
 * @param size Width, height and depth.
 * @param min Lowest corner after Anchor.
 * @param plane Column, row and thin axes.
 * @param columns Faces along the column axis.
 * @param rows Faces along the row axis.
 * @returns Mesh.
 */
function solidScriptGridMeshBuild(
  size: number[],
  min: number[],
  plane: SolidScriptGridMeshPlane,
  columns: number,
  rows: number,
): SolidScriptShapeMesh {
  const points = solidScriptGridMeshPoints(size, min, plane, columns, rows);
  const faces: number[][] = [];
  const uvs: (SolidScriptUv[] | null)[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const face = solidScriptGridMeshFace(points, plane, columns, rows, column, row);
      faces.push(face.corners);
      uvs.push(face.uvs);
    }
  }
  return { kind: 'mesh', label: 'grid_mesh', points, faces, uvs };
}

/**
 * Corner points of a Grid Mesh, left to right along each row.
 *
 * @param size Width, height and depth.
 * @param min Lowest corner after Anchor.
 * @param plane Column, row and thin axes.
 * @param columns Faces along the column axis.
 * @param rows Faces along the row axis.
 * @returns Points.
 */
function solidScriptGridMeshPoints(
  size: number[],
  min: number[],
  plane: SolidScriptGridMeshPlane,
  columns: number,
  rows: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const point = new THREE.Vector3(min[0] ?? 0, min[1] ?? 0, min[2] ?? 0);
      point.setComponent(plane.columns, (min[plane.columns] ?? 0) + ((size[plane.columns] ?? 0) * column) / columns);
      point.setComponent(plane.rows, (min[plane.rows] ?? 0) + ((size[plane.rows] ?? 0) * row) / rows);
      points.push(point);
    }
  }
  return points;
}

/**
 * One quad and its texture coordinates, wound so the face looks along the
 * positive thin axis.
 *
 * @param points All corner points.
 * @param plane Column, row and thin axes.
 * @param columns Faces along the column axis.
 * @param rows Faces along the row axis.
 * @param column Cell column.
 * @param row Cell row.
 * @returns Corner numbers and UVs.
 */
function solidScriptGridMeshFace(
  points: readonly THREE.Vector3[],
  plane: SolidScriptGridMeshPlane,
  columns: number,
  rows: number,
  column: number,
  row: number,
): { corners: number[]; uvs: SolidScriptUv[] } {
  const a = row * (columns + 1) + column;
  const first = points[a];
  const along = points[a + 1];
  const up = points[a + columns + 1];
  const flip = solidScriptGridMeshFlip(first, along, up, plane.thin);
  return {
    corners: flip ? [a, a + columns + 1, a + columns + 2, a + 1] : [a, a + 1, a + columns + 2, a + columns + 1],
    uvs: solidScriptGridMeshUvs(column, row, columns, rows, flip),
  };
}

/**
 * True when a, b, d would face the negative thin axis.
 *
 * @param first Corner a.
 * @param along Corner b, one column on.
 * @param up Corner d, one row on.
 * @param thin Thin axis.
 * @returns Whether to wind the other way.
 */
function solidScriptGridMeshFlip(
  first: THREE.Vector3 | undefined,
  along: THREE.Vector3 | undefined,
  up: THREE.Vector3 | undefined,
  thin: number,
): boolean {
  if (!first || !along || !up) return false;
  return (
    new THREE.Vector3().subVectors(along, first).cross(new THREE.Vector3().subVectors(up, first)).getComponent(thin) < 0
  );
}

/**
 * Texture coordinates of one quad, 0 to 1 across the whole grid.
 *
 * @param column Cell column.
 * @param row Cell row.
 * @param columns Faces along the column axis.
 * @param rows Faces along the row axis.
 * @param flip True when the face winds the other way.
 * @returns Corner UVs in face order.
 */
function solidScriptGridMeshUvs(
  column: number,
  row: number,
  columns: number,
  rows: number,
  flip: boolean,
): SolidScriptUv[] {
  const u0 = column / columns;
  const u1 = (column + 1) / columns;
  const v0 = row / rows;
  const v1 = (row + 1) / rows;
  const first: SolidScriptUv = [u0, v0];
  const along: SolidScriptUv = [u1, v0];
  const far: SolidScriptUv = [u1, v1];
  const up: SolidScriptUv = [u0, v1];
  return flip ? [first, up, far, along] : [first, along, far, up];
}
