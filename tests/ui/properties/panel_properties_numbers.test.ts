import { describe, expect, it } from 'vitest';
import {
  panelPropertiesAreAllNumberSkips,
  panelPropertiesEvaluateNumberExpression,
  panelPropertiesHasInvalidNumber,
  panelPropertiesNumberOrNull,
  panelPropertiesParseOptionalNumber,
  panelPropertiesResolveAxisNumbers,
} from '@/ui/properties/panel_properties_numbers.js';

describe('panelPropertiesParseOptionalNumber', () => {
  it('parses plain numbers through the shared math evaluator', () => {
    const result = panelPropertiesParseOptionalNumber(' 12.5 ');
    expect(result).toEqual({ kind: 'value', value: 12.5 });
  });

  it('evaluates arithmetic expressions typed into number fields', () => {
    const result = panelPropertiesParseOptionalNumber('5+5');
    expect(result).toEqual({ kind: 'value', value: 10 });
  });

  it('evaluates nested expressions with unary minus', () => {
    const result = panelPropertiesParseOptionalNumber('-(4+2)/2');
    expect(result).toEqual({ kind: 'value', value: -3 });
  });

  it('skips empty and mixed-value placeholders without writing axes', () => {
    expect(panelPropertiesParseOptionalNumber('')).toEqual({ kind: 'skip' });
    expect(panelPropertiesParseOptionalNumber('   ')).toEqual({ kind: 'skip' });
    expect(panelPropertiesParseOptionalNumber('—')).toEqual({ kind: 'skip' });
  });

  it('marks illegal text and failed math as invalid', () => {
    expect(panelPropertiesParseOptionalNumber('not-a-number').kind).toBe('invalid');
    expect(panelPropertiesParseOptionalNumber('alert(1)').kind).toBe('invalid');
    expect(panelPropertiesParseOptionalNumber('1/0').kind).toBe('invalid');
    expect(panelPropertiesParseOptionalNumber('10abc').kind).toBe('invalid');
  });
});

describe('panelPropertiesResolveAxisNumbers', () => {
  it('returns values when any axis has a valid number or expression', () => {
    const resolved = panelPropertiesResolveAxisNumbers('1+1', '', '—');
    expect(resolved).toEqual({
      kind: 'values',
      axes: { x: 2, y: null, z: null },
    });
  });

  it('returns invalid when any axis fails math parsing', () => {
    const resolved = panelPropertiesResolveAxisNumbers('3', 'nope', '1');
    expect(resolved).toEqual({ kind: 'invalid' });
  });

  it('returns skip_all when every axis is empty or mixed', () => {
    const resolved = panelPropertiesResolveAxisNumbers('', '—', '  ');
    expect(resolved).toEqual({ kind: 'skip_all' });
  });
});

describe('panelProperties number parse helpers', () => {
  it('detects invalid results and all-skip groups', () => {
    const valid = panelPropertiesEvaluateNumberExpression('2*3');
    const invalid = panelPropertiesParseOptionalNumber('xyz');
    const skip = panelPropertiesParseOptionalNumber('');
    expect(panelPropertiesHasInvalidNumber(valid, invalid, skip)).toBe(true);
    expect(panelPropertiesAreAllNumberSkips(skip, skip)).toBe(true);
    expect(panelPropertiesNumberOrNull(valid)).toBe(6);
    expect(panelPropertiesNumberOrNull(skip)).toBeNull();
  });
});
