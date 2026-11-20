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

  it('opens a condition as it is, and a value field as its formula or as its plain value', () => {
    expect(solidScriptFormulaBody('condition', '[a] > 1')).toBe('[a] > 1');
    expect(solidScriptFormulaBody('value', '[=[a] > 1]')).toBe('[a] > 1');
    expect(solidScriptFormulaBody('value', '')).toBe('');
    expect(solidScriptFormulaBody('value', '2')).toBe('2');
    expect(solidScriptFormulaBody('value', '[w]')).toBe('[w]');
    expect(solidScriptFormulaBody('value', 'Top and Side')).toBe('"Top and Side"');
    expect(solidScriptFormulaBody('text', 'Subtractive')).toBe('"Subtractive"');
    expect(solidScriptFormulaBody('vector3', '1, 2.5, -3')).toBe('[1, 2.5, -3]');
    expect(solidScriptFormulaBody('value', '1, 2, 3')).toBe('[1, 2, 3]');
    expect(solidScriptFormulaBody('message', 'Hi [Name]')).toBe('Str("Hi ", [Name])');
    expect(solidScriptFormulaBodyOr('text', 'say "hi"')).toBeNull();
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
    expect(solidScriptFormulaShown('text', '"a\\"b"')).toBe('a"b');
    expect(solidScriptFormulaShown('text', '""')).toBe('');
    expect(solidScriptFormulaShown('text', '"a\\nb"')).toBe('[="a\\nb"]');
    expect(solidScriptFormulaShown('text', 'Str("a", [t])')).toBe('[=Str("a", [t])]');
    expect(solidScriptFormulaShown('variable', '[$Face.Center]')).toBe('$Face.Center');
    expect(solidScriptFormulaShown('variable', '[=1]')).toBe('[=1]');
    expect(solidScriptFormulaShown('any', ' 2 ')).toBe('2');
  });

  it('turns what is typed into a formula, quietly fixing vectors, words and names', () => {
    expect(solidScriptFormulaTyped('vector', '5, 7, 2')).toBe('[5, 7, 2]');
    expect(solidScriptFormulaTyped('any', '5, 7, 2')).toBe('[5, 7, 2]');
    expect(solidScriptFormulaTyped('vector', '0, [h], 0')).toBe('Vector(0, [h], 0)');
    expect(solidScriptFormulaTyped('vector', '[=Vector(1, 1, 1)]')).toBe('Vector(1, 1, 1)');
    expect(solidScriptFormulaTyped('vector', 'Vector(0, 1, 0)')).toBe('Vector(0, 1, 0)');
    expect(solidScriptFormulaTyped('any', 'Clamp([a], 0, 1)')).toBe('Clamp([a], 0, 1)');
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

  it('writes a formula of one plain value as the value, anything more as a formula', () => {
    expect(solidScriptFormulaStore('text', '"Subtractive"', '')).toBe('Subtractive');
    expect(solidScriptFormulaStore('value', '"Fully Inside"', '[=1]')).toBe('Fully Inside');
    expect(solidScriptFormulaStore('text', '"5"', '')).toBe('[="5"]');
    expect(solidScriptFormulaStore('text', '"a [b]"', '')).toBe('[="a [b]"]');
    expect(solidScriptFormulaStore('number', '5', '')).toBe('5');
    expect(solidScriptFormulaStore('vector3', '[1, 2, 3]', '')).toBe('1, 2, 3');
    expect(solidScriptFormulaStore('vector3', 'Vector(1, 2, 3)', '')).toBe('1, 2, 3');
    expect(solidScriptFormulaStore('vector3', '[1, [h], 3]', '')).toBe('[1, [h], 3]');
    expect(solidScriptFormulaStore('value', '[1, 2, 3]', '')).toBe('1, 2, 3');
    const choice = '4 > 2 ? "Subtractive" : "Additive"';
    expect(solidScriptFormulaStore('text', choice, '')).toBe(`[=${choice}]`);
    expect(solidScriptFormulaStore('text', '"Additive" + "x"', '')).toBe('[="Additive" + "x"]');
  });

  it('opens a plain value and writes it back unchanged', () => {
    const cases = [
      ['text', 'Subtractive'],
      ['value', 'Fully Inside'],
      ['number', '0.5'],
      ['vector3', '1, 2, 3'],
      ['vector2', '-1, 0.5'],
      ['text', '[=4 > 2 ? "Subtractive" : "Additive"]'],
    ] as const;
    for (const [kind, stored] of cases) {
      const body = solidScriptFormulaBody(kind, stored);
      expect(solidScriptFormulaStore(kind, body, stored), stored).toBe(stored);
      expect(solidScriptFormulaStore(kind, body, ''), stored).toBe(stored);
    }
  });
});
