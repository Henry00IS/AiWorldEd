import type * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveSwept } from './modifier_stack_kind_primitive_swept.js';
import type { ModifierStackSweepCell } from './modifier_stack_primitive_sweep.js';
import {
  modifierStackRingAngles,
  modifierStackRingFrame,
  modifierStackRingInsetLimit,
  modifierStackRingPoint,
} from './modifier_stack_primitive_ring.js';
import {
  MODIFIER_STACK_PRIMITIVE_MAX_SIDES,
  modifierStackPrimitiveCount,
  modifierStackPrimitiveCountField,
  modifierStackPrimitiveSweepField,
  modifierStackPrimitiveValue,
} from './modifier_stack_primitive_fields.js';

/** Segments around the pipe. */
const MODIFIER_STACK_PIPE_SIDES_FIELD = modifierStackPrimitiveCountField(
  'sides',
  'Sides',
  { default: 16, min: 3, max: MODIFIER_STACK_PRIMITIVE_MAX_SIDES },
  'Segments around a whole turn; each segment is one convex solid. More sides look rounder.',
);

/** Wall thickness in metres. */
const MODIFIER_STACK_PIPE_WALL_FIELD: ModifierStackField = {
  key: 'wallThickness',
  label: 'Wall Thickness',
  type: 'number',
  default: 0.25,
  min: 0.01,
  max: 100,
  step: 0.05,
  hint: 'Thickness of the wall in metres; it stays the same all the way around, also on oval pipes.',
};

/** How far the pipe turns. */
const MODIFIER_STACK_PIPE_SWEEP_FIELD = modifierStackPrimitiveSweepField(
  360,
  360,
  'How far the wall turns, in degrees, counter-clockwise from the +X side seen from above. Below 360 makes a curved wall or an arch-shaped tunnel lining.',
);

/**
 * Builds a hollow pipe or curved wall that fills its box: a rectangular wall
 * section turned around the axis, one convex brush per segment.
 */
export class ModifierStackKindPipe extends ModifierStackKindPrimitiveSwept {
  readonly id = 'pipe';
  readonly label = 'Pipe';
  readonly description =
    'Builds a hollow tube, tower wall or curved wall filling the volume, one convex solid per segment.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_PIPE_SIDES_FIELD,
    MODIFIER_STACK_PIPE_WALL_FIELD,
    MODIFIER_STACK_PIPE_SWEEP_FIELD,
  ];

  /**
   * Returns the side count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PIPE_SIDES_FIELD)} sides`;
  }

  /**
   * Turns the wall section from segment to segment.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Cells in sweep order.
   */
  protected cells(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackSweepCell[] {
    const frame = modifierStackRingFrame(box);
    const wall = Math.min(
      modifierStackPrimitiveValue(parameters, MODIFIER_STACK_PIPE_WALL_FIELD),
      modifierStackRingInsetLimit(frame),
    );
    const outline = (angle: number) =>
      [
        [0, box.min.y],
        [wall, box.min.y],
        [wall, box.max.y],
        [0, box.max.y],
      ].map(([inset, y]) => modifierStackRingPoint(frame, angle, inset ?? 0, y ?? 0));
    const angles = modifierStackRingAngles(
      modifierStackPrimitiveValue(parameters, MODIFIER_STACK_PIPE_SWEEP_FIELD),
      modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PIPE_SIDES_FIELD),
    );
    return angles.slice(1).map((angle, index) => ({ start: outline(angles[index] ?? 0), end: outline(angle) }));
  }
}
