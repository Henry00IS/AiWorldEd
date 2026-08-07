import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputNumeric } from '@/ui/input/input_numeric.js';
import { INPUT_NUMERIC_MIXED_VALUE_DISPLAY } from '@/ui/input/input_numeric_parse.js';

describe('InputNumeric', () => {
  const fields: InputNumeric[] = [];

  afterEach(() => {
    for (const field of fields) {
      field.dispose();
    }
    fields.length = 0;
  });

  /**
   * Creates a tracked numeric field for the test.
   *
   * @returns Field under test.
   */
  function createField(): InputNumeric {
    const field = new InputNumeric({ width: '48px', textAlign: 'right' });
    fields.push(field);
    return field;
  }

  it('writes mixed dash and shared numbers', () => {
    const field = createField();
    field.setNumber(null, 2);
    expect(field.getText()).toBe(INPUT_NUMERIC_MIXED_VALUE_DISPLAY);
    field.setNumber(1.25, 2);
    expect(field.getText()).toBe('1.25');
    field.setSharedValues([3, 3], 1);
    expect(field.getText()).toBe('3.0');
  });

  it('shows fine precision up to five decimals while keeping the minimum', () => {
    const field = createField();
    field.setNumber(0.5, 2);
    expect(field.getText()).toBe('0.50');
    field.setNumber(0.03125, 2);
    expect(field.getText()).toBe('0.03125');
    field.setSharedValues([0.0625, 0.0625], 2);
    expect(field.getText()).toBe('0.0625');
  });

  it('parses arithmetic expressions on commit', () => {
    const field = createField();
    const onCommit = vi.fn();
    field.bindCommit(onCommit);
    field.setText('2+3');
    field.getElement().dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(field.parseNumberOrNull()).toBe(5);
  });

  it('clears mixed dash on focus so typing replaces it', () => {
    const field = createField();
    field.setNumber(null, 2);
    field.getElement().dispatchEvent(new Event('focus'));
    expect(field.getText()).toBe('');
  });

  it('blurs on Enter so change commits once', () => {
    const field = createField();
    const onCommit = vi.fn();
    field.bindCommit(onCommit);
    const element = field.getElement();
    document.body.appendChild(element);
    element.focus();
    field.setText('4*2');
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    element.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(field.parseNumberOrNull()).toBe(8);
    element.remove();
  });
});
