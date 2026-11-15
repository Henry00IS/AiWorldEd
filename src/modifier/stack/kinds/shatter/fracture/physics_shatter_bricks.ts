import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import { physicsShatterCellOf, type PhysicsShatterCell } from './physics_shatter_voronoi.js';
import { PhysicsShatterPolytope } from './physics_shatter_polytope.js';
import { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterBrushBounds } from './physics_shatter_geometry.js';

/** Smallest brick size, so a typo cannot ask for millions of bricks. */
const PHYSICS_SHATTER_BRICK_MIN_SIZE = 0.02;

/** Largest joint shift at full Brick Jitter, as a share of the brick length. */
const PHYSICS_SHATTER_BRICK_JITTER_SHARE = 0.25;

/** One brick slot of the grid: its run and up ranges. */
interface PhysicsShatterBrickSlot {
  runMin: number;
  runMax: number;
  upMin: number;
  upMax: number;
}

/** Axes of a brick grid in the modifier frame. */
interface PhysicsShatterBrickAxes {
  run: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * Cuts a convex brush into a staggered brick bond. Rows follow the frame's up
 * axis, bricks run along the longer horizontal axis of the brush, every other
 * row is offset by half a brick, and each brick is the brush clipped to its
 * slot minus half the mortar gap on each side, so it stays convex.
 *
 * @param brush Convex brush in the modifier frame.
 * @param settings Fracture settings.
 * @param stream Random stream, such as the input index.
 * @param limit Largest number of bricks to make.
 * @returns Brick cells in row order, bottom row first.
 */
export function physicsShatterBrickCells(
  brush: SolidBrush,
  settings: PhysicsShatterSettings,
  stream: number,
  limit: number,
): PhysicsShatterCell[] {
  const bounds = physicsShatterBrushBounds(brush);
  const axes = physicsShatterBrickAxes(bounds);
  const slots = physicsShatterBrickSlots(bounds, axes, settings, stream);
  const polytope = PhysicsShatterPolytope.fromBrush(brush);
  const cells: PhysicsShatterCell[] = [];
  for (let cellIndex = 0; cellIndex < slots.length && cells.length < limit; cellIndex++) {
    const slot = slots[cellIndex];
    const cell = slot ? physicsShatterBrickCut(polytope, slot, axes, settings.mortarGap) : null;
    if (cell) cells.push(physicsShatterCellOf(cell, cellIndex));
  }
  return cells;
}

/**
 * Picks the run axis: X or Z, whichever the brush is longer along.
 *
 * @param bounds Brush bounds.
 * @returns Run and up axes.
 */
function physicsShatterBrickAxes(bounds: THREE.Box3): PhysicsShatterBrickAxes {
  const size = bounds.getSize(new THREE.Vector3());
  const run = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  return { run, up: new THREE.Vector3(0, 1, 0) };
}

/**
 * Lists every brick slot that overlaps the brush bounds, row by row.
 *
 * @param bounds Brush bounds.
 * @param axes Grid axes.
 * @param settings Fracture settings.
 * @param stream Random stream.
 * @returns Slots, bottom row first, then along the run.
 */
function physicsShatterBrickSlots(
  bounds: THREE.Box3,
  axes: PhysicsShatterBrickAxes,
  settings: PhysicsShatterSettings,
  stream: number,
): PhysicsShatterBrickSlot[] {
  const height = Math.max(PHYSICS_SHATTER_BRICK_MIN_SIZE, settings.brickHeight);
  const upMin = bounds.min.dot(axes.up);
  const rows = Math.max(1, Math.ceil((bounds.max.dot(axes.up) - upMin) / height - 1e-6));
  const random = new PhysicsShatterRandom(settings.seed, stream);
  const slots: PhysicsShatterBrickSlot[] = [];
  for (let row = 0; row < rows; row++) {
    const range = { upMin: upMin + row * height, upMax: upMin + (row + 1) * height };
    for (const joints of physicsShatterBrickRowJoints(bounds, axes.run, row, settings, random))
      slots.push({ ...joints, ...range });
  }
  return slots;
}

/**
 * Lists the run ranges of one row: half-brick offset on odd rows, joints moved
 * by the jitter, the outer bricks running past the bounds.
 *
 * @param bounds Brush bounds.
 * @param run Run axis.
 * @param row Row index.
 * @param settings Fracture settings.
 * @param random Random stream.
 * @returns Run ranges in order.
 */
function physicsShatterBrickRowJoints(
  bounds: THREE.Box3,
  run: THREE.Vector3,
  row: number,
  settings: PhysicsShatterSettings,
  random: PhysicsShatterRandom,
): { runMin: number; runMax: number }[] {
  const length = Math.max(PHYSICS_SHATTER_BRICK_MIN_SIZE, settings.brickLength);
  const [start, end] = [bounds.min.dot(run), bounds.max.dot(run)];
  const shift = PHYSICS_SHATTER_BRICK_JITTER_SHARE * length * Math.min(1, Math.max(0, settings.brickJitter));
  const joints = [start];
  for (let joint = start + (row % 2 === 1 ? length * 0.5 : length); joint < end - 1e-6; joint += length) {
    joints.push(joint + random.between(-shift, shift));
  }
  joints.push(end);
  return joints.slice(1).map((runMax, index) => ({ runMin: joints[index] ?? start, runMax }));
}

/**
 * Clips the brush to one brick slot, inset by half the mortar gap.
 *
 * @param polytope Input brush as a polytope.
 * @param slot Brick slot.
 * @param axes Grid axes.
 * @param gap Mortar gap.
 * @returns Brick polytope, or null when the slot misses the brush.
 */
function physicsShatterBrickCut(
  polytope: PhysicsShatterPolytope,
  slot: PhysicsShatterBrickSlot,
  axes: PhysicsShatterBrickAxes,
  gap: number,
): PhysicsShatterPolytope | null {
  const inset = Math.max(0, gap) * 0.5;
  const planes = [
    physicsShatterSlab(axes.run, slot.runMax - inset),
    physicsShatterSlab(axes.run.clone().negate(), -(slot.runMin + inset)),
    physicsShatterSlab(axes.up, slot.upMax - inset),
    physicsShatterSlab(axes.up.clone().negate(), -(slot.upMin + inset)),
  ];
  let cell: PhysicsShatterPolytope | null = polytope;
  for (const plane of planes) cell = cell ? cell.clip(plane) : null;
  return cell;
}

/**
 * Builds the outward plane n·x = distance.
 *
 * @param normal Unit outward normal.
 * @param distance Signed position along the normal.
 * @returns Plane.
 */
function physicsShatterSlab(normal: THREE.Vector3, distance: number): SolidPlane {
  return new SolidPlane(normal, -distance);
}
