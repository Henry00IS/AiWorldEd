import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptRotationFromDegrees } from '@/solid_script/language/solid_script_functions_rotation.js';
import {
  SolidScriptDictionary,
  solidScriptValueText,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';
import {
  solidScriptPersistentValueRead,
  solidScriptPersistentValueWrite,
} from '@/solid_script/language/persistent/solid_script_persistent_codec.js';

/**
 * Runs a button handler and returns the stored persistent record, or the error.
 *
 * @param lines Lines inside the When Button Pressed block, then a Cube.
 * @param persistent Values already stored.
 * @returns Stored record, or the error message.
 */
function press(lines: SolidScriptLine[], persistent: Record<string, unknown> = {}): Record<string, unknown> | string {
  const script = solidScriptDocumentCreate([
    { command: 'input', values: { name: 'Add', type: 'Button' } },
    { command: 'when_button_pressed', values: { name: 'Add' } },
    ...lines,
    { command: 'end' },
    { command: 'cube', values: {} },
  ]);
  const handled = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {}, persistent);
  return handled.error ? handled.error.message : handled.persistent;
}

/**
 * Echoes a persistent value from a stored record.
 *
 * @param formula Formula, such as [$Persistent.Note].
 * @param persistent Stored record.
 * @returns Printed text, or the error.
 */
function echo(formula: string, persistent: Record<string, unknown>): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: formula } },
      { command: 'cube', values: {} },
    ]),
    { persistent },
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/**
 * Writes a value and reads it back through the codec.
 *
 * @param value Value to keep.
 * @returns Value after the round trip.
 */
function roundTrip(value: SolidScriptValue): SolidScriptValue | undefined {
  return solidScriptPersistentValueRead(solidScriptPersistentValueWrite(value, '$Persistent.Value'));
}

describe('SolidScript persistent value codec', () => {
  it('round-trips numbers, Yes or No, and text with quotes and newlines', () => {
    expect(roundTrip(7)).toBe(7);
    expect(roundTrip(true)).toBe(true);
    expect(roundTrip(false)).toBe(false);
    const text = 'He said "hello"\nand then goodbye';
    expect(roundTrip(text)).toBe(text);
    const stored = press([
      {
        command: 'variable',
        values: {
          name: '$Persistent.Note',
          value: '[=Str("He said $"hello$"", [$Text.NewLine], "and then goodbye")]',
        },
      },
    ]);
    expect(stored).toEqual({ note: text });
    expect(echo('[$Persistent.Note]', stored as Record<string, unknown>)).toBe(text);
  });

  it('round-trips text that holds Solid Script $[ escapes', () => {
    const text = 'Say $[Hi] and $$5';
    expect(roundTrip(text)).toBe(text);
    const stored = press([
      {
        command: 'variable',
        values: { name: '$Persistent.Note', value: '[="Say $$$[Hi$] and $$$$5"]' },
      },
    ]);
    expect(stored).toEqual({ note: text });
    expect(echo('[$Persistent.Note]', stored as Record<string, unknown>)).toBe(text);
    const prices = press([
      { command: 'add_entry', values: { dictionary: '$Persistent.Prices', key: 'Label', value: '[="Say $$$[Hi$]"]' } },
    ]);
    expect(echo('[$Persistent.Prices.Label]', prices as Record<string, unknown>)).toBe('Say $[Hi]');
  });

  it('round-trips a Dictionary, a nested Dictionary and a list of Dictionaries', () => {
    const prices = press([
      {
        command: 'make_dictionary',
        values: { into: '$Persistent.Prices', keys: 'Wood, Stone', values: '5, 7' },
      },
    ]);
    expect(prices).toEqual({
      prices: {
        kind: 'dictionary',
        entries: [
          { name: 'Wood', value: 5 },
          { name: 'Stone', value: 7 },
        ],
      },
    });
    expect(echo('[$Persistent.Prices]', prices as Record<string, unknown>)).toBe('Wood: 5, Stone: 7');
    expect(echo('[$Persistent.Prices.Wood]', prices as Record<string, unknown>)).toBe('5');

    const nested = press([
      { command: 'make_dictionary', values: { into: 'Inner', keys: 'A', values: '1' } },
      { command: 'make_dictionary', values: { into: '$Persistent.Bag', keys: 'Inner', values: '[Inner]' } },
    ]);
    expect(echo('[$Persistent.Bag.Inner.A]', nested as Record<string, unknown>)).toBe('1');

    const listed = press([
      { command: 'make_dictionary', values: { into: 'First', keys: 'N', values: '1' } },
      { command: 'make_dictionary', values: { into: 'Second', keys: 'N', values: '2' } },
      { command: 'variable', values: { name: '$Persistent.Bags', value: '[=List([First], [Second])]' } },
    ]);
    expect(echo('[=[$Persistent.Bags(0).N]]', listed as Record<string, unknown>)).toBe('1');
    expect(echo('[=[$Persistent.Bags(1).N]]', listed as Record<string, unknown>)).toBe('2');
  });

  it('round-trips a Rotation as its degrees', () => {
    const stored = press([
      { command: 'variable', values: { name: '$Persistent.Turn', value: '[=Rotation(0, 90, 0)]' } },
    ]);
    expect(stored).toEqual({ turn: { kind: 'rotation', degrees: [0, 90, 0] } });
    expect(echo('[=RotationDegrees([$Persistent.Turn])]', stored as Record<string, unknown>)).toBe('[0, 90, 0]');
    const again = roundTrip(solidScriptRotationFromDegrees([10, 20, 30]));
    expect(solidScriptValueText(again)).toBe('Rotation(10, 20, 30)');
  });

  it('keeps a .Data write on a persistent Dictionary', () => {
    const first = press([
      { command: 'make_dictionary', values: { into: '$Persistent.Prices', keys: 'Wood', values: '5' } },
    ]);
    const second = press(
      [{ command: 'variable', values: { name: '$Persistent.Prices.Data.Wood', value: '9' } }],
      first as Record<string, unknown>,
    );
    expect(echo('[$Persistent.Prices.Wood]', second as Record<string, unknown>)).toBe('9');
  });

  it('says a solid, a Path and a list of solids cannot be kept between runs', () => {
    const held = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { into: 'Box' } },
        { command: 'variable', values: { name: '$Persistent.Held', value: '[Box]' } },
      ]),
    );
    expect(held.error?.message).toMatch(
      /\[\$Persistent\.Held\] can't be kept between runs, because it is a Solid\. Keep a number, text, Yes or No, a list, a Dictionary or a Rotation instead/,
    );
    const listed = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { into: 'Box' } },
        { command: 'variable', values: { name: '$Persistent.Held', value: '[=List([Box])]' } },
      ]),
    );
    expect(listed.error?.message).toMatch(/because it holds a Solid/);
    const path = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'square', values: { into: 'Outline' } },
        { command: 'variable', values: { name: '$Persistent.Held', value: '[Outline]' } },
      ]),
    );
    expect(path.error?.message).toMatch(/because it is a Path/);
  });

  it('encodes a Dictionary with an empty key list and reads it back empty', () => {
    const empty = new SolidScriptDictionary();
    const back = roundTrip(empty);
    expect(back).toBeInstanceOf(SolidScriptDictionary);
    expect(solidScriptValueText(back)).toBe('');
  });

  it('round-trips Add Entry, Remove Entry and Merge Dictionary on a persistent Dictionary', () => {
    const made = press([
      { command: 'add_entry', values: { dictionary: '$Persistent.Prices', key: 'Wood', value: '5' } },
      { command: 'add_entry', values: { dictionary: '$Persistent.Prices', key: 'Stone', value: '7' } },
    ]);
    expect(made).toEqual({
      prices: {
        kind: 'dictionary',
        entries: [
          { name: 'Wood', value: 5 },
          { name: 'Stone', value: 7 },
        ],
      },
    });
    expect(echo('[$Persistent.Prices]', made as Record<string, unknown>)).toBe('Wood: 5, Stone: 7');
    const added = press(
      [{ command: 'add_entry', values: { dictionary: '$Persistent.Prices', key: 'Glass', value: '12' } }],
      made as Record<string, unknown>,
    );
    expect(echo('[$Persistent.Prices.Glass]', added as Record<string, unknown>)).toBe('12');
    const removed = press(
      [{ command: 'remove_entry', values: { dictionary: '$Persistent.Prices', key: 'Wood' } }],
      added as Record<string, unknown>,
    );
    expect(echo('[$Persistent.Prices]', removed as Record<string, unknown>)).toBe('Stone: 7, Glass: 12');
    const merged = press(
      [
        { command: 'add_entry', values: { dictionary: 'Extra', key: 'Stone', value: '9' } },
        { command: 'add_entry', values: { dictionary: 'Extra', key: 'Gold', value: '3' } },
        { command: 'merge_dictionary', values: { dictionary: '$Persistent.Prices', from: '[Extra]' } },
      ],
      removed as Record<string, unknown>,
    );
    expect(echo('[$Persistent.Prices]', merged as Record<string, unknown>)).toBe('Stone: 9, Glass: 12, Gold: 3');
  });

  it('clears a persistent Dictionary to one with no keys, and still keeps it', () => {
    const first = press([
      { command: 'add_entry', values: { dictionary: '$Persistent.Prices', key: 'Wood', value: '5' } },
    ]);
    const cleared = press(
      [{ command: 'clear_variable', values: { name: '$Persistent.Prices' } }],
      first as Record<string, unknown>,
    );
    expect(cleared).toEqual({ prices: { kind: 'dictionary', entries: [] } });
    expect(
      echo(
        '[=IsDictionary([$Persistent.Prices])] [=Len(Keys([$Persistent.Prices]))]',
        cleared as Record<string, unknown>,
      ),
    ).toBe('Yes 0');
  });
});
