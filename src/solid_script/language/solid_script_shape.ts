import type * as THREE from 'three';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';

/** Boolean operation of a shape group. */
export type SolidScriptBooleanOperation = 'union' | 'difference' | 'intersection';

/** Convex 3D solid given by points in script space (the editor's axes, Y up). */
export interface SolidScriptShapeSolid {
  kind: 'solid';
  points: THREE.Vector3[];
  label: string;
  /**
   * What built it, for the names its faces get, such as "stairs +x" for a step
   * of a Stairs block; none for plain shapes.
   */
  role?: string;
  /** Texture of every face, from a Texture block; none keeps the default. */
  texture?: string;
  /** Textures of single faces, from Texture Faces; they win over texture. */
  faceTextures?: SolidScriptFaceTexture[];
  /** Tags the operations that built faces gave them, such as Bevel. */
  faceTags?: SolidScriptFaceTag[];
  /**
   * The received brush this solid passes on, from Input Brushes; none for built
   * shapes.
   */
  received?: SolidScriptReceived;
}

/**
 * A brush a modifier received, passed on by Input Brushes and moved by the
 * blocks around it.
 */
export interface SolidScriptReceived {
  /** Index of the brush among those received. */
  index: number;
  /** Script-space move applied to it. */
  matrix: THREE.Matrix4;
  /** 'copied' moves its textures with it; 'world' keeps them where they are. */
  textures: 'copied' | 'world';
}

/** A texture given to one face of a solid, found again by its plane. */
export interface SolidScriptFaceTexture {
  /** A point on the face, in script space. */
  point: THREE.Vector3;
  /** Unit direction the face looks, in script space. */
  normal: THREE.Vector3;
  /** Library texture name. */
  texture: string;
}

/**
 * A tag an operation gave the face it built, found again as the face on its
 * plane that holds the point.
 */
export interface SolidScriptFaceTag {
  /** A point inside the face, in script space. */
  point: THREE.Vector3;
  /** Unit direction the face looks, in script space. */
  normal: THREE.Vector3;
  /** Tag, such as Bevel. */
  tag: string;
}

/** Simple 2D polygon in the local plane of a linear_extrude. */
export interface SolidScriptShapePolygon {
  kind: 'polygon';
  points: [number, number][];
  label: string;
}

/** Boolean combination of child shapes; the first child of a difference is kept. */
export interface SolidScriptShapeBoolean {
  kind: 'boolean';
  operation: SolidScriptBooleanOperation;
  children: SolidScriptShape[];
  label: string;
}

/** Node of an evaluated shape tree. */
export type SolidScriptShape =
  SolidScriptShapeSolid | SolidScriptShapePolygon | SolidScriptShapeMesh | SolidScriptShapeBoolean;

/** A shape that is not a boolean group. */
export type SolidScriptShapeLeaf = SolidScriptShapeSolid | SolidScriptShapePolygon | SolidScriptShapeMesh;

/**
 * Wraps shapes into one shape: the single shape itself, or a union.
 *
 * @param shapes Shapes.
 * @param label Label for a created union.
 * @returns Shape, or null when there are none.
 */
export function solidScriptShapeJoin(shapes: SolidScriptShape[], label: string): SolidScriptShape | null {
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
export function solidScriptShapeMapLeaves(
  shape: SolidScriptShape,
  map: (leaf: SolidScriptShapeLeaf) => SolidScriptShape,
): SolidScriptShape {
  if (shape.kind !== 'boolean') return map(shape);
  return { ...shape, children: shape.children.map((child) => solidScriptShapeMapLeaves(child, map)) };
}

/**
 * Lists the leaves that add material, skipping cut-away children of
 * differences.
 *
 * @param shape Shape tree.
 * @returns Leaves.
 */
export function solidScriptShapeLeavesPositive(shape: SolidScriptShape): SolidScriptShapeLeaf[] {
  if (shape.kind !== 'boolean') return [shape];
  const children = shape.operation === 'difference' ? shape.children.slice(0, 1) : shape.children;
  return children.flatMap(solidScriptShapeLeavesPositive);
}

/**
 * Counts the leaves of a shape tree.
 *
 * @param shape Shape tree.
 * @returns Leaf count.
 */
export function solidScriptShapeLeafCount(shape: SolidScriptShape): number {
  return shape.kind === 'boolean'
    ? shape.children.reduce((sum, child) => sum + solidScriptShapeLeafCount(child), 0)
    : 1;
}

/** Key of the optional Name of a shape line, which the Of fields find it by. */
export const SOLID_SCRIPT_SHAPE_NAME_KEY = 'label';

/**
 * Finds the shapes with a Name, in any case: a named group counts whole,
 * otherwise its children are searched.
 *
 * @param shapes Shapes.
 * @param name Name to find.
 * @returns Shapes with that name, in order.
 */
export function solidScriptShapesNamed(shapes: readonly SolidScriptShape[], name: string): SolidScriptShape[] {
  const wanted = name.trim().toLowerCase();
  return shapes.flatMap((shape): SolidScriptShape[] => {
    if (shape.label.toLowerCase() === wanted) return [shape];
    return shape.kind === 'boolean' ? solidScriptShapesNamed(shape.children, name) : [];
  });
}
