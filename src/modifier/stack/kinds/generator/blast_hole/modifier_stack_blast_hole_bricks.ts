import * as THREE from 'three';
import { modifierStackRandomValue } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';
import { BLAST_HOLE_MIN_THICKNESS, blastHolePolygonContains } from './modifier_stack_blast_hole_quality.js';

/** Brick bond: the share of a brick each row shifts by. */
export const BLAST_HOLE_BONDS: Readonly<Record<string, number>> = { running: 0.5, third: 1 / 3, stack: 0 };

/** Smallest brick size, so a typo cannot ask for millions of bricks. */
export const BLAST_HOLE_MIN_BRICK = 0.05;

/** Brick settings of the Bricks style. */
export interface BlastHoleBrickSettings {
  /** Random seed. */
  seed: number;
  /** Brick length along the wall. */
  brickLength: number;
  /** Brick height. */
  brickHeight: number;
  /** Bond id: running, third or stack. */
  bond: string;
  /** Chance, 0 to 1, that an edge brick is only knocked out at the front. */
  jut: number;
}

/** One brick knocked out of the wall, as a box in the frame. */
export interface BlastHoleBrick {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** One brick slot: its run and up range. */
interface BlastHoleBrickSlot {
  row: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  removed: boolean;
}

/**
 * Lays a brick grid over the box front and knocks out every brick whose middle
 * lies inside the hole outline. Rows start at the box bottom and bricks at its
 * left side, with every row shifted by the bond, like Physics Shatter's brick
 * pattern; bricks at the box sides and top that would be thinner than the
 * thinnest piece are joined to their neighbour instead. Some edge bricks are
 * only knocked out at the front, so their back part juts into the hole.
 *
 * @param outline Hole outline in the frame's XY plane, counter-clockwise.
 * @param box Box in the frame; the front is its +Z side.
 * @param settings Brick settings.
 * @returns Knocked-out bricks, bottom row first.
 */
export function blastHoleBricks(
  outline: readonly THREE.Vector2[],
  box: THREE.Box3,
  settings: BlastHoleBrickSettings,
): BlastHoleBrick[] {
  const slots = blastHoleBrickSlots(box, settings);
  for (const slot of slots)
    slot.removed = blastHolePolygonContains(
      outline,
      new THREE.Vector2((slot.x0 + slot.x1) / 2, (slot.y0 + slot.y1) / 2),
    );
  const depth = box.max.z - box.min.z;
  const bricks: BlastHoleBrick[] = [];
  slots.forEach((slot, index) => {
    if (!slot.removed) return;
    let front = box.min.z;
    if (blastHoleBrickOnEdge(slot, slots)) {
      const chance = modifierStackRandomValue(settings.seed, 0x62726b, index, 1);
      const share = 0.35 + 0.4 * modifierStackRandomValue(settings.seed, 0x62726b, index, 2);
      const cut = depth * share;
      if (chance < settings.jut && cut >= BLAST_HOLE_MIN_THICKNESS && depth - cut >= BLAST_HOLE_MIN_THICKNESS)
        front = box.max.z - cut;
    }
    bricks.push({
      min: new THREE.Vector3(slot.x0, slot.y0, front),
      max: new THREE.Vector3(slot.x1, slot.y1, box.max.z),
    });
  });
  return bricks;
}

/**
 * Lists the brick slots of the box front, row by row.
 *
 * @param box Box in the frame.
 * @param settings Brick settings.
 * @returns Slots.
 */
function blastHoleBrickSlots(box: THREE.Box3, settings: BlastHoleBrickSettings): BlastHoleBrickSlot[] {
  const length = Math.max(BLAST_HOLE_MIN_BRICK, settings.brickLength);
  const height = Math.max(BLAST_HOLE_MIN_BRICK, settings.brickHeight);
  const shift = BLAST_HOLE_BONDS[settings.bond] ?? BLAST_HOLE_BONDS['running']!;
  const rows = blastHoleBrickLines(box.min.y, box.max.y, box.min.y, height);
  const slots: BlastHoleBrickSlot[] = [];
  for (let row = 0; row + 1 < rows.length; row++) {
    const offset = (((row * shift) % 1) + 1) % 1;
    const joints = blastHoleBrickLines(box.min.x, box.max.x, box.min.x + offset * length - length, length);
    for (let index = 0; index + 1 < joints.length; index++)
      slots.push({
        row,
        x0: joints[index]!,
        x1: joints[index + 1]!,
        y0: rows[row]!,
        y1: rows[row + 1]!,
        removed: false,
      });
  }
  return slots;
}

/**
 * Returns the grid lines across a range: both ends plus every line of the grid
 * in between, leaving out lines that would cut off a strip thinner than the
 * thinnest piece at either end.
 *
 * @param from Range start.
 * @param to Range end.
 * @param origin A grid line.
 * @param spacing Grid spacing.
 * @returns Lines in increasing order.
 */
function blastHoleBrickLines(from: number, to: number, origin: number, spacing: number): number[] {
  const lines = [from];
  const first = origin + Math.ceil((from - origin) / spacing) * spacing;
  for (let line = first; line < to; line += spacing)
    if (line - from >= BLAST_HOLE_MIN_THICKNESS && to - line >= BLAST_HOLE_MIN_THICKNESS) lines.push(line);
  lines.push(to);
  return lines;
}

/**
 * Returns whether a knocked-out brick touches a brick that stays: its row
 * neighbours, or an overlapping brick in the row above or below.
 *
 * @param slot Knocked-out slot.
 * @param slots Every slot.
 * @returns True on the edge of the hole.
 */
function blastHoleBrickOnEdge(slot: BlastHoleBrickSlot, slots: readonly BlastHoleBrickSlot[]): boolean {
  return slots.some((other) => {
    if (other.removed) return false;
    if (other.row === slot.row) return other.x1 === slot.x0 || other.x0 === slot.x1;
    return Math.abs(other.row - slot.row) === 1 && other.x0 < slot.x1 && other.x1 > slot.x0;
  });
}
