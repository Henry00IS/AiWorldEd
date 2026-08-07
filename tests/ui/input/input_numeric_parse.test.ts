import { describe, expect, it } from 'vitest';
import {
  INPUT_NUMERIC_MIXED_VALUE_DISPLAY,
  inputNumericAreAllNumberSkips,
  inputNumericEvaluateNumberExpression,
  inputNumericFormatDisplayValue,
  inputNumericFormatSharedValues,
  inputNumericHasInvalidNumber,
  inputNumericNumberOrNull,
  inputNumericParseOptionalNumber,
} from '@/ui/input/input_numeric_parse.js';

describe('inputNumericParseOptionalNumber', () => {
  it('parses plain numbers through the shared math evaluator', () => {
    expect(inputNumericParseOptionalNumber(' 12.5 ')).toEqual({ kind: 'value', value: 12.5 });
  });

  it('evaluates arithmetic expressions like Unity inspector fields', () => {
    expect(inputNumericParseOptionalNumber('5+5')).toEqual({ kind: 'value', value: 10 });
    expect(inputNumericParseOptionalNumber('-(4+2)/2')).toEqual({ kind: 'value', value: -3 });
  });

  it('skips empty, incomplete minus, and mixed placeholders', () => {
    expect(inputNumericParseOptionalNumber('')).toEqual({ kind: 'skip' });
    expect(inputNumericParseOptionalNumber('   ')).toEqual({ kind: 'skip' });
    expect(inputNumericParseOptionalNumber('-')).toEqual({ kind: 'skip' });
    expect(inputNumericParseOptionalNumber(INPUT_NUMERIC_MIXED_VALUE_DISPLAY)).toEqual({ kind: 'skip' });
  });

  it('marks illegal text and failed math as invalid', () => {
    expect(inputNumericParseOptionalNumber('not-a-number').kind).toBe('invalid');
    expect(inputNumericParseOptionalNumber('alert(1)').kind).toBe('invalid');
    expect(inputNumericParseOptionalNumber('1/0').kind).toBe('invalid');
  });
});

describe('inputNumeric display helpers', () => {
  it('formats mixed nulls and shared multi-select values', () => {
    expect(inputNumericFormatDisplayValue(null, 2)).toBe(INPUT_NUMERIC_MIXED_VALUE_DISPLAY);
    expect(inputNumericFormatDisplayValue(1.5, 2)).toBe('1.50');
    expect(inputNumericFormatSharedValues([2, 2, 2], 1)).toBe('2.0');
    expect(inputNumericFormatSharedValues([2, 3], 1)).toBe(INPUT_NUMERIC_MIXED_VALUE_DISPLAY);
  });

  it('keeps the minimum decimals and reveals up to five when needed', () => {
    expect(inputNumericFormatDisplayValue(0.5, 2)).toBe('0.50');
    expect(inputNumericFormatDisplayValue(1, 2)).toBe('1.00');
    expect(inputNumericFormatDisplayValue(0.03125, 2)).toBe('0.03125');
    expect(inputNumericFormatDisplayValue(0.0625, 2)).toBe('0.0625');
    expect(inputNumericFormatDisplayValue(0.125, 2)).toBe('0.125');
    expect(inputNumericFormatDisplayValue(1.23456, 2)).toBe('1.23456');
    expect(inputNumericFormatSharedValues([0.03125, 0.03125], 2)).toBe('0.03125');
  });

  it('detects invalid results and all-skip groups', () => {
    const valid = inputNumericEvaluateNumberExpression('2*3');
    const invalid = inputNumericParseOptionalNumber('xyz');
    const skip = inputNumericParseOptionalNumber('');
    expect(inputNumericHasInvalidNumber(valid, invalid, skip)).toBe(true);
    expect(inputNumericAreAllNumberSkips(skip, skip)).toBe(true);
    expect(inputNumericNumberOrNull(valid)).toBe(6);
    expect(inputNumericNumberOrNull(skip)).toBeNull();
  });
});
