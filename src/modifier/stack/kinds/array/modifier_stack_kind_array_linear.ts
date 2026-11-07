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
import { modifierStackVector } from './modifier_stack_array_math.js';

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
      default: 'relative',
      choices: modifierStackChoices([
        ['fixed', 'Fixed step'],
        ['relative', 'Relative to size'],
        ['fit', 'Fit distance'],
      ]),
    },
    ...modifierStackVectorFields('offset', 'Step', [2, 0, 0], {
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'fixed'),
    }),
    { ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD, group: 'Spacing', visible: modifierStackWhen('mode', 'relative') },
    ...modifierStackVectorFields('relative', 'Size ×', [1, 0, 0], {
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'relative'),
    }),
    ...modifierStackVectorFields('endpoint', 'Distance', [8, 0, 0], {
      group: 'Spacing',
      visible: modifierStackWhen('mode', 'fit'),
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
    if (mode === 'relative') {
      const size = placement.bounds.isEmpty() ? new Vector3() : placement.bounds.getSize(new Vector3());
      return modifierStackVector(placement.parameters, 'relative').multiply(size);
    }
    if (mode === 'fit')
      return modifierStackVector(placement.parameters, 'endpoint').divideScalar(Math.max(1, placement.count - 1));
    return modifierStackVector(placement.parameters, 'offset');
  }
}
