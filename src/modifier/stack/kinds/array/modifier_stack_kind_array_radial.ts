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
 * Returns the unit direction of a ring centre side such as Back.
 *
 * @param side Stored side.
 * @returns Direction in the array frame.
 */
function modifierStackRadialSide(side: unknown): Vector3 {
  if (side === 'Right') return new Vector3(1, 0, 0);
  if (side === 'Left') return new Vector3(-1, 0, 0);
  if (side === 'Up') return new Vector3(0, 1, 0);
  if (side === 'Down') return new Vector3(0, -1, 0);
  if (side === 'Front') return new Vector3(0, 0, 1);
  return new Vector3(0, 0, -1);
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
      default: 'On The Ring',
      choices: modifierStackChoices([
        ['On The Ring', 'On The Ring'],
        ['Around Pivot', 'Around Pivot'],
      ]),
      hint: 'On the ring keeps the original in place as the first ring item. Around pivot rotates copies about the pivot (older volumes).',
    },
    {
      key: 'mode',
      label: 'Distribution',
      hint: 'Full ring spreads the copies evenly around 360°, Arc spreads them over the sweep angle, Angle step turns each copy by a fixed angle.',
      type: 'choice',
      default: 'Full Ring',
      choices: modifierStackChoices([
        ['Full Ring', 'Full Ring'],
        ['Arc', 'Arc'],
        ['Angle Step', 'Angle Step'],
      ]),
    },
    {
      key: 'axis',
      label: 'Axis',
      hint: "Axis the copies turn around, in the volume's local space.",
      type: 'choice',
      default: 'Y',
      choices: modifierStackChoices([
        ['X', 'X'],
        ['Y', 'Y'],
        ['Z', 'Z'],
      ]),
    },
    {
      key: 'sweep',
      label: 'Sweep °',
      hint: 'Angle in degrees the copies are spread over; negative turns the other way.',
      type: 'number',
      default: 90,
      min: -360,
      max: 360,
      step: 15,
      visible: modifierStackWhen('mode', 'Arc'),
    },
    {
      key: 'step',
      label: 'Step °',
      hint: 'Angle in degrees between neighbouring copies; negative turns the other way.',
      type: 'number',
      default: 15,
      min: -360,
      max: 360,
      step: 5.625,
      visible: modifierStackWhen('mode', 'Angle Step'),
    },
    {
      key: 'radius',
      label: 'Radius',
      type: 'number',
      default: 2,
      min: 0,
      step: 0.25,
      hint: 'Distance from the original to the ring center, in metres.',
      visible: modifierStackWhen('origin', 'On The Ring'),
    },
    {
      key: 'centreSide',
      label: 'Ring Center',
      type: 'choice',
      default: 'Back',
      choices: modifierStackChoices([
        ['Back', 'Back'],
        ['Front', 'Front'],
        ['Left', 'Left'],
        ['Right', 'Right'],
        ['Down', 'Down'],
        ['Up', 'Up'],
      ]),
      hint: 'Side of the original the ring center lies on. A side along the axis uses the next one across it.',
      visible: modifierStackWhen('origin', 'On The Ring'),
    },
    {
      key: 'start',
      label: 'Start °',
      hint: 'Angle in degrees the first copy starts at around the pivot.',
      type: 'number',
      default: 0,
      min: -3600,
      max: 3600,
      step: 15,
      visible: modifierStackWhen('origin', 'Around Pivot'),
    },
    {
      key: 'radiusOffset',
      label: 'Radius Offset',
      type: 'number',
      default: 0,
      step: 0.25,
      hint: 'Pushes copies away from the axis, in metres.',
      visible: modifierStackWhen('origin', 'Around Pivot'),
    },
    {
      key: 'rise',
      label: 'Rise per Step',
      type: 'number',
      default: 0,
      step: 0.25,
      hint: 'Moves each copy this far along the axis, building spirals and helical stairs, like a screw offset.',
    },
    {
      key: 'rotateCopies',
      label: 'Rotate Copies',
      type: 'boolean',
      default: true,
      hint: 'On turns each copy to face along the ring; off only moves the copies and keeps their original orientation.',
    },
    {
      ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
      label: 'Center From',
      hint: 'Where the radius offset and unrotated copies are measured from: the whole input or each piece.',
    },
    ...modifierStackVectorFields('pivot', 'Pivot', [0, 0, 0], {
      hint: 'Point the copies turn around, in metres from the volume center along this axis.',
      group: 'Pivot',
      visible: modifierStackWhen('origin', 'Around Pivot'),
    }),
  ];

  /**
   * Normalizes parameters; stacks saved before the ring placement existed keep
   * rotating around their pivot.
   *
   * @param input Stored parameters.
   * @returns Normalized parameters.
   */
  protected override normalizeCurrent(input: Record<string, unknown>): Record<string, unknown> {
    const legacy = !('origin' in input) && MODIFIER_STACK_RADIAL_LEGACY_KEYS.some((key) => key in input);
    return super.normalizeCurrent(legacy ? { ...input, origin: 'Around Pivot' } : input);
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
    const rise = axis.clone().multiplyScalar(Number(placement.parameters['rise'] ?? 0) * index);
    return new Matrix4().makeTranslation(rise.x, rise.y, rise.z).multiply(this.turnTransform(index, placement, axis));
  }

  /**
   * Returns the turn of one copy, rotated or only moved to its ring place.
   *
   * @param index Copy index.
   * @param placement Shared placement.
   * @param axis Unit rotation axis.
   * @returns Transform without the rise.
   */
  private turnTransform(index: number, placement: ModifierStackArrayPlacement, axis: Vector3): Matrix4 {
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
    if (placement.parameters['origin'] === 'On The Ring')
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
    if (mode === 'Angle Step') step = Number(parameters['step']);
    if (mode === 'Arc') step = Number(parameters['sweep']) / Math.max(1, placement.count - 1);
    const start = parameters['origin'] === 'On The Ring' ? 0 : Number(parameters['start']);
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
