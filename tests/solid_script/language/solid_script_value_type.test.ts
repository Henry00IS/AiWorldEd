import { describe, expect, it } from 'vitest';
import { solidScriptValueNumber, solidScriptValueType } from '@/solid_script/language/solid_script_value.js';

describe('SolidScript friendly types', () => {
  it('names every kind of value in plain words', () => {
    expect(solidScriptValueType(2)).toBe('Whole Number');
    expect(solidScriptValueType(0.5)).toBe('Number');
    expect(solidScriptValueType('3')).toBe('Whole Number');
    expect(solidScriptValueType('wide')).toBe('Text');
    expect(solidScriptValueType(true)).toBe('Yes/No');
    expect(solidScriptValueType([1, 2, 3])).toBe('Vector');
    expect(solidScriptValueType([1, 2, 3, 4])).toBe('List of Numbers');
    expect(solidScriptValueType(['a', 'b'])).toBe('List of Text');
    expect(
      solidScriptValueType([
        [0, 0],
        [1, 0],
      ]),
    ).toBe('List of Vectors');
    expect(solidScriptValueType([])).toBe('List');
    expect(solidScriptValueType(undefined)).toBe('Nothing');
  });

  it('reads text that spells a number as the number', () => {
    expect(solidScriptValueNumber(' 2.5 ')).toBe(2.5);
    expect(solidScriptValueNumber('two')).toBeUndefined();
    expect(solidScriptValueNumber('')).toBeUndefined();
  });
});
