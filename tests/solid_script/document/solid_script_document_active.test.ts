import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
  solidScriptDocumentNamesUnknown,
  solidScriptDocumentOrigins,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentActiveLines } from '@/solid_script/document/solid_script_document_active.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

/**
 * Builds a line that is turned off.
 *
 * @param command Command id.
 * @param values Field texts.
 * @returns Off line.
 */
const off = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values, off: true });

/**
 * Henry's script: every line that names Width, Height, Item, Fat or Thickness
 * is off, then a Cube writes Henry and an Echo reads it.
 */
const HENRY_LINES: SolidScriptLine[] = [
  off('variable', { name: 'Width', value: '5,3,7', type: 'Number List' }),
  off('add_item', { value: '78', list: 'Width' }),
  off('variable', { name: 'Height', value: '2' }),
  off('remove_item', { target: 'Width()' }),
  off('for_each', { variable: 'Item', list: '[Width]' }),
  off('end'),
  off('function', { name: 'Fat', parameters: 'Thickness' }),
  off('return', { value: '[Local.Thickness]' }),
  off('end'),
  { command: 'cube', values: { into: 'Henry' } },
  { command: 'echo', values: { value: '[Henry]' } },
];

/** Names only the off lines of Henry's script give. */
const HENRY_OFF_NAMES = ['Width', 'Height', 'Item', 'Fat', 'Thickness', 'Local.Thickness'];

describe('SolidScript lines turned off in the static checks', () => {
  const document = solidScriptDocumentCreate(HENRY_LINES);
  const echoLine = HENRY_LINES.length - 1;

  it('lists only the lines that are on', () => {
    const active = solidScriptDocumentActiveLines(document.blocks).map((entry) => entry.line);
    expect(active).toEqual(HENRY_LINES.flatMap((entry, line) => (entry.off === true ? [] : [line])));
  });

  it('leaves the names of off lines out of every list of names', () => {
    const names = [...solidScriptDocumentNames(document), ...solidScriptDocumentNamesAt(document, echoLine)].map(
      (entry) => entry.name,
    );
    expect(names).toContain('Henry');
    for (const name of HENRY_OFF_NAMES) expect(names).not.toContain(name);
    expect([...solidScriptDocumentOrigins(document).keys()]).toEqual([]);
  });

  it('suggests Henry, system values and functions after [, but nothing only off lines define', () => {
    const scope = { names: solidScriptDocumentNamesAt(document, echoLine), extra: [], words: [] };
    const shown = solidScriptSuggestions(solidScriptSuggestionContext('[', 1, false), scope).map(
      (entry) => entry.label,
    );
    expect(shown).toContain('Henry');
    expect(shown.some((label) => label.startsWith('$'))).toBe(true);
    for (const name of HENRY_OFF_NAMES) expect(shown).not.toContain(name);
  });

  it('squiggles a name that only an off line sets', () => {
    const lines: SolidScriptLine[] = [...HENRY_LINES, { command: 'echo', values: { value: '[Width]' } }];
    const unknown = solidScriptDocumentNamesUnknown(solidScriptDocumentCreate(lines));
    expect([...(unknown.get(lines.length - 1) ?? [])]).toEqual(['width']);
  });

  it('still counts the lines inside a block whose own line is off', () => {
    const lines: SolidScriptLine[] = [
      off('if', { condition: '1 == 2' }),
      { command: 'variable', values: { name: 'Inside', value: '1' } },
      off('end'),
    ];
    expect(solidScriptDocumentNames(solidScriptDocumentCreate(lines)).map((entry) => entry.name)).toEqual(['Inside']);
  });
});
