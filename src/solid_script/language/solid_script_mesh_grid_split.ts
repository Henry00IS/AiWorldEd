import * as THREE from 'three';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SEAM_CORNER_ON_EDGE_DISTANCE } from '@/solid/mesh/seam/seam_constants.js';
import { seamTurnsAt } from '@/solid/mesh/seam/seam_polygon_triangulator.js';
import { solidScriptMeshLoopNormal } from './solid_script_mesh.js';

/** The four real corners of a polygon and where its grid lines run. */
interface SolidScriptGridOutline {
  /** Real corners in winding order. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Every vertex of the polygon, for snapping grid points onto them. */
  vertices: readonly THREE.Vector3[];
  /** Positions along the first and third side, 0 to 1 from the fourth side. */
  across: number[];
  /** Positions along the second and fourth side, 0 to 1 from the first side. */
  along: number[];
}

/**
 * Splits a four-cornered polygon whose sides carry extra vertices into a grid
 * of four-sided cells, with a grid line through every extra vertex, so no cell
 * has a vertex in the middle of a side.
 *
 * @param polygon Compiled polygon, convex.
 * @returns Cells, or null when the polygon has no extra vertices or is not
 *   four-cornered.
 */
export function solidScriptMeshGridSplit(polygon: SolidCompiledPolygon): SolidCompiledPolygon[] | null {
  const outline = solidScriptGridOutline(polygon.vertices);
  if (!outline) return null;
  const cells: SolidCompiledPolygon[] = [];
  for (let u = 0; u + 1 < outline.across.length; u++)
    for (let v = 0; v + 1 < outline.along.length; v++)
      cells.push(solidScriptGridCellPolygon(polygon, solidScriptGridCell(outline, u, v)));
  return cells;
}

/**
 * Reads the real corners and the grid positions of a polygon.
 *
 * @param vertices Polygon vertices.
 * @returns Outline, or null when there are not exactly four real corners or no
 *   extras.
 */
function solidScriptGridOutline(vertices: readonly THREE.Vector3[]): SolidScriptGridOutline | null {
  const real = solidScriptGridRealCorners(vertices);
  if (real.length !== 4 || vertices.length === 4) return null;
  const sides = real.map((start, index) => solidScriptGridSide(vertices, start, real[(index + 1) % 4]!));
  const corners = real.map((index) => vertices[index]!) as SolidScriptGridOutline['corners'];
  const [first, second, third, fourth] = sides as [THREE.Vector3[], THREE.Vector3[], THREE.Vector3[], THREE.Vector3[]];
  return {
    corners,
    vertices,
    across: solidScriptGridStops(first, third.slice().reverse()),
    along: solidScriptGridStops(fourth.slice().reverse(), second),
  };
}

/**
 * Indices of the vertices where the outline really turns.
 *
 * @param vertices Polygon vertices.
 * @returns Real corner indices in winding order.
 */
function solidScriptGridRealCorners(vertices: readonly THREE.Vector3[]): number[] {
  const count = vertices.length;
  const normal = solidScriptMeshLoopNormal(
    vertices,
    vertices.map((_, index) => index),
  );
  const turns = (index: number): boolean =>
    seamTurnsAt(vertices[(index + count - 1) % count]!, vertices[index]!, vertices[(index + 1) % count]!, normal);
  return vertices.map((_, index) => index).filter(turns);
}

/**
 * Vertices of one side, from one real corner to the next, both included.
 *
 * @param vertices Polygon vertices.
 * @param start Index of the side's first corner.
 * @param end Index of the side's last corner.
 * @returns Side vertices in winding order.
 */
function solidScriptGridSide(vertices: readonly THREE.Vector3[], start: number, end: number): THREE.Vector3[] {
  const side: THREE.Vector3[] = [];
  for (let index = start; index !== end; index = (index + 1) % vertices.length) side.push(vertices[index]!);
  side.push(vertices[end]!);
  return side;
}

/**
 * Grid positions for two opposite sides running the same way: 0, every extra
 * vertex of either side as a share of its side's length, and 1. Positions that
 * land on the same spot are kept once.
 *
 * @param near Side running from the first corner.
 * @param far Opposite side, running the same way.
 * @returns Sorted positions from 0 to 1.
 */
function solidScriptGridStops(near: readonly THREE.Vector3[], far: readonly THREE.Vector3[]): number[] {
  const length = Math.max(near[0]!.distanceTo(near[near.length - 1]!), far[0]!.distanceTo(far[far.length - 1]!));
  const gap = SEAM_CORNER_ON_EDGE_DISTANCE / Math.max(length, SEAM_CORNER_ON_EDGE_DISTANCE);
  const stops = [...solidScriptGridSideShares(near), ...solidScriptGridSideShares(far)].sort((a, b) => a - b);
  const kept = [0];
  for (const stop of stops) if (stop - kept[kept.length - 1]! > gap && 1 - stop > gap) kept.push(stop);
  kept.push(1);
  return kept;
}

/**
 * Where the extra vertices of a side lie, as shares of the side's length.
 *
 * @param side Side vertices, corners included.
 * @returns Shares between 0 and 1 of the inner vertices.
 */
function solidScriptGridSideShares(side: readonly THREE.Vector3[]): number[] {
  const start = side[0]!;
  const length = start.distanceTo(side[side.length - 1]!);
  return side.slice(1, -1).map((vertex) => vertex.distanceTo(start) / length);
}

/**
 * Corners of one grid cell, in the polygon's winding.
 *
 * @param outline Polygon outline.
 * @param u Cell column.
 * @param v Cell row.
 * @returns Four cell corners.
 */
function solidScriptGridCell(outline: SolidScriptGridOutline, u: number, v: number): THREE.Vector3[] {
  return [
    solidScriptGridPoint(outline, u, v),
    solidScriptGridPoint(outline, u + 1, v),
    solidScriptGridPoint(outline, u + 1, v + 1),
    solidScriptGridPoint(outline, u, v + 1),
  ];
}

/**
 * One grid point, placed on the polygon by its two grid positions; points on
 * the outline take the polygon's own vertex there, so neighbours share it.
 *
 * @param outline Polygon outline.
 * @param column Index into the across positions.
 * @param row Index into the along positions.
 * @returns Grid point.
 */
function solidScriptGridPoint(outline: SolidScriptGridOutline, column: number, row: number): THREE.Vector3 {
  const [first, second, third, fourth] = outline.corners;
  const u = outline.across[column]!;
  const point = first.clone().lerp(second, u).lerp(fourth.clone().lerp(third, u), outline.along[row]!);
  const lastColumn = outline.across.length - 1;
  const lastRow = outline.along.length - 1;
  if (column !== 0 && row !== 0 && column !== lastColumn && row !== lastRow) return point;
  const own = outline.vertices.find((vertex) => vertex.distanceTo(point) <= SEAM_CORNER_ON_EDGE_DISTANCE);
  return own ? own.clone() : point;
}

/**
 * A cell as a compiled polygon of the same brush face.
 *
 * @param polygon Polygon the cell was cut from.
 * @param vertices Cell corners.
 * @returns Cell polygon.
 */
function solidScriptGridCellPolygon(polygon: SolidCompiledPolygon, vertices: THREE.Vector3[]): SolidCompiledPolygon {
  return {
    vertices,
    normal: polygon.normal,
    surfaceIndex: polygon.surfaceIndex,
    brushId: polygon.brushId,
    textureId: polygon.textureId,
    category: polygon.category,
  };
}
