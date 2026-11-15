import * as THREE from 'three';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { ScadShape, ScadShapeBoolean } from './scad_shape.js';

/** How evaluated OpenSCAD shapes are placed into a solid model. */
export interface ScadSolidTreeOptions {
  /** 'z' converts OpenSCAD Z-up to the editor's Y-up; 'y' keeps axes as written. */
  upAxis: 'z' | 'y';
  /** Editor world offset added to every point. */
  offset: THREE.Vector3;
  /** World to parent-local transform of the insertion parent. */
  worldToParent: THREE.Matrix4;
  /** Operation of every top-level result. */
  operation: SolidOperation;
  /** Optional prefix for every created name. */
  namePrefix: string;
}

/** Decimal places kept in brush positions, hiding floating point noise. */
const SCAD_SOLID_TREE_PRECISION = 1e6;

/**
 * Maps evaluated OpenSCAD shapes onto ordered CSG brushes and groups:
 * difference becomes a group of one additive part followed by subtractive
 * parts, intersection a group of intersecting parts, and union flattens.
 *
 * @param shapes Top-level shapes.
 * @param options Placement options.
 * @returns Solid subtree nodes in evaluation order.
 */
export function scadSolidTreeBuild(shapes: readonly ScadShape[], options: ScadSolidTreeOptions): SolidTreeNode[] {
  return shapes.flatMap((shape) => scadSolidTreeNodes(shape, options.operation, options));
}

/**
 * Maps one shape in a given role.
 *
 * @param shape Shape.
 * @param role Operation the shape has inside its parent.
 * @param options Placement options.
 * @returns Nodes.
 */
function scadSolidTreeNodes(shape: ScadShape, role: SolidOperation, options: ScadSolidTreeOptions): SolidTreeNode[] {
  if (shape.kind === 'polygon') throw new Error('2D shapes must be inside linear_extrude()');
  if (shape.kind === 'solid') return [scadSolidTreeBrush(shape.points, shape.label, role, options)];
  if (shape.operation === 'union' && role !== SolidOperation.Intersecting)
    return shape.children.flatMap((child) => scadSolidTreeNodes(child, role, options));
  return [
    {
      kind: 'group',
      name: scadSolidTreeName(shape.label, options),
      operation: role,
      children: scadSolidTreeMembers(shape, options),
    },
  ];
}

/**
 * Lists the ordered members of a boolean group.
 *
 * @param shape Boolean shape.
 * @param options Placement options.
 * @returns Member nodes.
 */
function scadSolidTreeMembers(shape: ScadShapeBoolean, options: ScadSolidTreeOptions): SolidTreeNode[] {
  if (shape.operation === 'union')
    return shape.children.flatMap((child) => scadSolidTreeNodes(child, SolidOperation.Additive, options));
  const [first, ...rest] = shape.children;
  if (!first) return [];
  const rule = shape.operation === 'difference' ? SolidOperation.Subtractive : SolidOperation.Intersecting;
  const head =
    first.kind === 'boolean' && first.operation === shape.operation
      ? scadSolidTreeMembers(first, options)
      : scadSolidTreeNodes(first, SolidOperation.Additive, options);
  return [...head, ...rest.flatMap((child) => scadSolidTreeNodes(child, rule, options))];
}

/**
 * Builds one convex brush from OpenSCAD points.
 *
 * @param source Points in OpenSCAD space.
 * @param label Shape label.
 * @param operation Brush operation.
 * @param options Placement options.
 * @returns Brush node.
 */
function scadSolidTreeBrush(
  source: readonly THREE.Vector3[],
  label: string,
  operation: SolidOperation,
  options: ScadSolidTreeOptions,
): SolidTreeBrush {
  const points = source.map((point) => scadSolidTreePoint(point, options));
  const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  center.set(
    ...(center.toArray().map((value) => Math.round(value * SCAD_SOLID_TREE_PRECISION) / SCAD_SOLID_TREE_PRECISION) as [
      number,
      number,
      number,
    ]),
  );
  const brush = solidHullBrushFromPoints(points.map((point) => point.sub(center)));
  if (!brush) throw new Error(`${label} is flat or degenerate; give every solid a non-zero size on all three axes`);
  return { kind: 'brush', name: scadSolidTreeName(label, options), operation, brush, center };
}

/**
 * Converts an OpenSCAD point to parent-local editor space.
 *
 * @param point OpenSCAD point.
 * @param options Placement options.
 * @returns Converted point.
 */
function scadSolidTreePoint(point: THREE.Vector3, options: ScadSolidTreeOptions): THREE.Vector3 {
  const editor = options.upAxis === 'z' ? new THREE.Vector3(point.x, point.z, -point.y) : point.clone();
  return editor.add(options.offset).applyMatrix4(options.worldToParent);
}

/**
 * Builds a display name.
 *
 * @param label Shape label.
 * @param options Placement options.
 * @returns Name.
 */
function scadSolidTreeName(label: string, options: ScadSolidTreeOptions): string {
  return options.namePrefix ? `${options.namePrefix} ${label}` : label;
}
