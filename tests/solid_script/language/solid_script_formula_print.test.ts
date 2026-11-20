import { describe, expect, it } from 'vitest';
import {
  solidScriptFormulaJoin,
  solidScriptFormulaOperandNeed,
  solidScriptFormulaOperatorLevel,
  solidScriptFormulaWrap,
} from '@/solid_script/language/solid_script_formula_print.js';

describe('SolidScript formula print', () => {
  it('ranks operators loosest first', () => {
    const order = ['||', '&&', '==', '<', '+', '*', '^'].map(solidScriptFormulaOperatorLevel);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(solidScriptFormulaOperatorLevel('!=')).toBe(solidScriptFormulaOperatorLevel('=='));
  });

  it('adds parentheses only where a part would come apart', () => {
    expect(solidScriptFormulaWrap('[a] || [b]', 2)).toBe('([a] || [b])');
    expect(solidScriptFormulaWrap('[a] && [b]', 2)).toBe('[a] && [b]');
    expect(solidScriptFormulaWrap('  (1 + 2)  ', 9)).toBe('(1 + 2)');
    expect(solidScriptFormulaWrap('1 ? 2 : 3', 1)).toBe('(1 ? 2 : 3)');
    expect(solidScriptFormulaWrap('[a] // note', 2)).toBe('[a] // note\n');
  });

  it('keeps the side an operator does not group on in parentheses', () => {
    expect(solidScriptFormulaJoin('-', ['[a]', '[b] - [c]'])).toBe('[a] - ([b] - [c])');
    expect(solidScriptFormulaJoin('-', ['[a] - [b]', '[c]'])).toBe('[a] - [b] - [c]');
    expect(solidScriptFormulaJoin('^', ['2 ^ 3', '2'])).toBe('(2 ^ 3) ^ 2');
    expect(solidScriptFormulaJoin('^', ['2', '3 ^ 2'])).toBe('2 ^ 3 ^ 2');
    expect(solidScriptFormulaJoin('&&', ['[a] || [b]'])).toBe('[a] || [b]');
    expect(solidScriptFormulaOperandNeed('&&', 1, 0)).toBe(0);
  });
});
