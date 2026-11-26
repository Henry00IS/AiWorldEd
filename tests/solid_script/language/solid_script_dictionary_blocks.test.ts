import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { readFileSync } from 'node:fs';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

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
 * Makes an Add Entry line.
 *
 * @param key Key field.
 * @param value Value field.
 * @param dictionary Dictionary name, Prices unless given.
 * @returns Line.
 */
function add(key: string, value: string, dictionary = 'Prices'): SolidScriptLine {
  return line('add_entry', { key, value, dictionary });
}

/**
 * Makes a Remove Entry line.
 *
 * @param key Key field.
 * @param dictionary Dictionary name, Prices unless given.
 * @returns Line.
 */
function remove(key: string, dictionary = 'Prices'): SolidScriptLine {
  return line('remove_entry', { key, dictionary });
}

/**
 * Makes a Merge Dictionary line.
 *
 * @param from From field.
 * @param dictionary Into name.
 * @returns Line.
 */
function merge(from: string, dictionary = 'Prices'): SolidScriptLine {
  return line('merge_dictionary', { from, dictionary });
}

/**
 * Makes an Echo line.
 *
 * @param value Value field.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return line('echo', { value });
}

/**
 * Runs lines and returns what Echo wrote, or the error message.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function echoed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]));
  return result.error ? result.error.message : result.messages;
}

/**
 * Makes lines that fill a Dictionary with keys K0, K1 and so on.
 *
 * @param count How many keys.
 * @param dictionary Dictionary name.
 * @returns Lines that Repeat Add Entry.
 */
function filled(count: number, dictionary: string): SolidScriptLine[] {
  return [line('repeat', { counter: 'I', from: '0', to: String(count) }), add('K[I]', '[I]', dictionary), line('end')];
}

describe('SolidScript Dictionary blocks', () => {
  it('adds entries in order, replaces a key that is there and finds keys in any case', () => {
    expect(
      echoed(add('Wood', '5'), add('Stone', '7'), add('stone', '8'), echo('[Prices]'), echo('[Prices.Data.STONE]')),
    ).toEqual(['Wood: 5, stone: 8', '8']);
  });

  it('keeps a replaced key where it was', () => {
    expect(echoed(add('A', '1'), add('B', '2'), add('A', '3'), echo('[=Keys([Prices])]'))).toEqual(['[A, B]']);
  });

  it('makes the Dictionary when the name is new and is a Dictionary after', () => {
    expect(echoed(add('Wood', '5'), echo('[=IsDictionary([Prices])] [=Len(Keys([Prices]))]'))).toEqual(['Yes 1']);
  });

  it('uses the key a variable holds, in a Repeat', () => {
    expect(echoed(line('variable', { name: 'K', value: 'Glass' }), add('[K]', '12'), echo('[Prices.Glass]'))).toEqual([
      '12',
    ]);
    expect(echoed(...filled(3, 'Prices'), echo('[=Keys([Prices])] [Prices.K2]'))).toEqual(['[K0, K1, K2] 2']);
  });

  it('stores numbers, text, lists, vectors and Yes/No, and keeps them apart', () => {
    expect(
      echoed(
        add('Count', '4'),
        add('Label', 'Oak'),
        add('Sizes', '1, 2, 3'),
        add('Spot', '[=Vector(1, 2, 3)]'),
        add('On', 'true'),
        echo('[Prices.Count] [Prices.Label] [Prices.Sizes.Count] [Prices.Sizes(2)] [Prices.Spot.Y] [Prices.On]'),
      ),
    ).toEqual(['4 Oak 3 3 2 Yes']);
  });

  it('gives a Dictionary stored in another its own copy', () => {
    expect(
      echoed(add('A', '1', 'Inner'), add('Inner', '[Inner]'), add('B', '2', 'Inner'), echo('[Prices.Inner] | [Inner]')),
    ).toEqual(['A: 1 | A: 1, B: 2']);
  });

  it('stops with a clear message for a key that is not a name', () => {
    const message = 'cannot be a key; keys use letters, digits and _, not starting with a digit';
    for (const key of ['2nd', 'Wood 2', 'Wood-2', 'a.b', '1, 2']) expect(echoed(add(key, '5')), key).toContain(message);
    expect(echoed(add('2nd', '5'))).toBe(`line 1: Add Entry: "2nd" ${message}`);
  });

  it('stops for a key a variable holds that is a number or empty', () => {
    expect(echoed(line('variable', { name: 'K', value: '5' }), add('[K]', '1'))).toContain('"5" cannot be a key');
    expect(echoed(line('variable', { name: 'K', value: '' }), add('[K]', '1'))).toBe(
      'line 2: Add Entry needs a key, such as Wood',
    );
    expect(echoed(add('Wood', '1'), line('variable', { name: 'K', value: '' }), remove('[K]'))).toBe(
      'line 3: Remove Entry needs a key, such as Wood',
    );
  });

  it('stops for a name that holds something else, and tells how to make one', () => {
    expect(echoed(line('variable', { name: 'Prices', value: '5' }), add('Wood', '1'))).toBe(
      'line 2: [Prices] is a Number, not a Dictionary; make one with Make Dictionary Into Prices',
    );
    expect(echoed(line('add_item', { value: '1', list: 'Prices' }), remove('Wood'))).toContain('not a Dictionary');
    expect(echoed(line('variable', { name: 'Prices', value: 'Hello' }), merge('[Prices]', 'Prices'))).toContain(
      'needs a Dictionary in From',
    );
  });

  it('stops for names a line may not write', () => {
    expect(echoed(add('Wood', '1', 'Box.Size'))).toContain('can only be read');
    expect(echoed(add('Wood', '1', '$Time'))).toContain('system value');
    expect(echoed(add('Wood', '1', '[Prices]'))).toContain('write the name without brackets');
    expect(echoed(add('Wood', '1', '2nd'))).toContain('cannot name');
  });

  it('removes a key, ignores a key that is not there and can empty a Dictionary', () => {
    expect(
      echoed(add('Wood', '5'), add('Stone', '7'), remove('Wood'), echo('[Prices]'), echo('[Prices.Wood]')),
    ).toEqual(['Stone: 7', '']);
    expect(
      echoed(add('Wood', '5'), remove('Glass'), remove('WOOD'), remove('Wood'), echo('[=Len(Keys([Prices]))]')),
    ).toEqual(['0']);
    expect(echoed(add('A', '1'), remove('A'), add('A', '2'), echo('[Prices]'))).toEqual(['A: 2']);
  });

  it('stops when removing from a Dictionary that does not exist', () => {
    expect(echoed(remove('Wood'))).toBe(
      'line 1: there is no Dictionary [Prices]; make one with Make Dictionary or Add Entry',
    );
  });

  it('merges, with new values for shared keys and new keys last', () => {
    expect(
      echoed(
        add('Wood', '5'),
        add('Stone', '7'),
        add('Stone', '6', 'Extra'),
        add('Glass', '12', 'Extra'),
        merge('[Extra]'),
        echo('[Prices]'),
        echo('[Extra]'),
      ),
    ).toEqual(['Wood: 5, Stone: 6, Glass: 12', 'Stone: 6, Glass: 12']);
  });

  it('makes the Dictionary of Into as a copy when it is new', () => {
    expect(
      echoed(add('Wood', '5'), merge('[Prices]', 'Copy'), add('Gold', '1', 'Copy'), echo('[Prices] | [Copy]')),
    ).toEqual(['Wood: 5 | Wood: 5, Gold: 1']);
  });

  it('merges a Dictionary into itself and an empty one without change', () => {
    expect(echoed(add('A', '1'), merge('[Prices]'), echo('[Prices]'))).toEqual(['A: 1']);
    expect(
      echoed(line('make_dictionary', { into: 'Empty' }), add('A', '1'), merge('[Empty]'), echo('[Prices]')),
    ).toEqual(['A: 1']);
  });

  it('merges the .Data of a solid', () => {
    expect(
      echoed(
        line('cube', { into: 'Box' }),
        line('variable', { name: 'Box.Data.Heat', value: '4' }),
        merge('[Box.Data]'),
        echo('[Prices.Heat]'),
      ),
    ).toEqual(['4']);
  });

  it('stops when From is not a Dictionary', () => {
    expect(echoed(add('A', '1'), merge('5'))).toBe(
      'line 2: Merge Dictionary needs a Dictionary in From, such as [Extra], not 5',
    );
    expect(echoed(add('A', '1'), merge('1, 2, 3'))).toContain('needs a Dictionary in From');
    expect(echoed(add('A', '1'), merge('[Missing]'))).toContain('Missing');
  });

  it('keeps a Dictionary a Dictionary when Clear Variable empties it', () => {
    expect(
      echoed(
        add('Wood', '5'),
        line('clear_variable', { name: 'Prices' }),
        echo('[=IsDictionary([Prices])] [=Len(Keys([Prices]))]'),
        add('Gold', '1'),
        echo('[Prices]'),
      ),
    ).toEqual(['Yes 0', 'Gold: 1']);
  });

  it('loops over the keys of a Dictionary the blocks made', () => {
    expect(
      echoed(
        add('A', '1'),
        add('B', '2'),
        line('variable', { name: 'Sum', value: '0' }),
        line('for_each', { variable: 'V', list: '[Prices]', key: 'K' }),
        line('variable', { name: 'Sum', value: '[=[Sum] + [V]]' }),
        line('echo', { value: '[K]' }),
        line('end'),
        echo('[Sum]'),
      ),
    ).toEqual(['A', 'B', '3']);
  });

  it('works inside a Function on a Dictionary it is given', () => {
    expect(
      echoed(
        add('Wood', '5'),
        line('function', { name: 'Stock', parameters: 'd' }),
        add('Glass', '1', '$Local.d'),
        line('end'),
        line('call', { name: 'Stock', values: '[Prices]' }),
        echo('[Prices]'),
      ),
    ).toEqual(['Wood: 5, Glass: 1']);
  });

  it('handles a Dictionary of thousands of keys', () => {
    expect(echoed(...filled(5000, 'Big'), echo('[=Len(Keys([Big]))] [Big.K4999]'))).toEqual(['5000 4999']);
    expect(
      echoed(
        ...filled(3000, 'A'),
        ...filled(3000, 'B'),
        add('Extra', '1', 'B'),
        merge('[A]', 'B'),
        echo('[=Len(Keys([B]))]'),
      ),
    ).toEqual(['3001']);
    expect(
      echoed(
        ...filled(2000, 'Big'),
        line('repeat', { counter: 'I', from: '0', to: '2000' }),
        remove('K[I]', 'Big'),
        line('end'),
        echo('[=Len(Keys([Big]))]'),
      ),
    ).toEqual(['0']);
  });

  it('lists the lines in plain words', () => {
    const document = solidScriptDocumentCreate([add('Wood', '5'), remove('Wood'), merge('[Extra]')]);
    expect(solidScriptDocumentListing(document)).toEqual([
      "Add Entry Key 'Wood' Value '5' To 'Prices'",
      "Remove Entry Key 'Wood' From 'Prices'",
      "Merge Dictionary [Extra] Into 'Prices'",
    ]);
  });

  it('has the three blocks in the Data group, each with a manual and a way to stop', () => {
    for (const id of ['add_entry', 'remove_entry', 'merge_dictionary']) {
      const command = solidScriptCommandFind(id);
      expect(command?.category, id).toBe('Data');
      expect(command?.manual.length, id).toBeGreaterThan(80);
      expect(command?.stops.length, id).toBeGreaterThan(0);
    }
  });

  it('is written up in the reference and the documentation, with the fields each block takes', () => {
    const reference = solidScriptReference();
    const documentation = readFileSync('documentation/solidscript.md', 'utf8');
    for (const label of ['Add Entry', 'Remove Entry', 'Merge Dictionary']) {
      expect(reference, label).toContain(label);
      expect(documentation, label).toContain(label);
    }
    expect(reference).toMatch(/- dictionary \([^\n]*The variable it names gives Dictionary\./);
  });
});
