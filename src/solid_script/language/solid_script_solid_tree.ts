import * as THREE from 'three';
import type { SolidTreeBrush, SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { solidScriptBodyBrush, solidScriptBodyFacesMoved } from './solid_script_body.js';
import { solidScriptSolidBuildable } from './solid_script_solid_validate.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptGroupModeOperation, solidScriptModeOperation } from './solid_script_mode.js';
import type {
  SolidScriptFaceSmooth,
  SolidScriptFaceUv,
  SolidScriptShape,
  SolidScriptShapeSolid,
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
 * Maps evaluated script shapes onto ordered CSG brushes: each brush uses its
 * Mode, or the insertion operation when the line left Mode unset, and joined
 * lists flatten so line order is scene CSG order.
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
    // A brush left non-convex by the script is not built; the run warns about it.
    if (!solidScriptSolidBuildable(shape)) return [];
    const operation = solidScriptModeOperation(shape.mode) ?? role;
    const brush = solidScriptSolidTreeBrush(shape, operation, options);
    if (shape.texture) brush.texture = shape.texture;
    if (shape.faceTextures)
      brush.faceTextures = solidScriptSolidTreeFacePins(brush, shape.faceTextures, options, (face) => face.texture);
    if (shape.faceSmooth) solidScriptSolidTreeSmooth(brush, shape.faceSmooth, options);
    if (shape.boxUvSize !== undefined) brush.boxUvSize = shape.boxUvSize;
    if (shape.faceUvs) brush.faceUvs = solidScriptSolidTreeFaceUvs(brush, shape.faceUvs, options);
    return [brush];
  }
  if (shape.kind === 'mesh') return [];
  if (shape.kind === 'group') {
    return [
      {
        kind: 'group',
        name: solidScriptSolidTreeName(shape.label, options),
        operation: solidScriptGroupModeOperation(shape.mode),
        children: shape.children.flatMap((child) => solidScriptSolidTreeNodes(child, SolidOperation.Additive, options)),
      },
    ];
  }
  return shape.children.flatMap((child) => solidScriptSolidTreeNodes(child, role, options));
}

/**
 * Builds one convex brush from a script solid's own corners and faces, without
 * a hull.
 *
 * @param solid Solid in script space.
 * @param operation Brush operation.
 * @param options Placement options.
 * @returns Brush node.
 */
function solidScriptSolidTreeBrush(
  solid: SolidScriptShapeSolid,
  operation: SolidOperation,
  options: SolidScriptSolidTreeOptions,
): SolidTreeBrush {
  const points = solid.points.map((point) => solidScriptSolidTreePoint(point, options));
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
  const faces = solidScriptBodyFacesMoved(solid.faces, options.worldToParent);
  const brush = solidScriptBodyBrush({ points: points.map((point) => point.sub(center)), faces }, solid.label);
  return { kind: 'brush', name: solidScriptSolidTreeName(solid.label, options), operation, brush, center };
}

/** Farthest a textured face's point may be from a brush face, in metres. */
const SOLID_SCRIPT_SOLID_TREE_FACE_GAP = 1e-3;

/** Least alignment of a textured face's direction with a brush face. */
const SOLID_SCRIPT_SOLID_TREE_FACE_ALIGN = 0.99;

/** A record pinned to a face by a point on it and the way it looks. */
interface SolidScriptFacePin {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Finds the brush faces records are pinned to: the face whose plane holds the
 * record's point and looks the same way.
 *
 * @param brush Brush node, centered on its origin.
 * @param faces Records in script space.
 * @param options Placement options.
 * @param valueOf What each record gives its face.
 * @returns Value per brush face, by face index.
 */
function solidScriptSolidTreeFacePins<Pin extends SolidScriptFacePin, Value>(
  brush: SolidTreeBrush,
  faces: readonly Pin[],
  options: SolidScriptSolidTreeOptions,
  valueOf: (face: Pin) => Value,
): (Value | undefined)[] {
  const textures: (Value | undefined)[] = brush.brush.faces.map(() => undefined);
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
    if (best >= 0) textures[best] = valueOf(face);
  }
  return textures;
}

/**
 * Gives the brush the smooth shading of its faces, leaving it out when every
 * face stays flat.
 *
 * @param brush Brush node, centered on its origin.
 * @param faces Smooth shading records in script space, later ones winning.
 * @param options Placement options.
 */
function solidScriptSolidTreeSmooth(
  brush: SolidTreeBrush,
  faces: readonly SolidScriptFaceSmooth[],
  options: SolidScriptSolidTreeOptions,
): void {
  const angles = solidScriptSolidTreeFacePins(brush, faces, options, (face) => face.angle).map((angle) =>
    angle !== undefined && angle > 0 ? angle : undefined,
  );
  if (angles.some((angle) => angle !== undefined)) brush.faceSmooth = angles;
}

/**
 * Finds the brush faces given their own UV mapping, converts each matrix from
 * script space into the centered brush's space, and lists them by face index.
 *
 * @param brush Brush node, centered on its origin.
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
 * Converts a script-space UV matrix into the centered brush's local space.
 *
 * @param brush Centerd brush.
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
 * Finds the centered-brush face that a stored UV record belongs to.
 *
 * @param brush Centerd brush.
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
