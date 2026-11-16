import * as THREE from 'three';
import type { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import {
  solidScriptPolygonConvexPieces,
  solidScriptPolygonHull,
  type SolidScriptPoint2,
} from './solid_script_polygon.js';
import { solidScriptMeshTransform } from './solid_script_mesh.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeLeavesPositive,
  solidScriptShapeMapLeaves,
  type SolidScriptShape,
  type SolidScriptShapeSolid,
} from './solid_script_shape.js';

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
  const moved = { ...leaf, points: leaf.points.map((point) => point.clone().applyMatrix4(matrix)) };
  if (leaf.received) moved.received = { ...leaf.received, matrix: matrix.clone().multiply(leaf.received.matrix) };
  if (!leaf.faceTextures) return moved;
  const normals = new THREE.Matrix3().getNormalMatrix(matrix);
  moved.faceTextures = leaf.faceTextures.map((face) => ({
    ...face,
    point: face.point.clone().applyMatrix4(matrix),
    normal: face.normal.clone().applyMatrix3(normals).normalize(),
  }));
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
        : {
            ...leaf,
            points: leaf.points.map(([x, y]): SolidScriptPoint2 => {
              const point = new THREE.Vector3(x, y, 0).applyMatrix4(matrix);
              return [point.x, point.y];
            }),
          },
  );
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
      leaf.kind === 'polygon' ? leaf.points.map(([x, y]) => new THREE.Vector3(x, y, 0)) : leaf.points,
    );
}

/**
 * The matrix of Resize: scales the shapes about the origin so their bounds get
 * the given size. A size of 0 on an axis keeps that axis, or with Keep
 * Proportions scales it like the first axis that has a size.
 *
 * @param shapes Shapes in the block's own frame.
 * @param args Block fields: size and keep.
 * @param planar True for flat outlines, which only have X and Y.
 * @returns Scale matrix.
 */
export function solidScriptResizeMatrix(
  shapes: readonly SolidScriptShape[],
  args: SolidScriptBlockArguments,
  planar: boolean,
): THREE.Matrix4 {
  const size = args.vector('size', [1, 1, 1]);
  if (size.some((value) => value < 0)) throw args.error('size', 'must not be below 0', size);
  if (size.every((value) => value === 0)) throw args.error('size', 'needs at least one axis above 0', size);
  const bounds = new THREE.Box3().setFromPoints(solidScriptShapePoints(shapes));
  const extent = bounds.getSize(new THREE.Vector3()).toArray();
  const axes = planar ? 2 : 3;
  const ratios = size.map((target, axis) => {
    if (axis >= axes || target === 0) return null;
    if (!(extent[axis]! > 1e-9))
      throw new Error(`Resize cannot stretch shapes that are flat along ${'XYZ'[axis]} to ${target}`);
    return target / extent[axis]!;
  });
  const keep = args.flag('keep');
  const first = ratios.find((ratio) => ratio !== null) ?? 1;
  const [x, y, z] = ratios.map((ratio) => ratio ?? (keep ? first : 1)) as [number, number, number];
  return new THREE.Matrix4().makeScale(x, y, z);
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
  const flatGrow = (piece: SolidScriptPoint2[]): SolidScriptShape => ({
    kind: 'polygon',
    label,
    points: solidScriptPolygonHull(
      grow(piece.map(([x, y]) => new THREE.Vector3(x, y, 0))).map((point): SolidScriptPoint2 => [point.x, point.y]),
    ),
  });
  const pieces = solidScriptShapeLeavesPositive(first).flatMap((leaf): SolidScriptShape[] => {
    if (planar) return leaf.kind === 'polygon' ? solidScriptPolygonConvexPieces(leaf.points).map(flatGrow) : [];
    if (leaf.kind !== 'solid') throw new Error('Minkowski needs solids here; flat outlines belong in a Linear Extrude');
    return [{ kind: 'solid', label, points: grow(leaf.points) }];
  });
  const joined = solidScriptShapeJoin(pieces, label);
  return joined ? [joined] : [];
}

/**
 * Rotate Extrude: spins flat outlines around the Z axis. The outline's X is the
 * distance from the axis and its Y the height; every convex piece becomes one
 * brush per segment.
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
  return solidScriptShapeMapLeaves(shape, (leaf) => {
    if (leaf.kind !== 'polygon') throw new Error('only flat shapes (Square, Circle, Polygon) can be spun');
    if (leaf.points.some(([x]) => x < -1e-9))
      throw new Error(
        'Rotate Extrude spins around the Z axis, so its outlines must lie at X 0 or more; move them with Translate',
      );
    const pieces: SolidScriptShapeSolid[] = [];
    for (const piece of solidScriptPolygonConvexPieces(leaf.points))
      for (let segment = 0; segment < segments; segment++) {
        const turns = [segment * step, (segment + 1) * step];
        pieces.push({
          kind: 'solid',
          label: leaf.label,
          points: piece.flatMap(([radius, height]) =>
            turns.map((turn) =>
              new THREE.Vector3(radius * Math.cos(turn), radius * Math.sin(turn), height).applyMatrix4(matrix),
            ),
          ),
        });
      }
    return solidScriptShapeJoin(pieces, leaf.label) as SolidScriptShape;
  });
}
