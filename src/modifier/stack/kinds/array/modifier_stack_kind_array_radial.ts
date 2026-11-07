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

/** Repeats the working set around an axis: rings, arcs, or fixed angle steps. */
export class ModifierStackKindArrayRadial extends ModifierStackKindArray {
  readonly id = 'radial';
  readonly label = 'Radial Array';
  readonly description = 'Repeats the input around an axis for columns, colonnades, wedge floors and curved corridors.';
  protected readonly specificFields: readonly ModifierStackField[] = [
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
    { key: 'start', label: 'Start °', type: 'number', default: 0, min: -3600, max: 3600, step: 15 },
    {
      key: 'radiusOffset',
      label: 'Radius offset',
      type: 'number',
      default: 0,
      step: 0.25,
      hint: 'Pushes copies away from the axis, in metres.',
    },
    { key: 'rotateCopies', label: 'Rotate copies', type: 'boolean', default: true },
    {
      ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
      label: 'Centre from',
      hint: 'Where the radius offset and unrotated copies are measured from: the whole input or each piece.',
    },
    ...modifierStackVectorFields('pivot', 'Pivot', [0, 0, 0], { group: 'Pivot' }),
  ];

  /**
   * Rotates copy N about the pivot.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Rotation, or a pure translation when copies keep their facing.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): Matrix4 {
    const parameters = placement.parameters;
    const pivot = modifierStackVector(parameters, 'pivot');
    const axis = modifierStackAxis(parameters['axis']);
    const rotation = new Matrix4().makeRotationAxis(axis, this.angleOf(index, placement));
    const offset = this.radiusOffsetOf(placement, pivot, axis);
    const result = modifierStackAroundPivot(rotation, pivot).multiply(
      new Matrix4().makeTranslation(offset.x, offset.y, offset.z),
    );
    if (parameters['rotateCopies'] !== false) return result;
    const center = placement.bounds.isEmpty() ? new Vector3() : placement.bounds.getCenter(new Vector3());
    const delta = center.clone().applyMatrix4(result).sub(center);
    return new Matrix4().makeTranslation(delta.x, delta.y, delta.z);
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
    return ((Number(parameters['start']) + index * step) * Math.PI) / 180;
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
