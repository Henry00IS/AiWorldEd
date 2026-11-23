import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindOf } from '@/solid_script/language/solid_script_kinds.js';
import { SolidScriptDictionary } from '@/solid_script/language/solid_script_value.js';

/**
 * Runs lines and returns what Echo printed, or the error.
 *
 * @param lines Lines.
 * @returns Messages, or the error message.
 */
function printed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? result.error.message : result.messages;
}

/**
 * Echoes a value.
 *
 * @param value Value field.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

/**
 * Sets a variable.
 *
 * @param name Name.
 * @param value Value field.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return { command: 'variable', values: { name, value } };
}

/** Makes Prices with Wood 5 and Stone 7. */
const PRICES: SolidScriptLine = {
  command: 'make_dictionary',
  values: { into: 'Prices', keys: 'Wood, Stone', values: '5, 7' },
};

describe('Dictionary', () => {
  it('builds one with Make Dictionary and reads it like .Data', () => {
    expect(printed(PRICES, echo('[Prices.Data.Wood]'), echo('[Prices.Stone]'), echo('[Prices]'))).toEqual([
      '5',
      '7',
      'Wood: 5, Stone: 7',
    ]);
  });

  it('makes an empty one with Make Dictionary and no keys', () => {
    expect(printed({ command: 'make_dictionary', values: { into: 'Bag' } }, echo('[=Len(Keys([Bag]))]'))).toEqual([
      '0',
    ]);
  });

  it('writes, adds and reads values with a typed or a worked out key', () => {
    expect(
      printed(
        PRICES,
        set('Prices.Data.Wood', '9'),
        set('K', 'Glass'),
        set('Prices.Data.[K]', '12'),
        echo('[Prices.Data.[K]]'),
        echo('[Prices]'),
      ),
    ).toEqual(['12', 'Wood: 9, Stone: 7, Glass: 12']);
  });

  it('says a dictionary is one', () => {
    expect(printed(PRICES, echo('[=IsDictionary([Prices])] [=IsDictionary(5)]'))).toEqual(['Yes No']);
  });

  it('copies a dictionary when it is set to another name', () => {
    expect(printed(PRICES, set('Copy', '[Prices]'), set('Copy.Data.Wood', '1'), echo('[Prices.Wood]'))).toEqual(['5']);
  });

  it('gives its keys and values, finds a key and builds one with the Dictionary function', () => {
    expect(
      printed(
        set('D', '[=Dictionary(List("a", "b"), List(1, 2))]'),
        echo('[=Keys([D])]'),
        echo('[=Values([D])]'),
        echo('[=Contains([D], "b")]'),
        echo('[=Contains([D], "c")]'),
      ),
    ).toEqual(['[a, b]', '[1, 2]', 'Yes', 'No']);
  });

  it('stops on keys and values of different lengths', () => {
    expect(printed(set('D', '[=Dictionary(List("a"), List(1, 2))]'))).toContain('Dictionary(keys, values)');
  });

  it('loops over it with For Each and Key', () => {
    expect(
      printed(
        PRICES,
        { command: 'for_each', values: { variable: 'Price', list: '[Prices]', key: 'Item' } },
        echo('[Item] costs [Price]'),
        { command: 'end' },
      ),
    ).toEqual(['Wood costs 5', 'Stone costs 7']);
  });

  it('removes and renames keys with Remove Data and Rename Data', () => {
    expect(
      printed(
        PRICES,
        { command: 'remove_data', values: { key: 'Wood', of: '[Prices]' } },
        { command: 'rename_data', values: { key: 'Stone', to: 'Rock', of: '[Prices]' } },
        echo('[Prices]'),
      ),
    ).toEqual(['Rock: 7']);
  });

  it('reads the keys of the .Data of geometry too', () => {
    expect(
      printed(
        { command: 'cube', values: { size: '2, 2, 2', into: 'Box' } },
        set('Box.Data.Heat', '4'),
        echo('[=Keys([Box.Data])]'),
        echo('[=IsDictionary([Box.Data])]'),
      ),
    ).toEqual(['[Heat]', 'Yes']);
  });

  it('is named Dictionary', () => {
    expect(solidScriptKindOf(new SolidScriptDictionary())).toBe('Dictionary');
  });
});
