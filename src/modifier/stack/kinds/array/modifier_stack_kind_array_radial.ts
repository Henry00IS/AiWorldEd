import { Matrix4, Vector3 } from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackVectorFields,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import {
  MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
  ModifierStackKindArray,
  type ModifierStackArrayPlacement,
} from './modifier_stack_kind_array.js';
import { modifierStackAroundPivot, modifierStackAxis, modifierStackVector } from './modifier_stack_array_math.js';

/** Keys every radial stack saved before the ring placement existed stores. */
const MODIFIER_STACK_RADIAL_LEGACY_KEYS = ['mode', 'radiusOffset', 'pivotX'];

/**
 * Returns the unit direction of a ring centre side such as `-z`.
 *
 * @param side Stored side.
 * @returns Direction in the array frame.
 */
function modifierStackRadialSide(side: unknown): Vector3 {
  const text = typeof side === 'string' && /^[+-][xyz]$/.test(side) ? side : '-z';
  const direction = modifierStackAxis(text[1]);
  return text[0] === '-' ? direction.negate() : direction;
}

/** Repeats the working set around an axis: rings, arcs, or fixed angle steps. */
export class ModifierStackKindArrayRadial extends ModifierStackKindArray {
  readonly id = 'radial';
  readonly label = 'Radial Array';
  readonly description = 'Repeats the input around an axis for columns, colonnades, wedge floors and curved corridors.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'origin',
      label: 'Original',
      type: 'choice',
      default: 'ring',
      choices: modifierStackChoices([
        ['ring', 'On the ring'],
        ['centre', 'Around pivot'],
      ]),
      hint: 'On the ring keeps the original in place as the first ring item. Around pivot rotates copies about the pivot (older volumes).',
    },
    {
      key: 'mode',
      label: 'Distribution',
      type: 'choice',
      default: 'ring',
      choices: modifierStackChoices([
        ['ring', 'Full ring'],
        ['arc', 'Arc'],
        ['step', 'Angle step'],
      ]),
    },
    {
      key: 'axis',
      label: 'Axis',
      type: 'choice',
      default: 'y',
      choices: modifierStackChoices([
        ['x', 'X'],
        ['y', 'Y'],
        ['z', 'Z'],
      ]),
    },
    {
      key: 'sweep',
      label: 'Sweep °',
      type: 'number',
      default: 90,
      min: -360,
      max: 360,
      step: 15,
      visible: modifierStackWhen('mode', 'arc'),
    },
    {
      key: 'step',
      label: 'Step °',
      type: 'number',
      default: 15,
      min: -360,
      max: 360,
      step: 5.625,
      visible: modifierStackWhen('mode', 'step'),
    },
    {
      key: 'radius',
      label: 'Radius',
      type: 'number',
      default: 2,
      min: 0,
      step: 0.25,
      hint: 'Distance from the original to the ring centre, in metres.',
      visible: modifierStackWhen('origin', 'ring'),
    },
    {
      key: 'centreSide',
      label: 'Ring centre',
      type: 'choice',
      default: '-z',
      choices: modifierStackChoices([
        ['-z', 'Behind (−Z)'],
        ['+z', 'In front (+Z)'],
        ['-x', 'Left (−X)'],
        ['+x', 'Right (+X)'],
        ['-y', 'Below (−Y)'],
        ['+y', 'Above (+Y)'],
      ]),
      hint: 'Side of the original the ring centre lies on. A side along the axis uses the next one across it.',
      visible: modifierStackWhen('origin', 'ring'),
    },
    {
      key: 'start',
      label: 'Start °',
      type: 'number',
      default: 0,
      min: -3600,
      max: 3600,
      step: 15,
      visible: modifierStackWhen('origin', 'centre'),
    },
    {
      key: 'radiusOffset',
      label: 'Radius offset',
      type: 'number',
      default: 0,
      step: 0.25,
      hint: 'Pushes copies away from the axis, in metres.',
      visible: modifierStackWhen('origin', 'centre'),
    },
    { key: 'rotateCopies', label: 'Rotate copies', type: 'boolean', default: true },
    {
      ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
      label: 'Centre from',
      hint: 'Where the radius offset and unrotated copies are measured from: the whole input or each piece.',
    },
    ...modifierStackVectorFields('pivot', 'Pivot', [0, 0, 0], {
      group: 'Pivot',
      visible: modifierStackWhen('origin', 'centre'),
    }),
  ];

  /**
   * Normalizes parameters; stacks saved before the ring placement existed keep
   * rotating around their pivot.
   *
   * @param input Stored parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const legacy = !('origin' in input) && MODIFIER_STACK_RADIAL_LEGACY_KEYS.some((key) => key in input);
    return super.normalizeParameters(legacy ? { ...input, origin: 'centre' } : input);
  }

  /**
   * Rotates copy N about the pivot.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Rotation, or a pure translation when copies keep their facing.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): Matrix4 {
    const axis = modifierStackAxis(placement.parameters['axis']);
    const result = this.ringTransform(index, placement, axis);
    if (placement.parameters['rotateCopies'] !== false) return result;
    const center = placement.bounds.isEmpty() ? new Vector3() : placement.bounds.getCenter(new Vector3());
    const delta = center.clone().applyMatrix4(result).sub(center);
    return new Matrix4().makeTranslation(delta.x, delta.y, delta.z);
  }

  /**
   * Returns the rotation of copy N about the ring centre: one ring through the
   * original, or the pivot with the outward shift of older volumes.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @param axis Rotation axis.
   * @returns Copy transform.
   */
  private ringTransform(index: number, placement: ModifierStackArrayPlacement, axis: Vector3): Matrix4 {
    const rotation = new Matrix4().makeRotationAxis(axis, this.angleOf(index, placement));
    if (placement.parameters['origin'] === 'ring')
      return modifierStackAroundPivot(rotation, this.ringCentre(placement, axis));
    const pivot = modifierStackVector(placement.parameters, 'pivot');
    const offset = this.radiusOffsetOf(placement, pivot, axis);
    return modifierStackAroundPivot(rotation, pivot).multiply(
      new Matrix4().makeTranslation(offset.x, offset.y, offset.z),
    );
  }

  /**
   * Returns the centre of a ring through the original: the radius away from the
   * input centre, toward the chosen side across the axis.
   *
   * @param placement Shared placement data.
   * @param axis Rotation axis.
   * @returns Ring centre.
   */
  private ringCentre(placement: ModifierStackArrayPlacement, axis: Vector3): Vector3 {
    const center = placement.bounds.isEmpty() ? new Vector3() : placement.bounds.getCenter(new Vector3());
    const side = modifierStackRadialSide(placement.parameters['centreSide']);
    side.addScaledVector(axis, -side.dot(axis));
    if (side.lengthSq() < 1e-12) side.copy(axis.z === 1 ? new Vector3(0, -1, 0) : new Vector3(0, 0, -1));
    return center.addScaledVector(side.normalize(), Number(placement.parameters['radius']));
  }

  /**
   * Returns the angle of one copy without repeating the ring's first copy.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Angle in radians.
   */
  private angleOf(index: number, placement: ModifierStackArrayPlacement): number {
    const parameters = placement.parameters;
    const mode = parameters['mode'];
    let step = 360 / placement.count;
    if (mode === 'step') step = Number(parameters['step']);
    if (mode === 'arc') step = Number(parameters['sweep']) / Math.max(1, placement.count - 1);
    const start = parameters['origin'] === 'ring' ? 0 : Number(parameters['start']);
    return ((start + index * step) * Math.PI) / 180;
  }

  /**
   * Returns the outward shift applied before rotation.
   *
   * @param placement Shared placement data.
   * @param pivot Pivot point.
   * @param axis Rotation axis.
   * @returns Shift vector.
   */
  private radiusOffsetOf(placement: ModifierStackArrayPlacement, pivot: Vector3, axis: Vector3): Vector3 {
    const center = placement.bounds.isEmpty() ? pivot.clone() : placement.bounds.getCenter(new Vector3());
    const radial = center.sub(pivot);
    radial.addScaledVector(axis, -radial.dot(axis));
    if (radial.lengthSq() < 1e-12) radial.copy(axis.y === 1 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
    return radial.normalize().multiplyScalar(Number(placement.parameters['radiusOffset']));
  }
}
