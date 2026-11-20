import { describe, expect, it } from 'vitest';
import type { SolidScriptExpression } from '@/solid_script/language/solid_script_ast.js';
import { SolidScriptLexer } from '@/solid_script/language/solid_script_lexer.js';
import { solidScriptExpressionParse } from '@/solid_script/language/solid_script_expression_parse.js';
import {
  SolidScriptFormulaSource,
  solidScriptFormulaProblem,
} from '@/solid_script/language/solid_script_formula_source.js';

/**
 * Lists every part of a formula with the text it was read from.
 *
 * @param source Formula read with its spans.
 * @returns Kind and text of each part, outermost first.
 */
function parts(source: SolidScriptFormulaSource): string[] {
  const found: string[] = [];
  const visit = (node: SolidScriptExpression): void => {
    found.push(`${node.kind}:${source.slice(node)}`);
    if (node.kind === 'binary') [node.left, node.right].forEach(visit);
    if (node.kind === 'unary') visit(node.operand);
    if (node.kind === 'ternary') [node.condition, node.whenTrue, node.whenFalse].forEach(visit);
    if (node.kind === 'call') node.args.forEach((arg) => visit(arg.value));
  };
  visit(source.tree);
  return found;
}

describe('SolidScript formula source', () => {
  it('keeps the $ of an escaped bracket with the part it starts, such as a $[ $] list', () => {
    const source = SolidScriptFormulaSource.read('$[1, [a]$]');
    expect(source.slice(source.tree)).toBe('$[1, [a]$]');
    expect(parts(SolidScriptFormulaSource.read('"$[Box$] is"'))).toEqual(['string:"$[Box$] is"']);
  });

  it('knows where every part of a formula stands, slots with their brackets', () => {
    const source = SolidScriptFormulaSource.read('[a] > 0 and InBox([$Face.Center], [0, 1, 0], 2)');
    expect(parts(source)).toEqual([
      'binary:[a] > 0 and InBox([$Face.Center], [0, 1, 0], 2)',
      'binary:[a] > 0',
      'variable:[a]',
      'number:0',
      'call:InBox([$Face.Center], [0, 1, 0], 2)',
      'variable:[$Face.Center]',
      'variable:[0, 1, 0]',
      'number:2',
    ]);
  });

  it('tells parts in parentheses apart and gives their text with them', () => {
    const source = SolidScriptFormulaSource.read('( ([a] || [b]) ) && [c]');
    const tree = source.tree;
    if (tree.kind !== 'binary') throw new Error('Expected &&');
    expect(source.parenthesized(tree.left)).toBe(true);
    expect(source.parenthesized(tree.right)).toBe(false);
    expect(source.slice(tree.left)).toBe('[a] || [b]');
    const outer = source.outer(tree.left);
    expect(source.text.slice(outer.from, outer.to)).toBe('( ([a] || [b]) )');
    expect(source.slot(tree.right)).toBe(true);
  });

  it('reads the same tree as the script language, so nothing means anything else', () => {
    for (const text of ['1 + 2 * 3 ^ 2 ^ 2', 'not a or b and c', '-x ? Vector(1, 2, 3) : "t"', 'Max(1, f(2), y = 3)'])
      expect(SolidScriptFormulaSource.read(text).tree).toEqual(solidScriptExpressionParse(text));
  });

  it('keeps the place of every character of every token, words read as symbols too', () => {
    const tokens = new SolidScriptLexer('a and "x y" >= 2.5').tokenize();
    expect(tokens.map((token) => [token.text, token.start, token.end])).toEqual([
      ['a', 0, 1],
      ['&&', 2, 5],
      ['x y', 6, 11],
      ['>=', 12, 14],
      ['2.5', 15, 18],
      ['', 18, 18],
    ]);
  });

  it('names the problem of a broken formula in plain words, and none for a good one', () => {
    expect(solidScriptFormulaProblem('[a] > 1')).toBe('');
    expect(solidScriptFormulaProblem('[a] >')).toMatch(/value is still missing/);
    expect(solidScriptFormulaProblem('[a')).toMatch(/has no \]/);
    expect(solidScriptFormulaProblem('(1')).not.toBe('');
  });
});
