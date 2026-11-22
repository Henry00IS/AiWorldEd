import * as THREE from 'three';
import { SOLID_SCRIPT_AXES_FLAT } from './solid_script_axes.js';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import {
  solidScriptPolygonConvexPieces,
  solidScriptPolygonHull,
  type SolidScriptPoint2,
} from './solid_script_polygon.js';
import { solidScriptFaceTagsTransform, solidScriptMeshTransform } from './solid_script_mesh.js';
import { solidScriptFaceUvsCarry, solidScriptUvCarryAccumulate } from './solid_script_uvs.js';
import { solidScriptBodyFacesMoved, solidScriptBodyHull, solidScriptBodyPrism } from './solid_script_body.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeLeavesPositive,
  solidScriptShapeMapLeaves,
  solidScriptShapePolygon,
  solidScriptShapePolygonPoints,
  type SolidScriptShape,
  type SolidScriptShapePolygon,
  type SolidScriptShapeSolid,
} from './solid_script_shape.js';
import { solidScriptPathMap } from './solid_script_path_model.js';

/** Most corner points one Minkowski result may have before it is refused. */
const SOLID_SCRIPT_MINKOWSKI_POINTS_MAX = 20000;

/** Fewest and most segments of a Rotate Extrude. */
const SOLID_SCRIPT_ROTATE_SEGMENTS = { min: 3, max: 128 };

/**
 * Moves a solid's points and the faces given their own texture.
 *
 * @param leaf Solid.
 * @param matrix Transform.
 * @returns Moved solid.
 */
function solidScriptSolidTransform(leaf: SolidScriptShapeSolid, matrix: THREE.Matrix4): SolidScriptShapeSolid {
  const moved = {
    ...leaf,
    points: leaf.points.map((point) => point.clone().applyMatrix4(matrix)),
    faces: solidScriptBodyFacesMoved(leaf.faces, matrix),
  };
  if (leaf.received) moved.received = { ...leaf.received, matrix: matrix.clone().multiply(leaf.received.matrix) };
  if (leaf.faceTags) moved.faceTags = solidScriptFaceTagsTransform(leaf.faceTags, matrix);
  if (leaf.faceTextures) moved.faceTextures = solidScriptFacePinsTransform(leaf.faceTextures, matrix);
  if (leaf.faceSmooth) moved.faceSmooth = solidScriptFacePinsTransform(leaf.faceSmooth, matrix);
  return solidScriptSolidTransformUvs(leaf, moved, matrix);
}

/**
 * Moves records pinned to faces by a point and a direction, such as face
 * textures, with a transform.
 *
 * @param faces Records in script space.
 * @param matrix Transform.
 * @returns Moved records.
 */
function solidScriptFacePinsTransform<Pin extends { point: THREE.Vector3; normal: THREE.Vector3 }>(
  faces: readonly Pin[],
  matrix: THREE.Matrix4,
): Pin[] {
  const normals = new THREE.Matrix3().getNormalMatrix(matrix);
  return faces.map((face) => ({
    ...face,
    point: face.point.clone().applyMatrix4(matrix),
    normal: face.normal.clone().applyMatrix3(normals).normalize(),
  }));
}

/**
 * Carries face mappings through a transform and stores the pose World Aligned
 * later uses to lock them in the world.
 *
 * @param leaf Solid before the transform.
 * @param moved Solid after its points moved.
 * @param matrix Transform applied to the points.
 * @returns Moved solid with mappings and pose.
 */
function solidScriptSolidTransformUvs(
  leaf: SolidScriptShapeSolid,
  moved: SolidScriptShapeSolid,
  matrix: THREE.Matrix4,
): SolidScriptShapeSolid {
  const faceUvs = solidScriptFaceUvsCarry(leaf, matrix);
  if (faceUvs) {
    moved.faceUvs = faceUvs;
    delete moved.boxUvSize;
  }
  const uvCarry = solidScriptUvCarryAccumulate(leaf, matrix);
  if (uvCarry) moved.uvCarry = uvCarry;
  else delete moved.uvCarry;
  return moved;
}

/**
 * Moves every point of a shape tree by a matrix. Flat outlines move in their
 * plane: X and Y of the moved point.
 *
 * @param shape Shape tree.
 * @param matrix Matrix.
 * @returns Moved tree.
 */
export function solidScriptShapeTransform(shape: SolidScriptShape, matrix: THREE.Matrix4): SolidScriptShape {
  return solidScriptShapeMapLeaves(shape, (leaf) =>
    leaf.kind === 'solid'
      ? solidScriptSolidTransform(leaf, matrix)
      : leaf.kind === 'mesh'
        ? solidScriptMeshTransform(leaf, matrix)
        : solidScriptOutlineTransform(leaf, matrix),
  );
}

/**
 * Applies a matrix to a flat outline; where a point lands off the flat plane,
 * only its X and Y are kept.
 *
 * @param outline Outline.
 * @param matrix Matrix.
 * @returns Transformed outline.
 */
export function solidScriptOutlineTransform(
  outline: SolidScriptShapePolygon,
  matrix: THREE.Matrix4,
): SolidScriptShapePolygon {
  return {
    ...outline,
    path: solidScriptPathMap(outline.path, ([x, y]): SolidScriptPoint2 => {
      const point = new THREE.Vector3(x, y, 0).applyMatrix4(matrix);
      return [point.x, point.y];
    }),
  };
}

/**
 * Returns the points of a shape tree's material, as 3D points (flat outlines at
 * Z 0).
 *
 * @param shapes Shapes.
 * @returns Points.
 */
function solidScriptShapePoints(shapes: readonly SolidScriptShape[]): THREE.Vector3[] {
  return shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) =>
      leaf.kind === 'polygon'
        ? solidScriptShapePolygonPoints(leaf).map(([x, y]) => new THREE.Vector3(x, y, 0))
        : leaf.points,
    );
}

/**
 * Reads Size on a Resize line, and stops when it is below 0 or 0 on every axis.
 *
 * @param args Block fields: size.
 * @returns Width, height and depth in metres; 0 keeps an axis.
 */
export function solidScriptResizeSize(args: SolidScriptBlockArguments): number[] {
  const size = args.vector('size', [1, 1, 1]);
  if (size.some((value) => value < 0)) throw args.error('size', 'must not be below 0', size);
  if (size.every((value) => value === 0)) throw args.error('size', 'needs at least one axis above 0', size);
  return size;
}

/**
 * Scale factors that stretch an extent to a Size, as Resize uses.
 *
 * @param extent Width, height and depth of what is resized, in metres.
 * @param size Target size; 0 leaves that axis alone.
 * @param keep Yes: axes with a size of 0 scale like the first axis that has
 *   one.
 * @param planar True to ignore Z.
 * @returns Scale along X, Y and Z.
 */
export function solidScriptResizeFactors(
  extent: readonly number[],
  size: readonly number[],
  keep: boolean,
  planar: boolean,
): [number, number, number] {
  const axes = planar ? 2 : 3;
  const ratios = size.map((target, axis) => {
    const span = extent[axis] ?? 0;
    if (axis >= axes || target === 0) return null;
    if (!(span > 1e-9))
      throw new Error(
        `Resize cannot stretch shapes that are flat along ${'XYZ'[axis]} to ${target}; check that they have thickness along that axis, or set that size to 0`,
      );
    return target / span;
  });
  const first = ratios.find((ratio) => ratio !== null) ?? 1;
  return ratios.map((ratio) => ratio ?? (keep ? first : 1)) as [number, number, number];
}

/**
 * Reads the rows of a Matrix block into a matrix.
 *
 * @param args Block fields: row1, row2, row3, four numbers each.
 * @returns Matrix.
 */
export function solidScriptMatrixRows(args: SolidScriptBlockArguments): THREE.Matrix4 {
  const [a, b, c] = (['row1', 'row2', 'row3'] as const).map((key, index) =>
    args.vector(
      key,
      [0, 1, 2, 3].map((column) => (column === index ? 1 : 0)),
    ),
  ) as [number[], number[], number[]];
  const matrix = new THREE.Matrix4().set(
    ...(a as [number, number, number, number]),
    ...(b as [number, number, number, number]),
    ...(c as [number, number, number, number]),
    0,
    0,
    0,
    1,
  );
  if (Math.abs(matrix.determinant()) < 1e-9)
    throw new Error(
      'the matrix squashes shapes flat; its first three columns must point in three different directions',
    );
  return matrix;
}

/**
 * Minkowski sum: grows every material piece of the first shape by the other
 * shapes, as if each were swept all over it. Each later shape counts as one
 * convex shape (its hull); the first may be several pieces.
 *
 * @param shapes Shapes of the lines inside, in the block's own frame.
 * @param label Brush label.
 * @param planar True for flat outlines.
 * @returns Grown shapes.
 */
export function solidScriptMinkowski(
  shapes: readonly SolidScriptShape[],
  label: string,
  planar: boolean,
): SolidScriptShape[] {
  const [first, ...others] = shapes;
  if (!first) return [];
  const tools = others.map((shape) => solidScriptShapePoints([shape]));
  const grow = (points: THREE.Vector3[]): THREE.Vector3[] =>
    tools.reduce((sum, tool) => {
      if (sum.length * tool.length > SOLID_SCRIPT_MINKOWSKI_POINTS_MAX)
        throw new Error(
          `Minkowski would need ${sum.length * tool.length} corner points, more than ${SOLID_SCRIPT_MINKOWSKI_POINTS_MAX}; use fewer Sides`,
        );
      return sum.flatMap((a) => tool.map((b) => a.clone().add(b)));
    }, points);
  const flatGrow = (piece: SolidScriptPoint2[]): SolidScriptShape =>
    solidScriptShapePolygon(
      solidScriptPolygonHull(
        grow(piece.map(([x, y]) => new THREE.Vector3(x, y, 0))).map((point): SolidScriptPoint2 => [point.x, point.y]),
      ),
      label,
    );
  const pieces = solidScriptShapeLeavesPositive(first).flatMap((leaf): SolidScriptShape[] => {
    if (planar)
      return leaf.kind === 'polygon'
        ? solidScriptPolygonConvexPieces(solidScriptShapePolygonPoints(leaf)).map(flatGrow)
        : [];
    if (leaf.kind !== 'solid') throw new Error('Minkowski needs solids here; closed paths belong in a Linear Extrude');
    return [{ kind: 'solid', label, ...solidScriptBodyHull(grow(leaf.points), label) }];
  });
  const joined = solidScriptShapeJoin(pieces, label);
  return joined ? [joined] : [];
}

/**
 * Rotate Extrude: spins flat outlines around the upright Y axis. The outline's
 * X is the distance from the axis and its Y the height; every convex piece
 * becomes one brush per segment.
 *
 * @param shape Flat outlines.
 * @param args Block fields: angle and sides.
 * @param matrix Placement of the result.
 * @returns Solids.
 */
export function solidScriptRotateExtrude(
  shape: SolidScriptShape,
  args: SolidScriptBlockArguments,
  matrix: THREE.Matrix4,
): SolidScriptShape {
  const angle = args.number('angle', 360);
  if (!(Math.abs(angle) > 0) || Math.abs(angle) > 360) throw args.error('angle', 'must be between 0 and 360', angle);
  const sides = Math.round(args.number('sides', 16));
  if (sides < SOLID_SCRIPT_ROTATE_SEGMENTS.min || sides > SOLID_SCRIPT_ROTATE_SEGMENTS.max)
    throw args.error(
      'sides',
      `must be ${SOLID_SCRIPT_ROTATE_SEGMENTS.min} to ${SOLID_SCRIPT_ROTATE_SEGMENTS.max}`,
      sides,
    );
  const segments = Math.max(1, Math.round((sides * Math.abs(angle)) / 360));
  const step = ((angle / segments) * Math.PI) / 180;
  const lift = matrix.clone().multiply(SOLID_SCRIPT_AXES_FLAT);
  return solidScriptShapeMapLeaves(shape, (leaf) => {
    if (leaf.kind !== 'polygon')
      throw new Error('only closed paths (Square, Circle, Polygon or a closed Path) can be spun');
    const corners = solidScriptShapePolygonPoints(leaf);
    if (corners.some(([x]) => x < -1e-9))
      throw new Error(
        'Rotate Extrude spins around the Y axis (up), so its paths must lie at X 0 or more; move them with Move',
      );
    const pieces: SolidScriptShapeSolid[] = [];
    for (const piece of solidScriptPolygonConvexPieces(corners))
      for (let segment = 0; segment < segments; segment++) {
        const spun = (turn: number) =>
          piece.map(([radius, height]) =>
            new THREE.Vector3(radius * Math.cos(turn), radius * Math.sin(turn), height).applyMatrix4(lift),
          );
        const body = solidScriptBodyPrism(spun(segment * step), spun((segment + 1) * step), leaf.label);
        pieces.push({ kind: 'solid', label: leaf.label, ...body });
      }
    return solidScriptShapeJoin(pieces, leaf.label) as SolidScriptShape;
  });
}
