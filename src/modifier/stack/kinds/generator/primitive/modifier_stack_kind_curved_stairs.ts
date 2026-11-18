import type * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackWhen } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindPrimitiveSwept } from './modifier_stack_kind_primitive_swept.js';
import type { ModifierStackSweepCell } from './modifier_stack_primitive_sweep.js';
import {
  modifierStackRingFrame,
  modifierStackRingScaledPoint,
  type ModifierStackRingFrame,
} from './modifier_stack_primitive_ring.js';
import {
  modifierStackPrimitiveCount,
  modifierStackPrimitiveCountField,
  modifierStackPrimitiveSweepField,
  modifierStackPrimitiveValue,
} from './modifier_stack_primitive_fields.js';

/** Number of steps. */
const MODIFIER_STACK_CURVED_STAIRS_STEPS_FIELD = modifierStackPrimitiveCountField(
  'steps',
  'Steps',
  { default: 12, min: 2, max: 128 },
  'Number of steps from the bottom to the top of the volume; the last step reaches the top.',
);

/** Turn of the whole flight. */
const MODIFIER_STACK_CURVED_STAIRS_SWEEP_FIELD = modifierStackPrimitiveSweepField(
  270,
  1440,
  'How far the flight turns from the first to the last step, in degrees. Above 360 winds into a spiral staircase; each turn stands on the one below.',
);

/** Inner edge of the steps. */
const MODIFIER_STACK_CURVED_STAIRS_INNER_FIELD: ModifierStackField = {
  key: 'innerRadius',
  label: 'Inner Radius',
  type: 'number',
  default: 0.3,
  min: 0,
  max: 0.95,
  step: 0.05,
  hint: 'Inner edge of the steps relative to the outer edge. 0 lets the steps meet in the middle, like a spiral staircase around a pole.',
};

/** Turn direction going up. */
const MODIFIER_STACK_CURVED_STAIRS_DIRECTION_FIELD: ModifierStackField = {
  key: 'direction',
  label: 'Direction',
  type: 'choice',
  default: 'Counter Clockwise',
  choices: modifierStackChoices([
    ['Counter Clockwise', 'Counter Clockwise'],
    ['Clockwise', 'Clockwise'],
  ]),
  hint: 'Which way the flight turns going up, seen from above. The first step starts on the +X side.',
};

/** Straight pieces per step along the curve. */
const MODIFIER_STACK_CURVED_STAIRS_DETAIL_FIELD = modifierStackPrimitiveCountField(
  'stepDetail',
  'Step Detail',
  { default: 2, min: 1, max: 16 },
  'Straight pieces along the curve of each step; each is one convex brush. More pieces make the outer wall rounder.',
);

/** Solid flight or floating steps. */
const MODIFIER_STACK_CURVED_STAIRS_FILL_FIELD: ModifierStackField = {
  key: 'fillToFloor',
  label: 'Fill To Floor',
  type: 'boolean',
  default: true,
  hint: 'On fills every step down to the floor, or to the step one turn below on a spiral. Off makes floating steps of the Step Thickness.',
};

/** Thickness of floating steps. */
const MODIFIER_STACK_CURVED_STAIRS_THICKNESS_FIELD: ModifierStackField = {
  key: 'stepThickness',
  label: 'Step Thickness',
  type: 'number',
  default: 0.2,
  min: 0.01,
  max: 100,
  step: 0.05,
  hint: 'Thickness of each floating step in metres, measured down from its tread.',
  visible: modifierStackWhen('fillToFloor', false),
};

/** Placement of one step: its turn and its height range. */
interface ModifierStackCurvedStairsStep {
  /** First angle in radians. */
  from: number;
  /** Last angle in radians. */
  to: number;
  /** Underside height. */
  bottom: number;
  /** Tread height. */
  top: number;
}

/**
 * Builds a curved or spiral staircase that fills its box: steps turn around the
 * vertical axis from the +X side, each split into convex pieces along the
 * curve.
 */
export class ModifierStackKindCurvedStairs extends ModifierStackKindPrimitiveSwept {
  readonly id = 'curvedStairs';
  readonly label = 'Curved Stairs';
  readonly description = 'Builds a curved or spiral staircase filling the volume, with treads that follow the curve.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_CURVED_STAIRS_STEPS_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_SWEEP_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_INNER_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_DIRECTION_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_DETAIL_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_FILL_FIELD,
    MODIFIER_STACK_CURVED_STAIRS_THICKNESS_FIELD,
  ];

  /**
   * Returns the step count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackPrimitiveCount(parameters, MODIFIER_STACK_CURVED_STAIRS_STEPS_FIELD)} steps`;
  }

  /**
   * Splits every step into its pieces along the curve.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Cells in sweep order.
   */
  protected cells(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackSweepCell[] {
    const frame = modifierStackRingFrame(box, parameters['direction'] === 'Clockwise' ? -1 : 1);
    const inner = modifierStackPrimitiveValue(parameters, MODIFIER_STACK_CURVED_STAIRS_INNER_FIELD);
    const detail = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_CURVED_STAIRS_DETAIL_FIELD);
    return this.steps(parameters, box).flatMap((step) =>
      Array.from({ length: detail }, (_, index) => {
        const from = step.from + ((step.to - step.from) * index) / detail;
        const to = step.from + ((step.to - step.from) * (index + 1)) / detail;
        return { start: this.outline(frame, inner, from, step), end: this.outline(frame, inner, to, step) };
      }),
    );
  }

  /**
   * Places every step: equal turns and equal rises, each standing on the floor,
   * on the step one turn below, or floating at the step thickness.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Steps bottom to top.
   */
  private steps(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackCurvedStairsStep[] {
    const count = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_CURVED_STAIRS_STEPS_FIELD);
    const sweep = modifierStackPrimitiveValue(parameters, MODIFIER_STACK_CURVED_STAIRS_SWEEP_FIELD);
    const turn = (sweep * Math.PI) / 180 / count;
    const rise = (box.max.y - box.min.y) / count;
    const depth =
      parameters['fillToFloor'] === false
        ? modifierStackPrimitiveValue(parameters, MODIFIER_STACK_CURVED_STAIRS_THICKNESS_FIELD)
        : rise * Math.min(count, (count * 360) / sweep);
    return Array.from({ length: count }, (_, index) => {
      const top = box.min.y + rise * (index + 1);
      return { from: turn * index, to: turn * (index + 1), bottom: Math.max(box.min.y, top - depth), top };
    });
  }

  /**
   * Returns the cross-section of a step at one angle: inner and outer edge,
   * underside and tread.
   *
   * @param frame Ring frame.
   * @param inner Inner edge relative to the outer edge.
   * @param angle Angle in radians.
   * @param step Step heights.
   * @returns Outline corners.
   */
  private outline(
    frame: ModifierStackRingFrame,
    inner: number,
    angle: number,
    step: ModifierStackCurvedStairsStep,
  ): THREE.Vector3[] {
    return [
      modifierStackRingScaledPoint(frame, angle, inner, step.bottom),
      modifierStackRingScaledPoint(frame, angle, 1, step.bottom),
      modifierStackRingScaledPoint(frame, angle, 1, step.top),
      modifierStackRingScaledPoint(frame, angle, inner, step.top),
    ];
  }
}
