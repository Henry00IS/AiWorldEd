import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { modifierStackPrimitivePlanarUv } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_primitive_planar.js';
import {
  modifierStackSweepSurfaces,
  type ModifierStackSweepCell,
  type ModifierStackSweepLook,
} from '@/modifier/stack/kinds/generator/primitive/modifier_stack_primitive_sweep.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import {
  solidScriptUvSpacePoints,
  solidScriptUvSpaceSurfaces,
  type SolidScriptUvSpaceLookup,
} from './solid_script_uv_space.js';

/** Farthest, in repeats, a point may lie from a face's plane and still be on it. */
const SOLID_SCRIPT_UV_PATH_SPLIT = 1e-5;

/** Shortest path step, in repeats, that still has a direction. */
const SOLID_SCRIPT_UV_PATH_STEP = 1e-9;

/** Up, which the corners of each cross-section are counted from. */
const SOLID_SCRIPT_UV_PATH_UP = new THREE.Vector3(0, 1, 0);

/**
 * Solids that follow one path, measured the way the built-in swept generators
 * measure theirs.
 */
export interface SolidScriptUvPathSpace {
  /** From script space into this space, one unit per repeat. */
  matrix: THREE.Matrix4;
  /**
   * Each solid's cross-section where it starts and where it ends, in path
   * order.
   */
  cells: ModifierStackSweepCell[];
  /** Point flat faces and upright walls measure their texture from. */
  anchor: THREE.Vector3;
  /** True wraps the texture around a round cross-section. */
  tube: boolean;
  /** True when the path ends where it starts. */
  closed: boolean;
  /**
   * How far the texture has run along each cross-section edge in the solids
   * mapped so far, so the next solid carries on from there.
   */
  joints: number[];
}

/**
 * Measures solids along a path: solid number N runs from path point N to path
 * point N + 1.
 *
 * @param leaves Solids in path order.
 * @param path Path points in script space, one more than the solids.
 * @param size Metres of one repeat.
 * @param tube True wraps the texture around a round cross-section.
 * @returns Path space.
 */
export function solidScriptUvPathSpace(
  leaves: readonly SolidScriptShapeSolid[],
  path: readonly THREE.Vector3[],
  size: number,
  tube: boolean,
): SolidScriptUvPathSpace {
  if (path.length < leaves.length + 1)
    throw new Error(
      `Path needs a point where each solid starts and ends: ${leaves.length + 1} points for ${leaves.length} solids, not ${path.length}`,
    );
  const matrix = new THREE.Matrix4().makeScale(1 / size, 1 / size, 1 / size);
  const steps = path.map((point) => point.clone().applyMatrix4(matrix));
  const cells = leaves.map((leaf, index) =>
    solidScriptUvPathCell(solidScriptUvSpacePoints(leaf, matrix), leaf.faces, steps[index]!, steps[index + 1]!),
  );
  const anchor = (leaves[0]?.uvAnchor ?? new THREE.Vector3()).clone().applyMatrix4(matrix);
  return { matrix, cells, anchor, tube, closed: solidScriptUvPathLoops(cells), joints: [] };
}

/**
 * Tells whether cells end where they start, which the built-in sweep rounds to
 * whole repeats; a single cell can, when its first corner sits on the turning
 * axis.
 *
 * @param cells Cells in path order.
 * @returns True when the first corner comes back to its start.
 */
function solidScriptUvPathLoops(cells: readonly ModifierStackSweepCell[]): boolean {
  const first = cells[0]?.start[0];
  const last = cells[cells.length - 1]?.end[0];
  return !!first && !!last && first.distanceTo(last) < SOLID_SCRIPT_UV_PATH_SPLIT;
}

/**
 * Maps the faces of one solid the way the built-in swept generators map theirs:
 * U along the path, V across it. Solids of an open path are mapped in path
 * order, each carrying on from the one before, so the work grows with the
 * solids rather than with their square; a closed path, or a solid whose first
 * corner sits on the axis, is measured against the whole path.
 *
 * @param leaf Solid.
 * @param space Path space of the solids it belongs to.
 * @param index Place of the solid along the path.
 * @returns Mapping of a face, or null when it gets none.
 */
export function solidScriptUvPathSurfaces(
  leaf: SolidScriptShapeSolid,
  space: SolidScriptUvPathSpace,
  index: number,
): SolidScriptUvSpaceLookup {
  const look = { anchor: space.anchor, smoothAll: space.tube };
  const cell = space.cells[index]!;
  const whole = space.closed || solidScriptUvPathLoops([cell]);
  return solidScriptUvSpaceSurfaces(leaf, space.matrix, (brush) =>
    whole ? modifierStackSweepSurfaces(brush, space.cells, look) : solidScriptUvPathChained(brush, cell, space, look),
  );
}

/**
 * Maps one solid on its own, then moves the U of each side face on by how far
 * the texture has already run along that edge in the solids before it.
 *
 * @param brush Solid in the path space.
 * @param cell Its cross-sections.
 * @param space Path space, whose joints it reads and adds to.
 * @param look Texture anchor and tube flag.
 * @returns Surface per face.
 */
function solidScriptUvPathChained(
  brush: SolidBrush,
  cell: ModifierStackSweepCell,
  space: SolidScriptUvPathSpace,
  look: ModifierStackSweepLook,
): FaceSurfaceDescription[] {
  const run = cell.start.map((_, edge) => solidScriptUvPathChord(cell, edge));
  const surfaces = modifierStackSweepSurfaces(brush, [cell], look).map((surface, face) => {
    const plane = brush.planes[face]!;
    const edge = solidScriptUvPathEdge(plane, cell);
    if (edge < 0 || surface.uv.equals(modifierStackPrimitivePlanarUv(plane.normal, look.anchor))) return surface;
    const from = surface.uv.project(solidScriptUvPathMiddle(cell.start, edge)).u;
    const to = surface.uv.project(solidScriptUvPathMiddle(cell.end, edge)).u;
    run[edge] = Math.abs(to - from);
    return { ...surface, uv: solidScriptUvPathShifted(surface.uv, Math.sign(to - from) * (space.joints[edge] ?? 0)) };
  });
  run.forEach((length, edge) => (space.joints[edge] = (space.joints[edge] ?? 0) + length));
  return surfaces;
}

/**
 * Returns the cross-section edge a face was swept from: the edge with at least
 * three of its four corners, at both ends of the cell, on the face.
 *
 * @param plane Face plane.
 * @param cell Cell of the solid.
 * @returns Edge index, or -1 for an end face.
 */
function solidScriptUvPathEdge(plane: SolidPlane, cell: ModifierStackSweepCell): number {
  const on = (point: THREE.Vector3 | undefined) =>
    !!point && Math.abs(plane.signedDistance(point)) <= SOLID_SCRIPT_UV_PATH_SPLIT;
  return cell.start.findIndex((corner, edge) => {
    const next = (edge + 1) % cell.start.length;
    return [corner, cell.start[next], cell.end[next], cell.end[edge]].filter(on).length >= 3;
  });
}

/**
 * Corners of the end face that holds one path point and not the other.
 *
 * @param planes Face planes of the solid.
 * @param points Corners of the solid.
 * @param here Path point on the end face.
 * @param there Path point at the other end.
 * @returns Corners of that end, or none.
 */
function solidScriptUvPathCap(
  planes: readonly THREE.Plane[],
  points: readonly THREE.Vector3[],
  here: THREE.Vector3,
  there: THREE.Vector3,
): THREE.Vector3[] {
  const on = (plane: THREE.Plane, point: THREE.Vector3) =>
    Math.abs(plane.distanceToPoint(point)) <= SOLID_SCRIPT_UV_PATH_SPLIT;
  const cap = planes.find((plane) => on(plane, here) && !on(plane, there));
  return cap ? points.filter((point) => on(cap, point)) : [];
}

/**
 * Length of the middle line of one cross-section edge across a cell.
 *
 * @param cell Cell.
 * @param edge Edge index.
 * @returns Length in repeats.
 */
function solidScriptUvPathChord(cell: ModifierStackSweepCell, edge: number): number {
  return solidScriptUvPathMiddle(cell.end, edge).distanceTo(solidScriptUvPathMiddle(cell.start, edge));
}

/**
 * Middle of one edge of a cross-section.
 *
 * @param ring Cross-section corners.
 * @param edge Edge index.
 * @returns Middle point.
 */
function solidScriptUvPathMiddle(ring: readonly THREE.Vector3[], edge: number): THREE.Vector3 {
  const next = ring[(edge + 1) % ring.length] ?? ring[edge]!;
  return ring[edge]!.clone().add(next).multiplyScalar(0.5);
}

/**
 * A mapping with its U moved on by an amount.
 *
 * @param uv Mapping.
 * @param shift Repeats to add to U.
 * @returns Moved mapping.
 */
function solidScriptUvPathShifted(uv: SurfaceUvMatrix, shift: number): SurfaceUvMatrix {
  const u = uv.u.clone();
  u.w += shift;
  return new SurfaceUvMatrix(u, uv.v.clone());
}

/**
 * Finds a solid's cross-section where it starts and the one where it ends: the
 * faces that hold one of its path points and not the other.
 *
 * @param points Corners.
 * @param faces Face loops of corner numbers.
 * @param from Path point where it starts.
 * @param to Path point where it ends.
 * @returns Cell, each cross-section in the same order around.
 */
function solidScriptUvPathCell(
  points: readonly THREE.Vector3[],
  faces: readonly number[][],
  from: THREE.Vector3,
  to: THREE.Vector3,
): ModifierStackSweepCell {
  const along = to.clone().sub(from);
  if (along.length() <= SOLID_SCRIPT_UV_PATH_STEP)
    throw new Error('Path has two points in one place; each solid needs a step along it');
  along.normalize();
  const planes = faces.map((loop) => solidScriptUvPathPlane(loop.map((index) => points[index] ?? new THREE.Vector3())));
  const [first, last] = [
    solidScriptUvPathCap(planes, points, from, to),
    solidScriptUvPathCap(planes, points, to, from),
  ];
  if (first.length !== last.length || first.length < 3)
    throw new Error('each solid must join two matching cross-sections, with one path point on each');
  return { start: solidScriptUvPathAround(first, along), end: solidScriptUvPathAround(last, along) };
}

/**
 * Plane of a face loop.
 *
 * @param corners Corners of the face.
 * @returns Plane.
 */
function solidScriptUvPathPlane(corners: readonly THREE.Vector3[]): THREE.Plane {
  const normal = new THREE.Vector3();
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length] ?? corner;
    normal.x += (corner.y - next.y) * (corner.z + next.z);
    normal.y += (corner.z - next.z) * (corner.x + next.x);
    normal.z += (corner.x - next.x) * (corner.y + next.y);
  });
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), corners[0] ?? new THREE.Vector3());
}

/**
 * Orders a cross-section's corners around its middle, starting from the right
 * of the path and turning up.
 *
 * @param ring Corners of one cross-section.
 * @param along Unit path direction.
 * @returns Corners in order.
 */
function solidScriptUvPathAround(ring: readonly THREE.Vector3[], along: THREE.Vector3): THREE.Vector3[] {
  const right = new THREE.Vector3().crossVectors(along, SOLID_SCRIPT_UV_PATH_UP);
  if (right.lengthSq() <= SOLID_SCRIPT_UV_PATH_STEP) right.set(0, 0, 1).cross(along);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, along).normalize();
  const middle = ring.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(ring.length);
  const turn = (point: THREE.Vector3) => {
    const offset = point.clone().sub(middle);
    const angle = Math.atan2(offset.dot(up), offset.dot(right));
    return angle < 0 ? angle + 2 * Math.PI : angle;
  };
  return [...ring].sort((left, right) => turn(left) - turn(right));
}
