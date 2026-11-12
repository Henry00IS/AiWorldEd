import { describe, expect, it, vi } from 'vitest';
import { InputSelect } from '@/ui/input/input_select.js';

/** Native groups preserve selection, mixed values and normal change events. */
describe('grouped select input', () => {
  it('uses optgroups without changing the stored values or commit behavior', () => {
    const control = new InputSelect(
      [
        { value: 'a', label: 'First', group: 'Furniture' },
        { value: 'b', label: 'Second', group: 'Furniture' },
        { value: 'c', label: 'Third', group: 'Columns' },
      ],
      'Presets',
    );
    const element = control.getElement();
    expect([...element.querySelectorAll('optgroup')].map((group) => [group.label, group.children.length])).toEqual([
      ['Furniture', 2],
      ['Columns', 1],
    ]);
    control.setSharedValues(['b']);
    expect(control.getValue()).toBe('b');
    const commit = vi.fn();
    control.bindCommit(commit);
    element.value = 'c';
    element.dispatchEvent(new Event('change'));
    expect(commit).toHaveBeenCalledOnce();
    expect(element.title).toBe('Third');
    control.setSharedValues(['a', 'b']);
    expect(control.getValue()).toBe('');
    control.setChoices([{ value: 'd', label: 'Replacement', group: 'Other' }]);
    expect(element.querySelectorAll('optgroup')).toHaveLength(1);
  });
});
