import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';

/**
 * Builds a widget field that shows the parameter it was last written with.
 *
 * @param targets Receives the target factory the widget gets.
 * @returns Widget field.
 */
function widgetRowTestField(
  targets: ((status: (text: string) => void) => ModifierStackActionTarget | null)[],
): ModifierStackField {
  return {
    key: 'file',
    label: 'File',
    type: 'widget',
    default: '',
    hint: 'A custom row.',
    widget: (targetOf) => {
      targets.push(targetOf);
      const element = document.createElement('div');
      return { element, write: (parameters) => (element.textContent = String(parameters['name'])) };
    },
  };
}

describe('modifier stack widget rows', () => {
  it('store nothing in the parameters', () => {
    expect(modifierStackFieldsNormalize([widgetRowTestField([])], { file: 'anything' })).toEqual({});
  });

  it('show the custom row, write it with all parameters and give it the target of the step', () => {
    const targets: ((status: (text: string) => void) => ModifierStackActionTarget | null)[] = [];
    const volume = new THREE.Object3D();
    const rows = new ModifierStackFieldRows(
      [widgetRowTestField(targets)],
      () => undefined,
      () => [],
      {},
      (status) => ({ volume, stepId: 'step', commandStack: null, status }),
    );
    rows.update({ name: 'Arch' });
    expect(rows.getElement().textContent).toBe('Arch');
    expect(targets[0]?.(() => undefined)?.stepId).toBe('step');
  });
});
