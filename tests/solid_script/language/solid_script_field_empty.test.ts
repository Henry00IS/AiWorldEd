import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptFieldEmptyChecked,
  solidScriptFieldEmptyMessage,
} from '@/solid_script/language/solid_script_field_empty.js';

const EMPTY: SolidScriptLine = { command: 'variable', values: { name: 'Empty', value: '[=""]' } };
const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Makes an Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

describe('SolidScript fields left empty or coming out empty', () => {
  it('keeps the placeholder of a field left empty', () => {
    const repeat = run({ command: 'repeat', values: { variable: 'I', from: '0', to: '' } }, echo('[I]'), END);
    expect(repeat.error).toBeNull();
    expect(repeat.messages).toEqual(['0', '1', '2']);
    const each = run({ command: 'for_each', values: { variable: 'I', list: '   ' } }, echo('[I]'), END);
    expect(each.messages).toEqual(['1', '2', '3']);
  });

  it('stops a number field whose variable is empty text', () => {
    const result = run(EMPTY, { command: 'repeat', values: { variable: 'I', from: '0', to: '[Empty]' } }, END);
    expect(result.error?.message).toContain('To needs a number, such as 2, not "" (Text)');
    expect(result.error?.line).toBe(2);
  });

  it('stops a condition whose value is empty text, and runs one left empty on its placeholder', () => {
    const empty = run(EMPTY, { command: 'if', values: { condition: '[Empty]' } }, echo('Yes'), END);
    expect(empty.error?.message).toContain('Condition needs Yes or No, such as');
    expect(empty.error?.message).toContain('not "" (Text)');
    const placeholder = run(
      { command: 'variable', values: { name: 'I', value: '2' } },
      { command: 'if', values: { condition: '' } },
      echo('Even'),
      END,
    );
    expect(placeholder.error).toBeNull();
    expect(placeholder.messages).toEqual(['Even']);
  });

  it('stops a word field whose value is empty text, naming the words', () => {
    const mode = run(EMPTY, { command: 'cube', values: { mode: '[Empty]' } });
    expect(mode.error?.message).toContain('Mode needs Additive, Subtractive or Intersecting, not "" (Text)');
    const anchor = run(EMPTY, { command: 'cube', values: { anchor: '[Empty]' } });
    expect(anchor.error?.message).toContain('Anchor needs a value, such as Center, Center, Center, not "" (Text)');
  });

  it('loops no round over an empty list or empty text, never the placeholder items', () => {
    const list = run(
      { command: 'variable', values: { name: 'Picked', value: '[=List()]' } },
      { command: 'for_each', values: { variable: 'I', list: '[Picked]' } },
      echo('[I]'),
      END,
      echo('Done'),
    );
    expect(list.error).toBeNull();
    expect(list.messages).toEqual(['Done']);
    const text = run(EMPTY, { command: 'for_each', values: { variable: 'I', list: '[Empty]' } }, echo('[I]'), END);
    expect(text.error).toBeNull();
    expect(text.messages).toEqual([]);
  });

  it('keeps empty text as a value where a field holds any value', () => {
    const result = run(
      EMPTY,
      { command: 'add_item', values: { value: '[Empty]', list: 'Names' } },
      echo('[Names.Count]'),
      echo('[Empty]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['1', '']);
  });

  it('keeps an optional field that comes out empty as not given', () => {
    const result = run(
      EMPTY,
      { command: 'filter_list', values: { list: '1, 2, 3', where: '', into: 'Kept' } },
      echo('[Kept.Count]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['3']);
  });

  it('checks only conditions and word fields with something typed', () => {
    const condition = { label: 'Condition', type: 'condition', default: '[I] > 2' };
    expect(solidScriptFieldEmptyChecked(condition, '')).toBe(false);
    expect(solidScriptFieldEmptyChecked(condition, '[A]')).toBe(true);
    expect(solidScriptFieldEmptyChecked({ label: 'Value', type: 'value' }, '[A]')).toBe(false);
    const words = { label: 'Side', type: 'text', words: [{ word: 'Left' }, { word: 'Right' }] };
    expect(solidScriptFieldEmptyChecked(words, '[A]')).toBe(true);
    expect(solidScriptFieldEmptyMessage(words)).toBe('Side needs Left or Right, not "" (Text)');
  });
});
