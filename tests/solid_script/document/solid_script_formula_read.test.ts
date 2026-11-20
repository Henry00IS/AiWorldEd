import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';

/**
 * Lists the lines of a formula as command ids and shown values.
 *
 * @param text Formula.
 * @param each Element the formula is worked out for.
 * @returns Lines.
 */
function lines(text: string, each?: 'Face' | 'Vertex'): string[] {
  const read = solidScriptFormulaRead(text, each ? { each } : {});
  return read.document.blocks.map((block) => {
    const values = Object.entries(block.values).map(([key, value]) => `${key}=${value}`);
    return [block.command.replace('formula_', ''), ...values].join(' ');
  });
}

/**
 * Lists the lines of a formula as command ids, indented by depth.
 *
 * @param text Formula.
 * @returns Lines.
 */
function tree(text: string): string[] {
  const read = solidScriptFormulaRead(text);
  const depths = solidScriptDocumentDepths(read.document, solidScriptFormulaCatalog());
  return read.document.blocks.map((block, index) => {
    const value = block.values['value'] === undefined ? '' : ` ${block.values['value']}`;
    return `${'  '.repeat(depths[index] ?? 0)}${block.command.replace('formula_', '')}${value}`;
  });
}

describe('SolidScript formula blocks read', () => {
  it('shows the Pebbles Where as friendly check blocks with the face filled in', () => {
    expect(
      lines(
        'HitsBox([$Face], Vector(0, 0.2, 0), Vector(4, 0.3, 4), "Fully Inside") and InBox([$Face.Center], Vector(0, 0.2, 0), 1)',
        'Face',
      ),
    ).toEqual([
      'check_hits_box element= center=0, 0.2, 0 size=4, 0.3, 4 how=Fully Inside',
      'check_in_box point= center=0, 0.2, 0 size=1',
    ]);
  });

  it('shows the element as typed where no element is filled in', () => {
    expect(lines('InBox([$Face.Center], [0, 0, 0], 1)')).toEqual([
      'check_in_box point=[$Face.Center] center=0, 0, 0 size=1',
    ]);
    expect(lines('InBox([p], [0, 0, 0], 1)', 'Face')[0]).toContain('point=[p]');
  });

  it('turns and, or, not, operators and ? : into groups closed by End, indented like a Transform', () => {
    expect(tree('[a] > 0 && ([b] || not ([c] and [d])) ? 1 : 2')).toEqual([
      'if',
      '  and',
      '    more',
      '      variable a',
      '      number 0',
      '    end',
      '    or',
      '      variable b',
      '      not',
      '        and',
      '          variable c',
      '          variable d',
      '        end',
      '      end',
      '    end',
      '  end',
      'then',
      '  number 1',
      'else',
      '  number 2',
      'end',
    ]);
  });

  it('shows Equals holding Absolute holding a number', () => {
    expect(tree('[x] == abs(-54)')).toEqual(['equals', '  variable x', '  fn_abs', '    number -54', '  end', 'end']);
  });

  it('keeps a chain of one operator in one group, and a different operator in its own', () => {
    expect(tree('1 + 2 + 3 - 4')).toEqual([
      'minus',
      '  plus',
      '    number 1',
      '    number 2',
      '    number 3',
      '  end',
      '  number 4',
      'end',
    ]);
    expect(tree('2 ^ 3 ^ 2')).toEqual(['power', '  number 2', '  number 3', '  number 2', 'end']);
    expect(tree('(2 ^ 3) ^ 2')).toEqual([
      'power',
      '  power',
      '    number 2',
      '    number 3',
      '  end',
      '  number 2',
      'end',
    ]);
    expect(tree('-[w] * 2')).toEqual(['times', '  negate', '    variable w', '  end', '  number 2', 'end']);
  });

  it('shows numbers, vectors, words and variables in their own simple blocks', () => {
    expect(lines('[5, 2, 7] == Vector(1, [b], 3)')).toEqual([
      'equals',
      'vector value=5, 2, 7',
      'vector value=1, [b], 3',
      'end',
    ]);
    expect(lines('"Top" != [$Face.Name]')).toEqual(['differs', 'text value=Top', 'variable value=$Face.Name', 'end']);
    expect(lines('"two words" == "a\\"b"')).toEqual(['equals', 'text value=two words', 'text value=a"b', 'end']);
  });

  it('keeps anything without its own block in an Expression block, as typed', () => {
    expect(lines('[=1 + 2]')).toEqual(['value value=[=1 + 2]']);
    expect(lines('InBox(point = [p])')).toEqual(['value value=InBox(point = [p])']);
    expect(lines('IsNum(1, 2)')).toEqual(['value value=IsNum(1, 2)']);
    expect(lines('Max(a = 1)')).toEqual(['value value=Max(a = 1)']);
    expect(lines('Pick([l], 0) > true')).toEqual([
      'more',
      'fn_pick',
      'variable value=l',
      'number value=0',
      'end',
      'value value=true',
      'end',
    ]);
  });

  it('reads functions with any number of inputs where they take that many', () => {
    expect(tree('Max(1, 2, 3, 4)')).toEqual(['fn_max', '  number 1', '  number 2', '  number 3', '  number 4', 'end']);
    expect(lines('Sqrt(1, 2)')).toEqual(['value value=Sqrt(1, 2)']);
  });

  it('reads an empty formula as no blocks and refuses a broken one', () => {
    expect(lines('  ')).toEqual([]);
    expect(() => solidScriptFormulaRead('[a] >')).toThrow(/value is still missing/);
    expect(() => solidScriptFormulaRead('[a')).toThrow(/has no \]/);
    expect(() => solidScriptFormulaRead('[] > 1')).toThrow(/empty/);
  });

  it('uses the shared End of the script editor', () => {
    expect(solidScriptFormulaCatalog().find('end')).toBe(SOLID_SCRIPT_COMMAND_CATALOG.find('end'));
  });
});
