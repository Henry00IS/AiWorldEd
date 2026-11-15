import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { PhysicsShatterSettings } from './physics_shatter_types.js';
import { physicsShatterCellOf, type PhysicsShatterCell } from './physics_shatter_voronoi.js';
import { PhysicsShatterPolytope } from './physics_shatter_polytope.js';
import { PhysicsShatterRandom } from './physics_shatter_random.js';
import { physicsShatterBrushBounds } from './physics_shatter_geometry.js';
import type { PhysicsShatterBadCell, PhysicsShatterPattern } from './physics_shatter_pattern.js';

/** Smallest brick size, so a typo cannot ask for millions of bricks. */
const PHYSICS_SHATTER_BRICK_MIN_SIZE = 0.02;

/** Largest joint shift at full Brick Jitter, as a share of the brick length. */
const PHYSICS_SHATTER_BRICK_JITTER_SHARE = 0.25;

/** Growth of the brick size per try while too many bricks would fit. */
const PHYSICS_SHATTER_BRICK_GROWTH = 1.15;

/** Stride of the cell index per row: cell index = row · stride + first joint. */
const PHYSICS_SHATTER_BRICK_ROW_STRIDE = 4096;

/** One brick slot: its run and up ranges and its stable index. */
interface PhysicsShatterBrickSlot {
  cellIndex: number;
  runMin: number;
  runMax: number;
  upMin: number;
  upMax: number;
}

/** One course of bricks: its up range and the run positions of its joints. */
interface PhysicsShatterBrickRow {
  upMin: number;
  upMax: number;
  /** Joint positions along the run, both ends included. */
  joints: number[];
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
  return [...new PhysicsShatterBrickPattern(brush, settings, stream, limit, 0).cells()];
}

/**
 * A brick bond that heals bad bricks by merging them with their neighbour in
 * the row (a joint is removed), or with the row below when the row is one
 * brick. Joints that would leave a brick thinner than the minimum are never
 * laid, and a thin top course joins the one below. When more bricks would fit
 * than the limit, all bricks grow evenly instead of leaving any out.
 */
export class PhysicsShatterBrickPattern implements PhysicsShatterPattern {
  private readonly polytope: PhysicsShatterPolytope;
  private readonly axes: PhysicsShatterBrickAxes;
  private readonly rows: PhysicsShatterBrickRow[];
  private readonly cache = new Map<string, PhysicsShatterCell | null>();
  /** True when the bricks had to grow to stay within the limit. */
  readonly limited: boolean;

  /**
   * Lays out the bond.
   *
   * @param brush Convex brush in the modifier frame.
   * @param settings Fracture settings.
   * @param stream Random stream, such as the input index.
   * @param limit Largest number of bricks to make.
   * @param minThickness Thinnest brick allowed, in metres.
   */
  constructor(
    brush: SolidBrush,
    private readonly settings: PhysicsShatterSettings,
    stream: number,
    limit: number,
    private readonly minThickness: number,
  ) {
    this.polytope = PhysicsShatterPolytope.fromBrush(brush);
    const bounds = physicsShatterBrushBounds(brush);
    this.axes = physicsShatterBrickAxes(bounds);
    let scale = 1;
    let rows = this.layout(bounds, stream, scale);
    let tries = 0;
    while (physicsShatterBrickCount(rows) > Math.max(1, limit) && tries++ < 40) {
      scale *= PHYSICS_SHATTER_BRICK_GROWTH;
      rows = this.layout(bounds, stream, scale);
    }
    this.rows = rows;
    this.limited = scale > 1;
  }

  /**
   * Returns every brick that overlaps the brush, bottom row first.
   *
   * @returns Brick cells.
   */
  cells(): readonly PhysicsShatterCell[] {
    const cells: PhysicsShatterCell[] = [];
    for (const slot of this.slots()) {
      const key = `${slot.cellIndex}|${slot.runMin}|${slot.runMax}|${slot.upMin}|${slot.upMax}`;
      let cell = this.cache.get(key);
      if (cell === undefined) {
        const cut = physicsShatterBrickCut(this.polytope, slot, this.axes, this.settings.mortarGap);
        cell = cut ? physicsShatterCellOf(cut, slot.cellIndex) : null;
        this.cache.set(key, cell);
      }
      if (cell) cells.push(cell);
    }
    return cells;
  }

  /**
   * Merges each bad brick with a neighbour: removes its right joint, else its
   * left one, else joins its row with the one below (or above).
   *
   * @param bad Bad cells, worst first.
   * @returns True when anything changed.
   */
  repair(bad: readonly PhysicsShatterBadCell[]): boolean {
    let changed = false;
    const joins: number[] = [];
    const ordered = [...new Set(bad.map((cell) => cell.cellIndex))].sort((left, right) => right - left);
    for (const cellIndex of ordered) {
      const rowIndex = Math.floor(cellIndex / PHYSICS_SHATTER_BRICK_ROW_STRIDE);
      const start = cellIndex % PHYSICS_SHATTER_BRICK_ROW_STRIDE;
      const row = this.rows[rowIndex];
      if (!row || start + 1 >= row.joints.length) continue;
      if (start + 2 < row.joints.length) row.joints.splice(start + 1, 1);
      else if (start > 0) row.joints.splice(start, 1);
      else if (!joins.includes(rowIndex)) joins.push(rowIndex);
      changed = true;
    }
    for (const rowIndex of joins) changed = this.joinRow(rowIndex) || changed;
    return changed;
  }

  /**
   * Joins a one-brick row with its neighbour row.
   *
   * @param rowIndex Row index.
   * @returns True when there was a row to join.
   */
  private joinRow(rowIndex: number): boolean {
    const row = this.rows[rowIndex];
    const other = this.rows[rowIndex > 0 ? rowIndex - 1 : rowIndex + 1];
    if (!row || !other) return false;
    other.upMin = Math.min(other.upMin, row.upMin);
    other.upMax = Math.max(other.upMax, row.upMax);
    this.rows.splice(rowIndex, 1);
    return true;
  }

  /**
   * Lists the current slots.
   *
   * @returns Slots, bottom row first, then along the run.
   */
  private slots(): PhysicsShatterBrickSlot[] {
    const slots: PhysicsShatterBrickSlot[] = [];
    this.rows.forEach((row, rowIndex) => {
      for (let joint = 0; joint + 1 < row.joints.length; joint++) {
        const [runMin, runMax] = [row.joints[joint] ?? 0, row.joints[joint + 1] ?? 0];
        const cellIndex = rowIndex * PHYSICS_SHATTER_BRICK_ROW_STRIDE + joint;
        slots.push({ cellIndex, runMin, runMax, upMin: row.upMin, upMax: row.upMax });
      }
    });
    return slots;
  }

  /**
   * Lays out the rows and joints at a brick size scale.
   *
   * @param bounds Brush bounds.
   * @param stream Random stream.
   * @param scale Brick size factor.
   * @returns Rows.
   */
  private layout(bounds: THREE.Box3, stream: number, scale: number): PhysicsShatterBrickRow[] {
    const height = Math.max(PHYSICS_SHATTER_BRICK_MIN_SIZE, this.settings.brickHeight) * scale;
    const upMin = bounds.min.dot(this.axes.up);
    const upMax = bounds.max.dot(this.axes.up);
    const levels = [upMin];
    for (let level = upMin + height; level < upMax - 1e-6; level += height) levels.push(level);
    levels.push(upMax);
    if (levels.length > 2 && upMax - (levels[levels.length - 2] ?? upMin) < this.minThickness) levels.splice(-2, 1);
    const random = new PhysicsShatterRandom(this.settings.seed, stream);
    const rows: PhysicsShatterBrickRow[] = [];
    for (let row = 0; row + 1 < levels.length; row++) {
      const joints = this.rowJoints(bounds, row, scale, random);
      rows.push({ upMin: levels[row] ?? upMin, upMax: levels[row + 1] ?? upMax, joints });
    }
    return rows;
  }

  /**
   * Lists the joints of one row: half-brick offset on odd rows, joints moved by
   * the jitter, the outer bricks running past the bounds. A joint closer than
   * the minimum thickness to the previous joint or the far end is left out.
   *
   * @param bounds Brush bounds.
   * @param row Row index.
   * @param scale Brick size factor.
   * @param random Random stream.
   * @returns Joint positions, both ends included.
   */
  private rowJoints(bounds: THREE.Box3, row: number, scale: number, random: PhysicsShatterRandom): number[] {
    const length = Math.max(PHYSICS_SHATTER_BRICK_MIN_SIZE, this.settings.brickLength) * scale;
    const run = this.axes.run;
    const [start, end] = [bounds.min.dot(run), bounds.max.dot(run)];
    const jitter = Math.min(1, Math.max(0, this.settings.brickJitter));
    const shift = PHYSICS_SHATTER_BRICK_JITTER_SHARE * length * jitter;
    const joints = [start];
    for (let joint = start + (row % 2 === 1 ? length * 0.5 : length); joint < end - 1e-6; joint += length) {
      const placed = joint + random.between(-shift, shift);
      const previous = joints[joints.length - 1] ?? start;
      if (placed - previous >= this.minThickness && end - placed >= this.minThickness) joints.push(placed);
    }
    joints.push(end);
    return joints;
  }
}

/**
 * Counts the bricks of a layout.
 *
 * @param rows Rows.
 * @returns Number of slots.
 */
function physicsShatterBrickCount(rows: readonly PhysicsShatterBrickRow[]): number {
  return rows.reduce((count, row) => count + row.joints.length - 1, 0);
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
