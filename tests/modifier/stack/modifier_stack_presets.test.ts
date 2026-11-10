import { describe, expect, it } from 'vitest';
import {
  modifierStackPresetApply,
  modifierStackPresetKeys,
  modifierStackPresetMatch,
  type ModifierStackPresetOwner,
} from '@/modifier/stack/modifier_stack_presets.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';

const fields: ModifierStackField[] = [
  { key: 'width', label: 'Width', type: 'number', default: 1 },
  { key: 'depth', label: 'Depth', type: 'number', default: 2 },
  {
    key: 'colour',
    label: 'Colour',
    type: 'choice',
    default: 'red',
    choices: [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ],
  },
];

const owner: ModifierStackPresetOwner = {
  fields,
  presets: [
    { id: 'wide', label: 'Wide', tooltip: 'Wide.', parameters: { width: 5 } },
    { id: 'deep', label: 'Deep', tooltip: 'Deep.', parameters: { depth: 7 } },
  ],
  normalizeParameters: (input) => modifierStackFieldsNormalize(fields, input),
};

describe('modifier stack presets', () => {
  it('collects the keys any preset sets', () => {
    expect(modifierStackPresetKeys(owner.presets)).toEqual(['width', 'depth']);
  });

  it('resets keys other presets set and keeps unrelated parameters', () => {
    const wide = owner.presets[0];
    if (!wide) throw new Error('Missing preset');
    expect(modifierStackPresetApply(owner, { width: 3, depth: 9, colour: 'blue' }, wide)).toEqual({
      width: 5,
      depth: 2,
      colour: 'blue',
    });
  });

  it('names the preset the parameters still match, and none once edited', () => {
    expect(modifierStackPresetMatch(owner, { width: 1, depth: 7, colour: 'blue' })).toBe('deep');
    expect(modifierStackPresetMatch(owner, { width: 2, depth: 7 })).toBe('');
  });
});
