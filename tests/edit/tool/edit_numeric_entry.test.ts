import { describe, expect, it } from 'vitest';
import { EditNumericEntry } from '@/edit/tool/edit_numeric_entry.js';

describe('EditNumericEntry', () => {
  it('builds a signed decimal from keys and overrides the pointer value', () => {
    const entry = new EditNumericEntry();
    for (const key of ['Minus', 'Digit1', 'Period', 'Numpad2', 'Digit5']) expect(entry.handleKey(key)).toBe(true);
    expect(entry.readText()).toBe('-1.25');
    expect(entry.resolve(7)).toBeCloseTo(-1.25, 9);
    entry.handleKey('Backspace');
    expect(entry.resolve(7)).toBeCloseTo(-1.2, 9);
  });

  it('passes the pointer value through until something is typed and flips it with a lone minus', () => {
    const entry = new EditNumericEntry();
    const pointer = Math.random() + 0.5;
    expect(entry.resolve(pointer)).toBe(pointer);
    expect(entry.handleKey('KeyQ')).toBe(false);
    entry.handleKey('Minus');
    expect(entry.resolve(pointer)).toBe(-pointer);
  });
});
