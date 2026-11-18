import * as THREE from 'three';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type {
  SolidScriptFaceTexture,
  SolidScriptFaceUv,
  SolidScriptShape,
  SolidScriptShapeBoolean,
} from './solid_script_shape.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** How evaluated script shapes are placed into a solid model. */
export interface SolidScriptSolidTreeOptions {
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
  if (shape.kind === 'solid') {
    const brush = solidScriptSolidTreeBrush(shape.points, shape.label, role, options);
    if (shape.texture) brush.texture = shape.texture;
    if (shape.faceTextures) brush.faceTextures = solidScriptSolidTreeFaceTextures(brush, shape.faceTextures, options);
    if (shape.boxUvSize !== undefined) brush.boxUvSize = shape.boxUvSize;
    if (shape.faceUvs) brush.faceUvs = solidScriptSolidTreeFaceUvs(brush, shape.faceUvs, options);
    return [brush];
  }
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

/** Farthest a textured face's point may be from a brush face, in metres. */
const SOLID_SCRIPT_SOLID_TREE_FACE_GAP = 1e-3;

/** Least alignment of a textured face's direction with a brush face. */
const SOLID_SCRIPT_SOLID_TREE_FACE_ALIGN = 0.99;

/**
 * Finds the brush faces given their own texture: the face whose plane holds the
 * textured face's point and looks the same way.
 *
 * @param brush Brush node, centred on its origin.
 * @param faces Textured faces in script space.
 * @param options Placement options.
 * @returns Texture per brush face, by face index.
 */
function solidScriptSolidTreeFaceTextures(
  brush: SolidTreeBrush,
  faces: readonly SolidScriptFaceTexture[],
  options: SolidScriptSolidTreeOptions,
): (string | undefined)[] {
  const textures: (string | undefined)[] = brush.brush.faces.map(() => undefined);
  for (const face of faces) {
    const point = solidScriptSolidTreePoint(face.point, options).sub(brush.center);
    const tip = solidScriptSolidTreePoint(face.point.clone().add(face.normal), options).sub(brush.center);
    const normal = tip.sub(point).normalize();
    let best = -1;
    let bestAlign = SOLID_SCRIPT_SOLID_TREE_FACE_ALIGN;
    brush.brush.planes.forEach((plane, index) => {
      const align = plane.normal.dot(normal);
      if (align >= bestAlign && Math.abs(plane.signedDistance(point)) <= SOLID_SCRIPT_SOLID_TREE_FACE_GAP) {
        best = index;
        bestAlign = align;
      }
    });
    if (best >= 0) textures[best] = face.texture;
  }
  return textures;
}

/**
 * Finds the brush faces given their own UV mapping, converts each matrix from
 * script space into the centred brush's space, and lists them by face index.
 *
 * @param brush Brush node, centred on its origin.
 * @param faces Mapped faces in script space.
 * @param options Placement options.
 * @returns UV matrix per brush face, by face index.
 */
function solidScriptSolidTreeFaceUvs(
  brush: SolidTreeBrush,
  faces: readonly SolidScriptFaceUv[],
  options: SolidScriptSolidTreeOptions,
): (SurfaceUvMatrix | undefined)[] {
  const maps: (SurfaceUvMatrix | undefined)[] = brush.brush.faces.map(() => undefined);
  const toLocal = solidScriptSolidTreeFaceUvToLocal(brush, options);
  for (const face of faces) {
    const index = solidScriptSolidTreeFaceUvIndex(brush, face, options);
    if (index >= 0) maps[index] = face.uv.multiplyMatrix4(toLocal);
  }
  return maps;
}

/**
 * Converts a script-space UV matrix into the centred brush's local space.
 *
 * @param brush Centred brush.
 * @param options Placement options.
 * @returns Script-to-local matrix.
 */
function solidScriptSolidTreeFaceUvToLocal(brush: SolidTreeBrush, options: SolidScriptSolidTreeOptions): THREE.Matrix4 {
  const toParent = options.worldToParent
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(options.offset.x, options.offset.y, options.offset.z));
  const toCentered = new THREE.Matrix4().makeTranslation(brush.center.x, brush.center.y, brush.center.z);
  return toParent.clone().invert().multiply(toCentered);
}

/**
 * Finds the centred-brush face that a stored UV record belongs to.
 *
 * @param brush Centred brush.
 * @param face Record in script space.
 * @param options Placement options.
 * @returns Face index, or -1 when none matches.
 */
function solidScriptSolidTreeFaceUvIndex(
  brush: SolidTreeBrush,
  face: SolidScriptFaceUv,
  options: SolidScriptSolidTreeOptions,
): number {
  const point = solidScriptSolidTreePoint(face.point, options).sub(brush.center);
  const tip = solidScriptSolidTreePoint(face.point.clone().add(face.normal), options).sub(brush.center);
  const normal = tip.sub(point).normalize();
  let best = -1;
  let bestAlign = SOLID_SCRIPT_SOLID_TREE_FACE_ALIGN;
  brush.brush.planes.forEach((plane, index) => {
    const align = plane.normal.dot(normal);
    if (align >= bestAlign && Math.abs(plane.signedDistance(point)) <= SOLID_SCRIPT_SOLID_TREE_FACE_GAP) {
      best = index;
      bestAlign = align;
    }
  });
  return best;
}

/**
 * Moves a script point, already in editor axes, to parent-local space.
 *
 * @param point Script point.
 * @param options Placement options.
 * @returns Converted point.
 */
function solidScriptSolidTreePoint(point: THREE.Vector3, options: SolidScriptSolidTreeOptions): THREE.Vector3 {
  return point.clone().add(options.offset).applyMatrix4(options.worldToParent);
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
