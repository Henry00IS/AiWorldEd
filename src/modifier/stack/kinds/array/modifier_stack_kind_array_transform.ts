import { Matrix4 } from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackVectorFields } from '@/modifier/stack/modifier_stack_fields.js';
import {
  MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
  ModifierStackKindArray,
  type ModifierStackArrayPlacement,
} from './modifier_stack_kind_array.js';
import { modifierStackRelativeStep, modifierStackRigidStep, modifierStackVector } from './modifier_stack_array_math.js';

/** Repeats one rigid step: spirals, fans, tilted runs and rising columns. */
export class ModifierStackKindArrayTransform extends ModifierStackKindArray {
  readonly id = 'transform';
  readonly label = 'Transform Array';
  readonly description = 'Applies the same move and turn again for every copy, building spirals, fans and rising runs.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    ...modifierStackVectorFields('offset', 'Move', [0, 0.25, 0], { group: 'Per copy' }),
    ...modifierStackVectorFields('relative', 'Size ×', [0, 0, 0], {
      group: 'Per copy',
      step: 0.1,
      hint: 'Adds this multiple of the input size to every move, like relative offset.',
    }),
    {
      ...MODIFIER_STACK_ARRAY_BOUNDS_FIELD,
      group: 'Per copy',
      visible: (parameters) => modifierStackVector(parameters, 'relative').lengthSq() > 1e-12,
    },
    ...modifierStackVectorFields('rotation', 'Turn °', [0, 15, 0], { group: 'Per copy', step: 5 }),
    ...modifierStackVectorFields('pivot', 'Pivot', [0, 0, 0], {
      group: 'Pivot',
      visible: (parameters) => modifierStackVector(parameters, 'rotation').lengthSq() > 1e-12,
    }),
  ];

  /**
   * Returns the step applied index times.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Matrix power of the rigid step.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): Matrix4 {
    const parameters = placement.parameters;
    const step = modifierStackRigidStep(
      modifierStackVector(parameters, 'offset').add(modifierStackRelativeStep(placement)),
      modifierStackVector(parameters, 'rotation'),
      modifierStackVector(parameters, 'pivot'),
    );
    const result = new Matrix4();
    for (let iteration = 0; iteration < index; iteration++) result.multiply(step);
    return result;
  }
}
