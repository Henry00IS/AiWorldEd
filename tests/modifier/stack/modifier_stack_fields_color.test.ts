import { describe, expect, it } from 'vitest';
import { modifierStackFieldValue } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';

const COLOR: ModifierStackField = { key: 'color', label: 'Color', type: 'color', default: '#ffffff' };

describe('modifier stack color fields', () => {
  it('keeps hex colors in lowercase and falls back for anything else', () => {
    expect(modifierStackFieldValue(COLOR, '#FF8000')).toBe('#ff8000');
    expect(modifierStackFieldValue(COLOR, 'red')).toBe('#ffffff');
    expect(modifierStackFieldValue(COLOR, '#fff')).toBe('#ffffff');
    expect(modifierStackFieldValue(COLOR, 0xff0000)).toBe('#ffffff');
  });

  it('shows a color picker that commits its value once', () => {
    const commits: [string, ModifierStackValue][] = [];
    const rows = new ModifierStackFieldRows([COLOR], (key, value) => commits.push([key, value]));
    rows.update({ color: '#336699' });
    const input = rows.getElement().querySelector('input[type="color"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('missing color input');
    expect(input.value).toBe('#336699');
    expect(input.getAttribute('aria-label')).toBe('Color');
    input.value = '#aabbcc';
    input.dispatchEvent(new Event('input'));
    expect(commits).toEqual([]);
    input.dispatchEvent(new Event('change'));
    expect(commits).toEqual([['color', '#aabbcc']]);
  });
});
