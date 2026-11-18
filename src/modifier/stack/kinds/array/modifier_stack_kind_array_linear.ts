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
import { modifierStackRelativeStep, modifierStackVector } from './modifier_stack_array_math.js';

/** Repeats the working set along a straight line. */
export class ModifierStackKindArrayLinear extends ModifierStackKindArray {
  readonly id = 'linear';
  readonly label = 'Linear Array';
  readonly description =
    'Repeats the input along a line with a fixed step, a multiple of its size, or to fit a distance.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'mode',
      label: 'Spacing',
      type: 'choice',
      default: 'Relative To Size',
      choices: modifierStackChoices([
        ['Fixed Step', 'Fixed Step'],
        ['Relative To Size', 'Relative To Size'],
        ['Fit Distance', 'Fit Distance'],
        ['Size × Plus Step', 'Size × Plus Step'],
      ]),
      hint: 'Size × plus step adds a multiple of the input size and a fixed step, like enabling both relative and constant offset.',
    },
    ...modifierStackVectorFields('offset', 'Step', [2, 0, 0], {
      hint: 'Fixed distance in metres from one copy to the next along this axis.',
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'Fixed Step', 'Size × Plus Step'),
    }),
    {
      ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'Relative To Size', 'Size × Plus Step'),
    },
    ...modifierStackVectorFields('relative', 'Size ×', [1, 0, 0], {
      hint: 'Step as a multiple of the input size along this axis: 1 places copies edge to edge.',
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'Relative To Size', 'Size × Plus Step'),
    }),
    ...modifierStackVectorFields('endpoint', 'Distance', [8, 0, 0], {
      hint: 'Distance in metres from the original to the last copy; the copies are spread evenly in between.',
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'Fit Distance'),
    }),
  ];

  /**
   * Translates copy N by N steps.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Translation.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): Matrix4 {
    const step = this.stepOf(placement);
    step.multiplyScalar(index);
    return new Matrix4().makeTranslation(step.x, step.y, step.z);
  }

  /**
   * Resolves the step for the chosen spacing mode.
   *
   * @param placement Shared placement data.
   * @returns Step vector in placement coordinates.
   */
  private stepOf(placement: ModifierStackArrayPlacement): Vector3 {
    const mode = placement.parameters['mode'];
    if (mode === 'Relative To Size') return modifierStackRelativeStep(placement);
    if (mode === 'Fit Distance')
      return modifierStackVector(placement.parameters, 'endpoint').divideScalar(Math.max(1, placement.count - 1));
    const constant = modifierStackVector(placement.parameters, 'offset');
    return mode === 'Size × Plus Step' ? constant.add(modifierStackRelativeStep(placement)) : constant;
  }
}
