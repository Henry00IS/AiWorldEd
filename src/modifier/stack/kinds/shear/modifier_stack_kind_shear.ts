import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import {
  modifierStackFrame,
  modifierStackModelTransform,
  modifierStackUnitsBounds,
  modifierStackVolumeBox,
} from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackReshapeTransform } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { modifierStackAxis } from '@/modifier/stack/kinds/array/modifier_stack_array_math.js';

/** Persisted kind id of the shear modifier. */
export const MODIFIER_STACK_KIND_SHEAR = 'shear';

/** Steepest shear angle in degrees; steeper angles explode toward infinity. */
export const MODIFIER_STACK_SHEAR_MAX_ANGLE = 85;

/** Feedback when both axes are the same, which would be a stretch, not a shear. */
export const MODIFIER_STACK_SHEAR_SAME_AXIS = 'Shear axis and Along must differ; the input passes through unchanged.';

/** X, Y and Z axis choices. */
const MODIFIER_STACK_SHEAR_AXES = modifierStackChoices([
  ['x', 'X'],
  ['y', 'Y'],
  ['z', 'Z'],
]);

/** Fields of the shear modifier. */
const MODIFIER_STACK_SHEAR_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'axis',
    label: 'Shear axis',
    type: 'choice',
    default: 'x',
    choices: MODIFIER_STACK_SHEAR_AXES,
    hint: 'Direction the brushes slide.',
  },
  {
    key: 'along',
    label: 'Along',
    type: 'choice',
    default: 'y',
    choices: MODIFIER_STACK_SHEAR_AXES,
    hint: 'The slide grows with the distance from the pivot along this axis.',
  },
  {
    key: 'mode',
    label: 'Amount',
    type: 'choice',
    default: 'angle',
    choices: modifierStackChoices([
      ['angle', 'Angle'],
      ['factor', 'Factor'],
    ]),
  },
  {
    key: 'angle',
    label: 'Angle °',
    type: 'number',
    default: 20,
    min: -MODIFIER_STACK_SHEAR_MAX_ANGLE,
    max: MODIFIER_STACK_SHEAR_MAX_ANGLE,
    step: 1,
    visible: modifierStackWhen('mode', 'angle'),
    hint: 'Lean of lines that ran along the Along axis.',
  },
  {
    key: 'factor',
    label: 'Factor',
    type: 'number',
    default: 0.5,
    min: -10,
    max: 10,
    step: 0.05,
    visible: modifierStackWhen('mode', 'factor'),
    hint: 'Metres of slide per metre along the Along axis.',
  },
  {
    key: 'pivot',
    label: 'Pivot',
    type: 'choice',
    default: 'whole',
    choices: modifierStackChoices([
      ['whole', 'Centre of whole input'],
      ['piece', 'Centre of each piece'],
      ['volume', 'Volume centre'],
    ]),
    hint: 'Where the slide is zero.',
  },
  {
    key: 'space',
    label: 'Axes',
    type: 'choice',
    default: 'volume',
    choices: modifierStackChoices([
      ['volume', 'Volume'],
      ['world', 'World'],
    ]),
    hint: 'Follow the volume rotation or the world axes.',
  },
  {
    key: 'uv',
    label: 'Textures',
    type: 'choice',
    default: 'copied',
    choices: modifierStackChoices([
      ['copied', 'Move with shape'],
      ['world', 'World aligned'],
    ]),
  },
];

/**
 * Slides the input along one axis in proportion to its position along another.
 * A shear is affine, so convex brushes stay convex. Authored brushes are
 * reshaped in place for the CSG; the scene keeps their authored shape.
 */
export class ModifierStackKindShear extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_SHEAR;
  readonly label = 'Shear';
  readonly category: ModifierStackCategory = 'shape';
  readonly description = 'Leans the input: slides it along one axis in proportion to another. Brushes stay convex.';
  readonly fields: readonly ModifierStackField[] = MODIFIER_STACK_SHEAR_FIELDS;

  /**
   * Returns false: later modifiers see the sheared stand-ins, not the authored
   * brushes, so authored bevels stop here.
   *
   * @returns False.
   */
  override passesAuthoredInput(): boolean {
    return false;
  }

  /**
   * Returns the amount summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const amount =
      parameters['mode'] === 'factor' ? `×${String(parameters['factor'])}` : `${String(parameters['angle'])}°`;
    return `${String(parameters['axis']).toUpperCase()} by ${String(parameters['along']).toUpperCase()} · ${amount}`;
  }

  /**
   * Shears every unit of the working set.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Sheared units; authored ones become reshaped stand-ins.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const parameters = context.step.parameters;
    if (parameters['axis'] === parameters['along']) {
      context.report.error = MODIFIER_STACK_SHEAR_SAME_AXIS;
      return [...units];
    }
    const frame = modifierStackFrame(context.volume, parameters['space']);
    const whole = this.pivotOf(units, frame, context);
    return units.map((unit) => {
      const pivot = parameters['pivot'] === 'piece' ? this.pivotOf([unit], frame, context) : whole;
      const model = modifierStackModelTransform(this.worldShear(parameters, frame, pivot), context.solidRoot);
      const brushes = unit.brushes.map((brush) =>
        modifierStackReshapeTransform(brush, model, String(parameters['uv'])),
      );
      return { ...unit, brushes, reshaped: unit.authored || unit.reshaped };
    });
  }

  /**
   * Returns the pivot in frame coordinates.
   *
   * @param units Units measured together.
   * @param frame Frame-to-world matrix.
   * @param context Evaluation context.
   * @returns Pivot point.
   */
  private pivotOf(
    units: readonly ModifierStackUnit[],
    frame: THREE.Matrix4,
    context: ModifierStackContext,
  ): THREE.Vector3 {
    const box =
      context.step.parameters['pivot'] === 'volume'
        ? modifierStackVolumeBox(context.volume)
        : modifierStackUnitsBounds(units, frame);
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }

  /**
   * Builds the world-space shear about a pivot.
   *
   * @param parameters Normalized parameters.
   * @param frame Frame-to-world matrix.
   * @param pivot Pivot in frame coordinates.
   * @returns World operator.
   */
  private worldShear(parameters: Record<string, unknown>, frame: THREE.Matrix4, pivot: THREE.Vector3): THREE.Matrix4 {
    const local = modifierStackShearMatrix(
      parameters['axis'],
      parameters['along'],
      modifierStackShearFactor(parameters),
      pivot,
    );
    return frame.clone().multiply(local).multiply(frame.clone().invert());
  }
}

/**
 * Reads the shear factor: slide per unit along the Along axis.
 *
 * @param parameters Normalized parameters.
 * @returns Factor; an angle becomes its tangent.
 */
export function modifierStackShearFactor(parameters: Record<string, unknown>): number {
  if (parameters['mode'] === 'factor') return modifierStackNumber(parameters['factor'], 0.5, -10, 10);
  const limit = MODIFIER_STACK_SHEAR_MAX_ANGLE;
  return Math.tan((modifierStackNumber(parameters['angle'], 20, -limit, limit) * Math.PI) / 180);
}

/**
 * Builds p' = p + factor · ((p − pivot) · along) · axis.
 *
 * @param axis Slide axis name.
 * @param along Measuring axis name.
 * @param factor Slide per unit.
 * @param pivot Point that stays fixed.
 * @returns Affine operator.
 */
export function modifierStackShearMatrix(
  axis: unknown,
  along: unknown,
  factor: number,
  pivot: THREE.Vector3,
): THREE.Matrix4 {
  const slide = modifierStackAxis(axis).multiplyScalar(factor).toArray();
  const measure = modifierStackAxis(along).toArray();
  const term = (row: number, column: number): number =>
    (row === column ? 1 : 0) + (slide[row] ?? 0) * (measure[column] ?? 0);
  const shift = new THREE.Vector3().fromArray(slide).multiplyScalar(-new THREE.Vector3().fromArray(measure).dot(pivot));
  return new THREE.Matrix4().set(
    term(0, 0),
    term(0, 1),
    term(0, 2),
    shift.x,
    term(1, 0),
    term(1, 1),
    term(1, 2),
    shift.y,
    term(2, 0),
    term(2, 1),
    term(2, 2),
    shift.z,
    0,
    0,
    0,
    1,
  );
}
