import { describe, expect, it } from 'vitest';
import {
  solidScriptFormulaBody,
  solidScriptFormulaBodyOr,
  solidScriptFormulaShown,
  solidScriptFormulaStore,
  solidScriptFormulaTyped,
  solidScriptFormulaUnwrap,
} from '@/solid_script/language/solid_script_formula_field.js';

describe('SolidScript formula field', () => {
  it('finds the formula of a field that is one [=formula]', () => {
    expect(solidScriptFormulaUnwrap('[=[a] + 1]')).toBe('[a] + 1');
    expect(solidScriptFormulaUnwrap('  [= 2 ]  ')).toBe(' 2 ');
    expect(solidScriptFormulaUnwrap('[a]')).toBeNull();
    expect(solidScriptFormulaUnwrap('x [=1]')).toBeNull();
  });

  it('opens a condition as it is and a value field only when it holds one formula', () => {
    expect(solidScriptFormulaBody('condition', '[a] > 1')).toBe('[a] > 1');
    expect(solidScriptFormulaBody('value', '[=[a] > 1]')).toBe('[a] > 1');
    expect(solidScriptFormulaBody('value', '')).toBe('');
    expect(solidScriptFormulaBody('value', '2')).toBe('2');
    expect(solidScriptFormulaBody('value', '[w]')).toBe('[w]');
    expect(() => solidScriptFormulaBody('value', 'Top and Side')).toThrow(/plain text/);
    expect(solidScriptFormulaBodyOr('value', 'Top and Side')).toBeNull();
  });

  it('stores a formula wrapped once, and an unchanged one exactly as it was', () => {
    expect(solidScriptFormulaStore('value', '[a] + 1', '')).toBe('[=[a] + 1]');
    expect(solidScriptFormulaStore('value', '[=[a] + 1]', '')).toBe('[=[a] + 1]');
    expect(solidScriptFormulaStore('value', ' [a] + 1 ', '[= [a] + 1 ]')).toBe('[= [a] + 1 ]');
    expect(solidScriptFormulaStore('value', '2', '[=1]')).toBe('2');
    expect(solidScriptFormulaStore('value', '[w]', '')).toBe('[w]');
    expect(solidScriptFormulaStore('condition', '[a] > 1', '')).toBe('[a] > 1');
  });

  it('shows vectors, words and variables the way they are typed', () => {
    expect(solidScriptFormulaShown('vector', '[5, 7, 2]')).toBe('5, 7, 2');
    expect(solidScriptFormulaShown('vector', 'Vector(0, [h], 0)')).toBe('0, [h], 0');
    expect(solidScriptFormulaShown('vector', 'Vector(0, [h] * 2, 0)')).toBe('Vector(0, [h] * 2, 0)');
    expect(solidScriptFormulaShown('vector', '[a, b]')).toBe('[a, b]');
    expect(solidScriptFormulaShown('text', '"Fully Inside"')).toBe('Fully Inside');
    expect(solidScriptFormulaShown('text', '"a\\"b"')).toBe('"a\\"b"');
    expect(solidScriptFormulaShown('variable', '[$Face.Center]')).toBe('$Face.Center');
    expect(solidScriptFormulaShown('variable', '[=1]')).toBe('[=1]');
    expect(solidScriptFormulaShown('any', ' 2 ')).toBe('2');
  });

  it('turns what is typed into a formula, quietly fixing vectors, words and names', () => {
    expect(solidScriptFormulaTyped('vector', '5, 7, 2')).toBe('[5, 7, 2]');
    expect(solidScriptFormulaTyped('any', '5, 7, 2')).toBe('[5, 7, 2]');
    expect(solidScriptFormulaTyped('vector', '0, [h], 0')).toBe('Vector(0, [h], 0)');
    expect(solidScriptFormulaTyped('vector', '[=Vector(1, 1, 1)]')).toBe('Vector(1, 1, 1)');
    expect(solidScriptFormulaTyped('text', 'Fully Inside')).toBe('"Fully Inside"');
    expect(solidScriptFormulaTyped('text', '[t]')).toBe('[t]');
    expect(solidScriptFormulaTyped('variable', '$Face.Area')).toBe('[$Face.Area]');
    expect(solidScriptFormulaTyped('variable', '[w] * 2')).toBe('[w] * 2');
    for (const kind of ['vector', 'text', 'variable', 'any'] as const)
      for (const formula of ['[5, 7, 2]', '"Top"', '[$Face.Center]', '[a] + 1'])
        expect(solidScriptFormulaTyped(kind, solidScriptFormulaShown(kind, formula)), `${kind} ${formula}`).toBe(
          formula,
        );
  });
});
