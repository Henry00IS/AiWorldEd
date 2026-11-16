import { describe, expect, it } from 'vitest';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

const CUBE: SolidScriptLine = { command: 'cube' };

/**
 * Makes a line.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Runs lines and returns what Echo wrote.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function echoed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]));
  return result.error ? result.error.message : result.messages;
}

describe('SolidScript list blocks', () => {
  it('adds, inserts, removes, finds, sorts and reverses items', () => {
    expect(
      echoed(
        line('add_item', { value: '5', list: 'h' }),
        line('add_item', { value: '2', list: 'h' }),
        line('add_item', { value: '9', list: 'h' }),
        line('insert_item', { value: '7', list: 'h', at: '1' }),
        line('echo', { value: '[h]' }),
        line('sort_list', { list: 'h' }),
        line('echo', { value: '[h]' }),
        line('sort_list', { list: 'h', descending: 'true' }),
        line('echo', { value: '[h]' }),
        line('reverse_list', { list: 'h' }),
        line('find_item', { value: '7', list: 'h', result: 'at' }),
        line('echo', { value: '[at] [h().count]' }),
        line('remove_value', { value: '7', list: 'h' }),
        line('find_item', { value: '7', list: 'h', result: 'at' }),
        line('echo', { value: '[at] [h]' }),
      ),
    ).toEqual(['[5, 7, 2, 9]', '[2, 5, 7, 9]', '[9, 7, 5, 2]', '2 4', '-1 [2, 5, 9]']);
  });

  it('sorts words from A to Z after numbers and removes every copy when asked', () => {
    expect(
      echoed(
        line('variable', { name: 'w', value: 'pear' }),
        line('add_item', { value: 'pear', list: 'l' }),
        line('add_item', { value: 'apple', list: 'l' }),
        line('add_item', { value: '3', list: 'l' }),
        line('add_item', { value: 'pear', list: 'l' }),
        line('sort_list', { list: 'l' }),
        line('echo', { value: '[l]' }),
        line('remove_value', { value: '[w]', list: 'l', every: 'true' }),
        line('echo', { value: '[l]' }),
      ),
    ).toEqual(['[3, apple, pear, pear]', '[3, apple]']);
  });

  it('empties and forgets variables', () => {
    expect(
      echoed(
        line('add_item', { value: '1', list: 'l' }),
        line('variable', { name: 'n', value: '4' }),
        line('clear_variable', { name: 'l' }),
        line('clear_variable', { name: 'n' }),
        line('echo', { value: '[l().count] <[n]>' }),
        line('delete_variable', { name: 'n' }),
        line('echo', { value: '[n]' }),
      ),
    ).toMatch(/line 7: .*there is no variable \[n\]/);
  });

  it('stops with plain words', () => {
    expect(echoed(line('sort_list', { list: 'nope' }))).toMatch(/there is no list \[nope\]; make one with Add Item/);
    expect(echoed(line('variable', { name: 'n', value: '4' }), line('reverse_list', { list: 'n' }))).toMatch(
      /\[n\] is Whole Number, not a list/,
    );
    expect(echoed(line('add_item', { value: '1', list: 'l' }), line('insert_item', { list: 'l', at: '5' }))).toMatch(
      /Position needs a whole number from 0 to 1/,
    );
    expect(echoed(line('delete_variable', { name: 'ghost' }))).toMatch(/there is no variable \[ghost\] to delete/);
  });

  it('writes list lines in plain words', () => {
    const listing = solidScriptDocumentListing(
      solidScriptDocumentCreate([
        line('add_item', { value: '5', list: 'heights' }),
        line('insert_item', { value: '4', list: 'heights', at: '1' }),
        line('remove_value', { value: 'red', list: 'colors', every: 'true' }),
        line('find_item', { value: 'blue', list: 'colors', result: 'where' }),
        line('sort_list', { list: 'heights', descending: 'true' }),
        line('reverse_list', { list: 'heights' }),
        line('clear_variable', { name: 'heights' }),
        line('delete_variable', { name: 'step' }),
      ]),
    );
    expect(listing).toEqual([
      "Add Item  '5' to heights",
      "Insert Item  '4' into heights at '1'",
      "Remove Value  'red' from colors (Every Copy)",
      "Find Item  'blue' in colors, result in [where]",
      'Sort List  heights (Biggest First)',
      'Reverse List  heights',
      'Clear Variable  [heights]',
      'Delete Variable  [step]',
    ]);
  });
});

describe('SolidScript persistent values', () => {
  const script = solidScriptDocumentCreate([
    line('input', { name: 'Add', type: 'button' }),
    line('when_button_pressed', { name: 'Add' }),
    line('if', { condition: 'is_undef([persistent.count])' }),
    line('variable', { name: 'persistent.count', value: '0' }),
    { command: 'end' },
    line('variable', { name: 'persistent.count', value: '[=[persistent.count] + 1]' }),
    line('add_item', { value: '[persistent.count]', list: 'persistent.history' }),
    { command: 'end' },
    line('repeat', { variable: 'i', from: '1', to: '[persistent.count]' }),
    line('cube'),
    { command: 'end' },
  ]);

  it('keeps values a button press sets as hidden stored inputs', () => {
    const first = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {});
    expect(first.error).toBeNull();
    expect(first.inputs).toEqual({ 'persistent.count': '1', 'persistent.history': '[1]' });
    const second = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, first.inputs);
    expect(second.inputs).toEqual({ 'persistent.count': '2', 'persistent.history': '[1,2]' });
    const built = solidScriptProgramRun(script, { inputs: second.inputs });
    expect(built.error).toBeNull();
    expect(JSON.stringify(built.shapes).match(/"kind":"solid"/g)).toHaveLength(2);
  });

  it('lets the build read but not store them, and reads a missing value as nothing', () => {
    const build = solidScriptDocumentCreate([
      line('variable', { name: 'persistent.x', value: '3' }),
      line('echo', { value: '[persistent.x]' }),
      CUBE,
    ]);
    expect(solidScriptProgramRun(build).messages).toEqual(['3']);
    const missing = solidScriptProgramRun(solidScriptDocumentCreate([line('echo', { value: '[persistent.y]' }), CUBE]));
    expect(missing.error).toBeNull();
    expect(missing.messages).toEqual(['undef']);
  });

  it('forgets a stored value a handler deletes', () => {
    const forget = solidScriptDocumentCreate([
      line('input', { name: 'Reset', type: 'button' }),
      line('when_button_pressed', { name: 'Reset' }),
      line('delete_variable', { name: 'persistent.count' }),
      { command: 'end' },
      CUBE,
    ]);
    const handled = solidScriptProgramHandle(forget, { kind: 'button', name: 'Reset' }, { 'persistent.count': '4' });
    expect(handled.error).toBeNull();
    expect(handled.removed).toEqual(['persistent.count']);
  });
});
