import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptFormulaRead,
  type SolidScriptFormulaBlocks,
} from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import { SOLID_SCRIPT_FORMULA_COMMAND } from '@/solid_script/commands/solid_script_formula_commands.js';
import type { SolidScriptFormulaContext } from '@/solid_script/commands/solid_script_formula_inputs.js';

/** Deep formula: forty checks joined by &&. */
const SOLID_SCRIPT_FORMULA_LONG = Array.from({ length: 40 }, (_, index) => `[a] + ${index} > ${index - 1}`).join(
  ' && ',
);

/** Formulas of every shape the blocks must keep. */
const CORPUS: readonly string[] = [
  '[a] > 0 && [b] < 1',
  '[a] > 0 and [b] < 1 or not [c] == 2',
  '!([a] > 0) || [b] == 0 && [c] != 1',
  '([a] + [b]) * [c] >= [d] - 1',
  '[a] ? [b] : [c]',
  '[a] > 0 ? ([b] > 0 ? 1 : 2) : 3',
  '[a] > 0 ? 1 : [b] > 0 ? 2 : 3',
  '[a] > 0 && [b] == 0 ? [c] && [d] : [b]',
  '((([a] > 0)))',
  'IsNum([a]) && !IsString([a])',
  'Max([a], [c]) > 1 || Min([b], [d]) < 0',
  'Abs(-[c]) == 2',
  '2 ^ 3 ^ 2 == 512',
  '-[a] + +[c] == 1',
  '[a] /* inline */ > 0 // trailing',
  '  [a]  >  0  &&\n  [b] <= 0  ',
  '"x" == "x" && [t] == "Top"',
  'true && !false || [b] == 1',
  '[a] % 2 == 1 && [d] / 3 == 1',
  'not not [a]',
  '[a] == 1 != false',
  '([a] ? 1 : 0) && [c]',
  '[=[a] + 1] > 1',
  'HasTag([l], "Top") or HasTag([l], "Side")',
  '([a] > 0 || [b] > 0) && ([c] > 0 || [d] > 0) && !([a] > 5 && [b] > 5)',
  `${'('.repeat(30)}[a] > 0${')'.repeat(30)}`,
  `${'!'.repeat(9)}[b]`,
  SOLID_SCRIPT_FORMULA_LONG,
  '[a] - ([b] - [c]) == 3',
  '[a] < [c] == true',
  'abs(-54) == [c] - -52 + 0',
  '-(-[a]) == 1 && - [a] < 0',
  'Clamp([a], 0, 1) + Max(1, 2, 3, 4) * Sqrt(4) > 0',
  'Vector(1, [a], 3) == [1, 1, 3]',
  '[a] - [b] - [c] == -1 && [d] / [c] / 3 == 0.5',
  '(2 ^ 3) ^ 2 == 64 && -2 ^ 2 == -4',
  'Max(1, [a] ? 5 : 6) == 5',
  'Len("ab") == 2 && Str([a], "x") == "1x"',
];

/**
 * Formulas with brackets, each with how it is written neatly and how it is
 * written after its first Number becomes 6 (or, without one, its first Variable
 * becomes [d] or its first Text "Side"): only brackets nothing needs go.
 */
const BRACKETS: readonly (readonly [string, string, string])[] = [
  ['(5+4)', '5 + 4', '(6+4)'],
  ['((5+4))', '5 + 4', '((6+4))'],
  ['(((15)))', '15', '6'],
  ['(7+8)*3', '(7 + 8) * 3', '(6+8)*3'],
  ['7+(8*3)', '7 + 8 * 3', '6+(8*3)'],
  ['-(5+4)', '-(5 + 4)', '-(6+4)'],
  ['([a] && [b]) || [c]', '[a] && [b] || [c]', '([d] && [b]) || [c]'],
  ['[a] && ([b] || [c])', '[a] && ([b] || [c])', '[d] && ([b] || [c])'],
  ['!([a] && [b])', '!([a] && [b])', '!([d] && [b])'],
  ['not ([a] and [b])', '!([a] && [b])', 'not ([d] and [b])'],
  ['[a] ? ([b] ? 1 : 2) : 3', '[a] ? [b] ? 1 : 2 : 3', '[a] ? ([b] ? 6 : 2) : 3'],
  ['[a] ? [b] ? 1 : 2 : 3', '[a] ? [b] ? 1 : 2 : 3', '[a] ? [b] ? 6 : 2 : 3'],
  ['([a] ? 1 : 2) + 1', '([a] ? 1 : 2) + 1', '([a] ? 6 : 2) + 1'],
  ['[a] ? 1 : ([b] ? 2 : 3)', '[a] ? 1 : [b] ? 2 : 3', '[a] ? 6 : ([b] ? 2 : 3)'],
  ['(([a]) ? (1) : (2))', '[a] ? 1 : 2', '(([a]) ? 6 : (2))'],
  ['(2^3)^2', '(2 ^ 3) ^ 2', '(6^3)^2'],
  ['2^(3^2)', '2 ^ 3 ^ 2', '6^(3^2)'],
  ['([a] - [b]) - [c]', '[a] - [b] - [c]', '([d] - [b]) - [c]'],
  ['[a] - ([b] - [c])', '[a] - ([b] - [c])', '[d] - ([b] - [c])'],
  ['([d] / [c]) / 3', '[d] / [c] / 3', '([d] / [c]) / 6'],
  ['[d] / ([c] / 3)', '[d] / ([c] / 3)', '[d] / ([c] / 6)'],
  ['Max((1), (2 + 3))', 'Max(1, 2 + 3)', 'Max(6, (2 + 3))'],
  ['Vector((1), ([a] + 1), (3))', 'Vector(1, [a] + 1, 3)', 'Vector(6, ([a] + 1), (3))'],
  ['[(1 + 1), 2, 3] == [2, 2, 3]', '[1 + 1, 2, 3] == [2, 2, 3]', '[(6 + 1), 2, 3] == [2, 2, 3]'],
  ['Abs((-(5)))', 'Abs(-5)', 'Abs(6)'],
  ['5+(5)', '5 + 5', '6+(5)'],
  ['(5)+5', '5 + 5', '6+5'],
  ['5*(-5)', '5 * -5', '6*(-5)'],
  ['Abs((5))', 'Abs(5)', 'Abs(6)'],
  ['[(1), 2, (3)]', '[1, 2, 3]', '[6, 2, (3)]'],
  ['(-2)^2', '(-2) ^ 2', '6^2'],
  ['-2^2', '-2 ^ 2', '-6^2'],
  ['("Top")', '"Top"', '"Side"'],
  ['HasTag(([l]), ("Top"))', 'HasTag([l], "Top")', 'HasTag(([l]), ("Top"))'],
];

/**
 * Works a formula out in a script with test variables.
 *
 * @param formula Formula.
 * @returns What it gives, or its error.
 */
function evaluate(formula: string): string {
  const variable = (name: string, value: string) => ({ command: 'variable', values: { name, value } });
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      variable('a', '1'),
      variable('b', '0'),
      variable('c', '2'),
      variable('d', '3'),
      variable('t', 'Top'),
      variable('l', '[=$["Top", "Side"$]]'),
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube' },
    ]),
  );
  return result.error ? `error ${result.error.message}` : result.messages.join('|');
}

/**
 * Writes blocks as if every block were new, so all of it is written neatly.
 *
 * @param read Blocks.
 * @returns Formula.
 */
function rewrite(read: SolidScriptFormulaBlocks): string {
  const written = solidScriptFormulaWrite(read.document, { origins: new Map(), root: { ...read.root, sections: [] } });
  if (!('text' in written)) throw new Error(written.problem);
  return written.text;
}

/**
 * Writes blocks and expects a formula.
 *
 * @param read Blocks.
 * @param context Where the formula is used.
 * @returns Formula.
 */
function write(read: SolidScriptFormulaBlocks, context: SolidScriptFormulaContext = {}): string {
  const written = solidScriptFormulaWrite(read.document, read, context);
  if (!('text' in written)) throw new Error(written.problem);
  return written.text;
}

/**
 * Finds the first line of a command.
 *
 * @param read Blocks.
 * @param command Command id.
 * @returns Line.
 */
function line(read: SolidScriptFormulaBlocks, command: string): SolidScriptBlock {
  const found = read.document.blocks.find((block) => block.command === command);
  if (!found) throw new Error(`no ${command}`);
  return found;
}

describe('SolidScript formula blocks write', () => {
  it('gives every untouched formula back exactly as typed', () => {
    for (const formula of CORPUS) expect(write(solidScriptFormulaRead(formula))).toBe(formula);
  });

  it('writes every formula neatly with the same meaning, and neat text stays the same', () => {
    expect(evaluate('[a] > 0 && [c] == 2')).toBe('Yes');
    for (const formula of CORPUS) {
      const neat = rewrite(solidScriptFormulaRead(formula));
      expect(evaluate(neat), `${formula} -> ${neat}`).toBe(evaluate(formula));
      expect(rewrite(solidScriptFormulaRead(neat))).toBe(neat);
      expect(neat).not.toMatch(/\b(and|or)\b/);
    }
  });

  it('writes neat text with && and only the parentheses needed', () => {
    expect(rewrite(solidScriptFormulaRead('[a]>0 and ([b]<1)'))).toBe('[a] > 0 && [b] < 1');
    expect(rewrite(solidScriptFormulaRead('not ([a] or [b])'))).toBe('!([a] || [b])');
    expect(rewrite(solidScriptFormulaRead('[a] or [b] and [c]'))).toBe('[a] || [b] && [c]');
    expect(rewrite(solidScriptFormulaRead('-(-[a])'))).toBe('-(-[a])');
    expect(rewrite(solidScriptFormulaRead('abs( -54 )==[x]'))).toBe('Abs(-54) == [x]');
    expect(rewrite(solidScriptFormulaRead('(2^3)^2 + 2^(3^2)'))).toBe('(2 ^ 3) ^ 2 + 2 ^ 3 ^ 2');
    expect(rewrite(solidScriptFormulaRead('[a] - ([b] + [c])'))).toBe('[a] - ([b] + [c])');
  });

  it('writes only the changed block neatly and keeps the rest exactly', () => {
    const read = solidScriptFormulaRead('IsNum( [a] )  and  ( [b]>1 or [c] )');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.number).values['value'] = '5';
    expect(write(read)).toBe('IsNum( [a] )  and  ( [b]>5 or [c] )');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.number).values['value'] = '[d] || [a]';
    expect(write(read)).toBe('IsNum( [a] )  and  ( [b]>([d] || [a]) or [c] )');
  });

  it('adds parentheses when a moved block needs them', () => {
    const read = solidScriptFormulaRead('([a] || [b]) && [c]');
    const blocks = read.document.blocks;
    const or = blocks.splice(0, 4);
    const inner = or.slice(1, 3);
    read.document.blocks = [...inner, blocks[0]!];
    expect(write(read)).toBe('[a] && [b] && [c]');
    const nested = solidScriptFormulaRead('[c] && [d]');
    nested.document.blocks.push(...or);
    expect(write(nested)).toBe('[c] && [d] && ([a] || [b])');
  });

  it.each([
    ['""', ''],
    ['"abc"', 'abc'],
    ['"  two  spaces "', '  two  spaces '],
    ['"say $"hi$" \\ back"', 'say "hi" \\ back'],
    ['"$"edges$""', '"edges"'],
    ['"a\\nb \\"', 'a\\nb \\'],
    ['"a $[b$] c, d"', 'a [b] c, d'],
    ['"5, $ $ $ "', '5, $ $ $ '],
    ['"a$b $$$[ $$$"', 'a$b $[ $'],
  ])('shows the Text %s as its content %j, and writes it back, also when typed anew', (formula, content) => {
    const read = solidScriptFormulaRead(formula);
    const text = line(read, SOLID_SCRIPT_FORMULA_COMMAND.text);
    expect(text.values['value']).toBe(content);
    expect(write(read)).toBe(formula);
    expect(rewrite(read)).toBe(formula);
    expect(evaluate(`${rewrite(read)} == ${formula}`)).toBe('Yes');
  });

  it('allows an empty Text block, the empty text', () => {
    const read = solidScriptFormulaRead('"abc"');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.text).values['value'] = '';
    expect(write(read)).toBe('""');
  });

  it('turns typed vectors and words into a formula quietly', () => {
    const read = solidScriptFormulaRead('InBox([p], Vector(0, 1, 0), 2) && HitsBox([e], [1, 2, 3], 1, "Touching")');
    line(read, 'formula_check_in_box').values['center'] = '5, 7, 2';
    line(read, 'formula_check_hits_box').values['how'] = 'Fully Inside';
    expect(write(read)).toBe('InBox([p], [5, 7, 2], 2) && HitsBox([e], [1, 2, 3], 1, "Fully Inside")');
    line(read, 'formula_check_in_box').values['center'] = '[x], 1, 0';
    expect(write(read)).toContain('InBox([p], Vector([x], 1, 0), 2)');
    line(read, 'formula_check_in_box').values['center'] = '[=Vector(1, 1, 1)]';
    expect(write(read)).toContain('InBox([p], Vector(1, 1, 1), 2)');
  });

  it('fills in the element where the formula is worked out per element', () => {
    const face = { each: 'Face' } as const;
    const read = solidScriptFormulaRead('Hits( [$Face] , [b])', face);
    expect(line(read, 'formula_check_hits').values['element']).toBe('');
    line(read, 'formula_check_hits').values['target'] = '[c]';
    expect(write(read, face)).toBe('Hits([$Face], [c])');
    const fresh = solidScriptFormulaRead('', face);
    fresh.document.blocks.push({
      id: 'x',
      command: 'formula_check_in_box',
      values: { point: '', center: '0, 0, 0', size: '1' },
    });
    expect(write(fresh, face)).toBe('InBox([$Face.Center], [0, 0, 0], 1)');
    const none = solidScriptFormulaWrite(fresh.document, fresh, {});
    expect(none).toEqual({ problem: 'In Box: Point needs a value.', line: 0 });
  });

  it('refuses blocks that make no formula, naming the line', () => {
    const problem = (text: string, edit: (blocks: SolidScriptBlock[]) => void) => {
      const read = solidScriptFormulaRead(text);
      edit(read.document.blocks);
      return solidScriptFormulaWrite(read.document, read);
    };
    expect(problem('[a] && ([b] || [c])', (blocks) => blocks.pop())).toEqual({
      problem: 'Or has no End; add one below its last block.',
      line: 1,
    });
    expect(problem('[a]', (blocks) => blocks.push({ id: 'e', command: 'end', values: {} }))).toMatchObject({ line: 1 });
    expect(problem('!([a])', (blocks) => blocks.splice(1, 1))).toEqual({
      problem: 'Not needs at least one part.',
      line: 0,
    });
    expect(problem('![a]', (blocks) => blocks.splice(1, 0, { ...blocks[1]!, id: 'n' }))).toEqual({
      problem: 'Not holds only one block; remove the others.',
      line: 0,
    });
    expect(problem('[a] == 1', (blocks) => blocks.splice(1, 1))).toEqual({
      problem: 'Equals needs at least 2 parts.',
      line: 0,
    });
    expect(problem('[a] ? 1 : 2', (blocks) => blocks.splice(1, 1))).toEqual({
      problem: 'If needs at least one part.',
      line: 0,
    });
    expect(problem('[a] ? 1 : 2', (blocks) => blocks.splice(5, 1))).toEqual({
      problem: 'If needs at least one part under Else.',
      line: 0,
    });
    expect(problem('[a] ? 1 : 2', (blocks) => blocks.splice(3, 2))).toMatchObject({
      problem: /needs a Then and an Else/,
    });
    expect(problem('[a]', (blocks) => blocks.push({ id: 't', command: 'formula_then', values: {} }))).toMatchObject({
      problem: /Then belongs inside an If/,
    });
    expect(problem('[a]', (blocks) => (blocks[0]!.values['value'] = '[a] +'))).toMatchObject({
      problem: /^Variable: /,
    });
    expect(problem('[a]', (blocks) => blocks.push({ id: 'z', command: 'cube', values: {} }))).toMatchObject({
      problem: /no formula block/,
    });
  });

  it('writes a value typed into any value block as the block that shows it best', () => {
    const read = solidScriptFormulaRead('[x] == 2');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.number).values['value'] = '5, 2, 7';
    const text = write(read);
    expect(text).toBe('[x] == [5, 2, 7]');
    expect(line(solidScriptFormulaRead(text), SOLID_SCRIPT_FORMULA_COMMAND.vector).values['value']).toBe('5, 2, 7');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.number).values['value'] = '[=[Width] * 2]';
    expect(write(read)).toBe('[x] == [Width] * 2');
    line(read, SOLID_SCRIPT_FORMULA_COMMAND.variable).values['value'] = '$Face.Area';
    expect(write(read)).toBe('[$Face.Area] == [Width] * 2');
    const text2 = solidScriptFormulaRead('"Top" == [t]');
    line(text2, SOLID_SCRIPT_FORMULA_COMMAND.text).values['value'] = 'Side Wall';
    expect(write(text2)).toBe('"Side Wall" == [t]');
  });

  it('builds Equals holding Absolute holding a number from new blocks', () => {
    const read = solidScriptFormulaRead('');
    const add = (command: string, value?: string): void => {
      read.document.blocks.push({
        id: `n${read.document.blocks.length}`,
        command,
        values: value === undefined ? {} : { value },
      });
    };
    add('formula_equals');
    add(SOLID_SCRIPT_FORMULA_COMMAND.variable, 'x');
    add('formula_fn_abs');
    add(SOLID_SCRIPT_FORMULA_COMMAND.number, '-54');
    add('end');
    add('end');
    expect(write(read)).toBe('[x] == Abs(-54)');
    add(SOLID_SCRIPT_FORMULA_COMMAND.text, 'Top');
    expect(write(read)).toBe('[x] == Abs(-54) && "Top"');
    expect(evaluate('[a] == Abs(-1)')).toBe('Yes');
  });

  it('keeps the formula of every block by line, a group on its Then, Else and End too', () => {
    const read = solidScriptFormulaRead('[a] && ([b] || Abs([c]) > 1) && ([d] ? 1 : 2)');
    const written = solidScriptFormulaWrite(read.document, read);
    if (!('parts' in written)) throw new Error('Expected a formula');
    const part = (line: number) => written.parts.get(line);
    expect(read.document.blocks.map((block) => block.command)).toEqual([
      'formula_variable',
      'formula_or',
      'formula_variable',
      'formula_more',
      'formula_fn_abs',
      'formula_variable',
      'end',
      'formula_number',
      'end',
      'end',
      'formula_if',
      'formula_variable',
      'formula_then',
      'formula_number',
      'formula_else',
      'formula_number',
      'end',
    ]);
    expect(part(0)).toBe('[a]');
    expect(part(1)).toBe('[b] || Abs([c]) > 1');
    expect(part(9)).toBe(part(1));
    expect(part(3)).toBe('Abs([c]) > 1');
    expect(part(4)).toBe('Abs([c])');
    expect(part(6)).toBe('Abs([c])');
    expect(part(7)).toBe('1');
    expect([10, 12, 14, 16].map(part)).toEqual(Array(4).fill('[d] ? 1 : 2'));
    expect(part(-1)).toBeUndefined();
  });

  it('keeps brackets exactly while untouched, and drops only brackets nothing needs', () => {
    for (const [formula, neat, edited] of BRACKETS) {
      const read = solidScriptFormulaRead(formula);
      expect(write(read), formula).toBe(formula);
      expect(rewrite(read), formula).toBe(neat);
      expect(evaluate(neat), `${formula} -> ${neat}`).toBe(evaluate(formula));
      const number = read.document.blocks.find((block) => block.command === SOLID_SCRIPT_FORMULA_COMMAND.number);
      const named = read.document.blocks.find(
        (block) =>
          block.command === SOLID_SCRIPT_FORMULA_COMMAND.variable ||
          block.command === SOLID_SCRIPT_FORMULA_COMMAND.text,
      );
      if (number) number.values['value'] = '6';
      else if (named) named.values['value'] = named.command === SOLID_SCRIPT_FORMULA_COMMAND.text ? 'Side' : 'd';
      expect(write(read), formula).toBe(edited);
      expect(evaluate(edited), `${formula} -> ${edited}`).toBe(evaluate(rewrite(read)));
    }
  });

  it('keeps the brackets a changed value needs, such as a negative number raised to a power', () => {
    const read = solidScriptFormulaRead('(-2)^2 + 5*(-5)');
    const numbers = read.document.blocks.filter((block) => block.command === SOLID_SCRIPT_FORMULA_COMMAND.number);
    expect(numbers.map((block) => block.values['value'])).toEqual(['-2', '2', '5', '-5']);
    numbers[0]!.values['value'] = '-3';
    numbers[3]!.values['value'] = '-6';
    expect(write(read)).toBe('(-3)^2 + 5*-6');
    expect(evaluate(write(read))).toBe(evaluate('9 + -30'));
  });
});
