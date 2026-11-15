import * as THREE from 'three';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidScriptShape, SolidScriptShapeBoolean } from './solid_script_shape.js';

/** How evaluated script shapes are placed into a solid model. */
export interface SolidScriptSolidTreeOptions {
  /**
   * 'z' converts the script's Z-up to the editor's Y-up; 'y' keeps axes as
   * written.
   */
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
const SOLID_SCRIPT_SOLID_TREE_PRECISION = 1e6;

/**
 * Maps evaluated script shapes onto ordered CSG brushes and groups: difference
 * becomes a group of one additive part followed by subtractive parts,
 * intersection a group of intersecting parts, and union flattens.
 *
 * @param shapes Top-level shapes.
 * @param options Placement options.
 * @returns Solid subtree nodes in evaluation order.
 */
export function solidScriptSolidTreeBuild(
  shapes: readonly SolidScriptShape[],
  options: SolidScriptSolidTreeOptions,
): SolidTreeNode[] {
  return shapes.flatMap((shape) => solidScriptSolidTreeNodes(shape, options.operation, options));
}

/**
 * Maps one shape in a given role.
 *
 * @param shape Shape.
 * @param role Operation the shape has inside its parent.
 * @param options Placement options.
 * @returns Nodes.
 */
function solidScriptSolidTreeNodes(
  shape: SolidScriptShape,
  role: SolidOperation,
  options: SolidScriptSolidTreeOptions,
): SolidTreeNode[] {
  if (shape.kind === 'polygon') throw new Error('2D shapes must be inside linear_extrude()');
  if (shape.kind === 'solid') return [solidScriptSolidTreeBrush(shape.points, shape.label, role, options)];
  if (shape.kind === 'mesh') return [];
  if (shape.operation === 'union' && role !== SolidOperation.Intersecting)
    return shape.children.flatMap((child) => solidScriptSolidTreeNodes(child, role, options));
  return [
    {
      kind: 'group',
      name: solidScriptSolidTreeName(shape.label, options),
      operation: role,
      children: solidScriptSolidTreeMembers(shape, options),
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
function solidScriptSolidTreeMembers(
  shape: SolidScriptShapeBoolean,
  options: SolidScriptSolidTreeOptions,
): SolidTreeNode[] {
  if (shape.operation === 'union')
    return shape.children.flatMap((child) => solidScriptSolidTreeNodes(child, SolidOperation.Additive, options));
  const [first, ...rest] = shape.children;
  if (!first) return [];
  const rule = shape.operation === 'difference' ? SolidOperation.Subtractive : SolidOperation.Intersecting;
  const head =
    first.kind === 'boolean' && first.operation === shape.operation
      ? solidScriptSolidTreeMembers(first, options)
      : solidScriptSolidTreeNodes(first, SolidOperation.Additive, options);
  return [...head, ...rest.flatMap((child) => solidScriptSolidTreeNodes(child, rule, options))];
}

/**
 * Builds one convex brush from script points.
 *
 * @param source Points in script space.
 * @param label Shape label.
 * @param operation Brush operation.
 * @param options Placement options.
 * @returns Brush node.
 */
function solidScriptSolidTreeBrush(
  source: readonly THREE.Vector3[],
  label: string,
  operation: SolidOperation,
  options: SolidScriptSolidTreeOptions,
): SolidTreeBrush {
  const points = source.map((point) => solidScriptSolidTreePoint(point, options));
  const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  center.set(
    ...(center
      .toArray()
      .map((value) => Math.round(value * SOLID_SCRIPT_SOLID_TREE_PRECISION) / SOLID_SCRIPT_SOLID_TREE_PRECISION) as [
      number,
      number,
      number,
    ]),
  );
  const brush = solidHullBrushFromPoints(points.map((point) => point.sub(center)));
  if (!brush) throw new Error(`${label} is flat or degenerate; give every solid a non-zero size on all three axes`);
  return { kind: 'brush', name: solidScriptSolidTreeName(label, options), operation, brush, center };
}

/**
 * Converts an script point to parent-local editor space.
 *
 * @param point Script point.
 * @param options Placement options.
 * @returns Converted point.
 */
function solidScriptSolidTreePoint(point: THREE.Vector3, options: SolidScriptSolidTreeOptions): THREE.Vector3 {
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
function solidScriptSolidTreeName(label: string, options: SolidScriptSolidTreeOptions): string {
  return options.namePrefix ? `${options.namePrefix} ${label}` : label;
}
