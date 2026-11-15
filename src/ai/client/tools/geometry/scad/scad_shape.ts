import type * as THREE from 'three';

/** Boolean operation of a shape group. */
export type ScadBooleanOperation = 'union' | 'difference' | 'intersection';

/** Convex 3D solid given by points in OpenSCAD world space (Z up). */
export interface ScadShapeSolid {
  kind: 'solid';
  points: THREE.Vector3[];
  label: string;
}

/** Simple 2D polygon in the local plane of a linear_extrude. */
export interface ScadShapePolygon {
  kind: 'polygon';
  points: [number, number][];
  label: string;
}

/** Boolean combination of child shapes; the first child of a difference is kept. */
export interface ScadShapeBoolean {
  kind: 'boolean';
  operation: ScadBooleanOperation;
  children: ScadShape[];
  label: string;
}

/** Node of an evaluated OpenSCAD shape tree. */
export type ScadShape = ScadShapeSolid | ScadShapePolygon | ScadShapeBoolean;

/**
 * Wraps shapes into one shape: the single shape itself, or a union.
 *
 * @param shapes Shapes.
 * @param label Label for a created union.
 * @returns Shape, or null when there are none.
 */
export function scadShapeJoin(shapes: ScadShape[], label: string): ScadShape | null {
  if (shapes.length === 0) return null;
  if (shapes.length === 1) return shapes[0] ?? null;
  return { kind: 'boolean', operation: 'union', children: shapes, label };
}

/**
 * Maps every leaf of a shape tree, keeping the boolean structure.
 *
 * @param shape Shape tree.
 * @param map Leaf mapper.
 * @returns Mapped tree.
 */
export function scadShapeMapLeaves(
  shape: ScadShape,
  map: (leaf: ScadShapeSolid | ScadShapePolygon) => ScadShape,
): ScadShape {
  if (shape.kind !== 'boolean') return map(shape);
  return { ...shape, children: shape.children.map((child) => scadShapeMapLeaves(child, map)) };
}

/**
 * Lists the leaves that add material, skipping cut-away children of
 * differences.
 *
 * @param shape Shape tree.
 * @returns Leaves.
 */
export function scadShapeLeavesPositive(shape: ScadShape): (ScadShapeSolid | ScadShapePolygon)[] {
  if (shape.kind !== 'boolean') return [shape];
  const children = shape.operation === 'difference' ? shape.children.slice(0, 1) : shape.children;
  return children.flatMap(scadShapeLeavesPositive);
}

/**
 * Counts the leaves of a shape tree.
 *
 * @param shape Shape tree.
 * @returns Leaf count.
 */
export function scadShapeLeafCount(shape: ScadShape): number {
  return shape.kind === 'boolean' ? shape.children.reduce((sum, child) => sum + scadShapeLeafCount(child), 0) : 1;
}
