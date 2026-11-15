import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { modifierStackPrimitivePlanarUv } from './modifier_stack_primitive_planar.js';

/**
 * One convex cell of a swept shape: a closed convex cross-section at the start
 * of a segment and the same cross-section turned to its end.
 */
export interface ModifierStackSweepCell {
  /** Cross-section corners at the first angle, in outline order. */
  start: THREE.Vector3[];
  /** The same corners at the second angle. */
  end: THREE.Vector3[];
}

/** How a swept shape is textured and shaded. */
export interface ModifierStackSweepLook {
  /** Point planar faces and wall heights measure their texture from. */
  anchor: THREE.Vector3;
  /**
   * True smooths every side face, such as a torus; false keeps level faces
   * flat.
   */
  smoothAll: boolean;
}

/** Distance under which a point counts as lying on a face, in metres. */
const MODIFIER_STACK_SWEEP_EPSILON = 1e-5;

/** Edges this close to vertical are walls whose texture stands upright. */
const MODIFIER_STACK_SWEEP_VERTICAL = 0.999;

/** World up. */
const MODIFIER_STACK_SWEEP_UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds the convex brush of every cell; cells that enclose no volume are left
 * out.
 *
 * @param cells Cells in sweep order.
 * @returns Valid convex brushes.
 */
export function modifierStackSweepPieces(cells: readonly ModifierStackSweepCell[]): SolidBrush[] {
  return cells.flatMap((cell) => modifierStackPrimitiveHullPieces([...cell.start, ...cell.end]));
}

/** Where one cell's texture starts along the sweep and how long it runs. */
interface ModifierStackSweepSpan {
  /** Texture length at the cell start. */
  start: number;
  /** Texture length across the cell. */
  length: number;
}

/**
 * Builds the face surfaces of a swept piece. Side faces run U along the sweep,
 * continuous from cell to cell and across the cross-section, and V around the
 * cross-section on round tubes. Other shapes keep walls upright and level faces
 * planar so they line up between pieces. The end faces get an anchored planar
 * mapping. One repeat per metre, rounded to whole repeats where a full turn or
 * a tube closes on itself.
 *
 * @param piece Piece in frame coordinates.
 * @param cells Cells of the whole shape in sweep order.
 * @param look Texture anchor.
 * @returns Surface per face.
 */
export function modifierStackSweepSurfaces(
  piece: SolidBrush,
  cells: readonly ModifierStackSweepCell[],
  look: ModifierStackSweepLook,
): FaceSurfaceDescription[] {
  const index = modifierStackSweepCellIndex(piece, cells);
  const cell = cells[index];
  return piece.planes.map((plane, face) => {
    const edge = cell ? modifierStackSweepSideEdge(piece, face, plane, cell) : -1;
    const level = !look.smoothAll && Math.abs(plane.normal.y) > MODIFIER_STACK_SWEEP_VERTICAL;
    const uv =
      cell && edge >= 0 && !level
        ? modifierStackSweepSideUv(
            cell,
            edge,
            plane.normal,
            modifierStackSweepSpanOf(cells, index, edge, look.smoothAll),
            look,
          )
        : modifierStackPrimitivePlanarUv(plane.normal, look.anchor);
    return { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv };
  });
}

/**
 * Returns the smoothing class of every face of a swept piece: side faces smooth
 * together, unless they are level and the shape keeps level faces flat; the end
 * faces stay flat.
 *
 * @param piece Piece in frame coordinates.
 * @param cells Cells of the whole shape in sweep order.
 * @param look Shading options.
 * @returns Class per face.
 */
export function modifierStackSweepSmoothClasses(
  piece: SolidBrush,
  cells: readonly ModifierStackSweepCell[],
  look: ModifierStackSweepLook,
): number[] {
  const cell = cells[modifierStackSweepCellIndex(piece, cells)];
  return piece.planes.map((plane, face) => {
    const side = cell ? modifierStackSweepSideEdge(piece, face, plane, cell) >= 0 : false;
    const level = Math.abs(plane.normal.y) > MODIFIER_STACK_SWEEP_VERTICAL;
    return side && (look.smoothAll || !level) ? 0 : MODIFIER_SMOOTH_FLAT;
  });
}

/**
 * Finds the cell a piece was built from: the one whose first corners at both
 * ends are corners of the piece.
 *
 * @param piece Piece in frame coordinates.
 * @param cells Cells in sweep order.
 * @returns Cell index, or -1.
 */
function modifierStackSweepCellIndex(piece: SolidBrush, cells: readonly ModifierStackSweepCell[]): number {
  const has = (point: THREE.Vector3 | undefined) =>
    !!point && piece.vertices.some((vertex) => vertex.distanceTo(point) < MODIFIER_STACK_SWEEP_EPSILON);
  return cells.findIndex((cell) => cell.start.every((point) => has(point)) && cell.end.every((point) => has(point)));
}

/**
 * Returns where a cell's texture runs along the sweep. Round tubes measure on
 * the path of the cross-section centre so neighbouring faces around the tube
 * agree; other shapes measure each face along its own middle so walls keep one
 * repeat per metre. A sweep that turns a full circle is stretched to a whole
 * number of repeats so its closing seam matches.
 *
 * @param cells Cells in sweep order.
 * @param index Cell index.
 * @param edge Cross-section edge of the face.
 * @param tube True for a round tube.
 * @returns Texture span of the cell.
 */
function modifierStackSweepSpanOf(
  cells: readonly ModifierStackSweepCell[],
  index: number,
  edge: number,
  tube: boolean,
): ModifierStackSweepSpan {
  const lengths = cells.map((cell) => modifierStackSweepPathLength(cell, edge, tube));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const first = cells[0]?.start[0];
  const last = cells[cells.length - 1]?.end[0];
  const closed = !!first && !!last && first.distanceTo(last) < MODIFIER_STACK_SWEEP_EPSILON;
  const factor = closed && total > MODIFIER_STACK_SWEEP_EPSILON ? Math.max(1, Math.round(total)) / total : 1;
  const start = lengths.slice(0, Math.max(0, index)).reduce((sum, length) => sum + length, 0);
  return { start: start * factor, length: (lengths[index] ?? 0) * factor };
}

/**
 * Returns how far a cell carries the texture: along the cross-section centre on
 * round tubes, else along the middle of one edge.
 *
 * @param cell Cell.
 * @param edge Edge index.
 * @param tube True for a round tube.
 * @returns Length in metres.
 */
function modifierStackSweepPathLength(cell: ModifierStackSweepCell, edge: number, tube: boolean): number {
  if (!tube) return modifierStackSweepChord(cell, edge);
  return modifierStackSweepCentre(cell.start).distanceTo(modifierStackSweepCentre(cell.end));
}

/**
 * Returns the centre of a cross-section.
 *
 * @param ring Cross-section corners.
 * @returns Mean corner.
 */
function modifierStackSweepCentre(ring: readonly THREE.Vector3[]): THREE.Vector3 {
  return ring.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, ring.length));
}

/**
 * Returns the length of the middle line of one edge across a cell.
 *
 * @param cell Cell.
 * @param edge Edge index.
 * @returns Chord length in metres.
 */
function modifierStackSweepChord(cell: ModifierStackSweepCell, edge: number): number {
  const { from, to } = modifierStackSweepMiddles(cell, edge);
  return from.distanceTo(to);
}

/**
 * Returns the middle of one cross-section edge at both ends of a cell.
 *
 * @param cell Cell.
 * @param edge Edge index.
 * @returns Middle at the start and at the end.
 */
function modifierStackSweepMiddles(
  cell: ModifierStackSweepCell,
  edge: number,
): { from: THREE.Vector3; to: THREE.Vector3 } {
  const next = (edge + 1) % cell.start.length;
  const middle = (ring: readonly THREE.Vector3[]) =>
    (ring[edge] ?? new THREE.Vector3())
      .clone()
      .add(ring[next] ?? new THREE.Vector3())
      .multiplyScalar(0.5);
  return { from: middle(cell.start), to: middle(cell.end) };
}

/**
 * Returns which cross-section edge a face was swept from, or -1 for the end
 * faces and faces of no edge.
 *
 * @param piece Piece.
 * @param face Face index.
 * @param plane Face plane.
 * @param cell Cell of the piece.
 * @returns Edge index, or -1.
 */
function modifierStackSweepSideEdge(
  piece: SolidBrush,
  face: number,
  plane: SolidPlane,
  cell: ModifierStackSweepCell,
): number {
  if (!piece.faces[face]) return -1;
  const on = (point: THREE.Vector3 | undefined) =>
    !!point && Math.abs(plane.signedDistance(point)) < MODIFIER_STACK_SWEEP_EPSILON;
  for (let edge = 0; edge < cell.start.length; edge++) {
    const next = (edge + 1) % cell.start.length;
    const corners = [cell.start[edge], cell.start[next], cell.end[next], cell.end[edge]];
    const count = corners.filter(on).length;
    if (count >= 3 && modifierStackSweepChord(cell, edge) > MODIFIER_STACK_SWEEP_EPSILON) return edge;
  }
  return -1;
}

/**
 * Builds the mapping of a side face: U along the sweep, covering the cell's
 * span across the middle of the face, V around the cross-section on round
 * tubes, or upward from the anchor height. U turns around when needed so the
 * texture is never mirrored.
 *
 * @param cell Cell of the face.
 * @param edge Cross-section edge of the face.
 * @param normal Outward face normal.
 * @param span Texture span of the cell.
 * @param look Texture anchor and tube flag.
 * @returns UV matrix.
 */
function modifierStackSweepSideUv(
  cell: ModifierStackSweepCell,
  edge: number,
  normal: THREE.Vector3,
  span: ModifierStackSweepSpan,
  look: ModifierStackSweepLook,
): SurfaceUvMatrix {
  const { from, to } = modifierStackSweepMiddles(cell, edge);
  const direction = to.clone().sub(from).normalize();
  const across = modifierStackSweepAcross(cell, edge, direction, look.smoothAll);
  const flip = new THREE.Vector3().crossVectors(direction, across.axis).dot(normal) < 0 ? -1 : 1;
  const scale = span.length / Math.max(from.distanceTo(to), MODIFIER_STACK_SWEEP_EPSILON);
  const u = direction.clone().multiplyScalar(flip * scale);
  const v = across.axis.clone().multiplyScalar(across.scale);
  return new SurfaceUvMatrix(
    new THREE.Vector4(u.x, u.y, u.z, flip * span.start - u.dot(from)),
    new THREE.Vector4(v.x, v.y, v.z, across.offset(look.anchor)),
  );
}

/** V axis of a side face and how it is placed. */
interface ModifierStackSweepAcross {
  /** Unit direction V runs along. */
  axis: THREE.Vector3;
  /** Repeats per metre along the axis. */
  scale: number;
  /** V offset for a texture anchor. */
  offset: (anchor: THREE.Vector3) => number;
}

/**
 * Returns the V axis of a side face: upward from the anchor height on walls of
 * shapes that are not round tubes, else along the edge from its running outline
 * length, rounded to whole repeats around the closed outline.
 *
 * @param cell Cell of the face.
 * @param edge Cross-section edge.
 * @param direction Sweep direction of the face.
 * @param tube True for a round tube.
 * @returns V placement.
 */
function modifierStackSweepAcross(
  cell: ModifierStackSweepCell,
  edge: number,
  direction: THREE.Vector3,
  tube: boolean,
): ModifierStackSweepAcross {
  const start = cell.start[edge] ?? new THREE.Vector3();
  const vector = (cell.start[(edge + 1) % cell.start.length] ?? start).clone().sub(start);
  if (!tube && Math.abs(vector.clone().normalize().y) > MODIFIER_STACK_SWEEP_VERTICAL)
    return { axis: MODIFIER_STACK_SWEEP_UP.clone(), scale: 1, offset: (anchor) => -anchor.y };
  const axis = vector.clone().addScaledVector(direction, -vector.dot(direction)).normalize();
  const total = modifierStackSweepOutlineLength(cell, cell.start.length, direction);
  const scale = tube && total > MODIFIER_STACK_SWEEP_EPSILON ? Math.max(1, Math.round(total)) / total : 1;
  const running = modifierStackSweepOutlineLength(cell, edge, direction) * scale;
  return { axis, scale, offset: () => running - scale * axis.dot(start) };
}

/**
 * Returns the outline length of a cross-section up to one edge, each edge
 * measured across the sweep so V meets itself where faces join.
 *
 * @param cell Cell.
 * @param edge Edge index the length runs up to.
 * @param direction Sweep direction, whose share of each edge is left out.
 * @returns Length in metres.
 */
function modifierStackSweepOutlineLength(cell: ModifierStackSweepCell, edge: number, direction: THREE.Vector3): number {
  let length = 0;
  for (let index = 0; index < edge; index++) {
    const start = cell.start[index] ?? new THREE.Vector3();
    const vector = (cell.start[(index + 1) % cell.start.length] ?? start).clone().sub(start);
    length += vector.addScaledVector(direction, -vector.dot(direction)).length();
  }
  return length;
}
