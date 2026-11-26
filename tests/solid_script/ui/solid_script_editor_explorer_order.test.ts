import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_NAME_CATEGORIES } from '@/solid_script/document/solid_script_document_names.js';
import type { SolidScriptVariable } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';
import { SOLID_SCRIPT_SYSTEM_FILLS } from '@/solid_script/language/solid_script_system_names.js';
import {
  solidScriptExplorerEntries,
  type SolidScriptExplorerEntry,
} from '@/solid_script/ui/solid_script_editor_explorer.js';
import { solidScriptExplorerContextEntries } from '@/solid_script/ui/solid_script_editor_explorer_context.js';

/**
 * Builds a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
const set = (name: string, value: string): SolidScriptLine => ({ command: 'variable', values: { name, value } });

/**
 * Builds a plain variable as a run reports it.
 *
 * @param name Name as stored.
 * @param value Value text.
 * @returns Variable.
 */
const variable = (name: string, value: string): SolidScriptVariable => ({ name, value, type: 'Number', items: [] });

/**
 * Sorts names the way people read them: by letter, ignoring case and a leading
 * $.
 *
 * @param names Names.
 * @returns Sorted copy.
 */
function alphabetical(names: readonly string[]): string[] {
  const key = (name: string): string => name.replace(/^\$/, '').toLowerCase();
  return [...names].sort((left, right) => (key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0));
}

/**
 * Lists the names of one category, in the order the explorer shows them.
 *
 * @param entries Entries.
 * @param category Category.
 * @returns Names.
 */
function namesIn(entries: readonly SolidScriptExplorerEntry[], category: string): string[] {
  return entries.filter((entry) => entry.category === category).map((entry) => entry.name);
}

/** A script with names set out of letter order, a list and a kept value. */
const SCRIPT = solidScriptDocumentCreate([
  set('Zeta', '1'),
  set('alpha', '2'),
  set('Beta', '3'),
  set('$Persistent.Page', '1'),
  set('$Persistent.Count', '2'),
  { command: 'cube', values: {} },
]);

describe('variable explorer order', () => {
  it('keeps the categories in their order and sorts each one by letter, ignoring case and $', () => {
    const entries = solidScriptExplorerEntries(SCRIPT, [], []);
    const order = entries.map((entry) => SOLID_SCRIPT_NAME_CATEGORIES.indexOf(entry.category));
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(namesIn(entries, 'Variables')).toEqual(['alpha', 'Beta', 'Zeta']);
    expect(namesIn(entries, 'Persistent')).toEqual(['$Persistent.Count', '$Persistent.Page']);
    const system = namesIn(entries, 'System');
    expect(system).toEqual(alphabetical(system));
  });

  it('sorts what a focused line can read the same way', () => {
    const entries = solidScriptExplorerContextEntries(SCRIPT, 5, null);
    const order = entries.map((entry) => SOLID_SCRIPT_NAME_CATEGORIES.indexOf(entry.category));
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(namesIn(entries, 'Variables')).toEqual(['alpha', 'Beta', 'Zeta']);
    expect(namesIn(entries, 'System')).toEqual(alphabetical(namesIn(entries, 'System')));
  });
});

describe('System lists every system variable', () => {
  it('equals every selected list, built-in value and fill, plus $Local, $Persistent and $Resource', () => {
    const expected = [
      ...SOLID_SCRIPT_SYSTEM_LISTED.map(([name]) => name),
      ...Object.keys(SOLID_SCRIPT_SYSTEM_FILLS),
      '$Local',
      '$Persistent',
      '$Resource',
    ];
    const system = namesIn(solidScriptExplorerEntries(solidScriptDocumentCreate([]), [], []), 'System');
    expect(system).toEqual(alphabetical(expected));
    for (const name of ['$Face', '$Edge', '$Vertex', '$Local', '$Persistent']) expect(system).toContain(name);
  });

  it('shows $Local and $Persistent with a placeholder when they hold nothing', () => {
    const system = solidScriptExplorerEntries(solidScriptDocumentCreate([]), [], []);
    const local = system.find((entry) => entry.name === '$Local');
    const kept = system.find((entry) => entry.name === '$Persistent');
    expect(local).toMatchObject({ value: 'Only Inside a Function', items: [], placeholder: true });
    expect(kept).toMatchObject({ value: 'No Values Yet', items: [], placeholder: true });
    expect(system.find((entry) => entry.name === '$Face')).toMatchObject({ placeholder: true });
  });

  it('opens $Persistent and $Local to their current names, sorted', () => {
    const entries = solidScriptExplorerEntries(
      SCRIPT,
      [variable('$Persistent.Page', '1'), variable('$Persistent.Count', '2')],
      [{ name: 'Twice()', line: 3, locals: [variable('$Local.Y', '8'), variable('$Local.X', '4')] }],
    );
    const kept = entries.find((entry) => entry.name === '$Persistent');
    const local = entries.find((entry) => entry.name === '$Local');
    expect(kept?.items.map((item) => item.name)).toEqual(['$Persistent.Count', '$Persistent.Page']);
    expect(kept).toMatchObject({ value: '2 Values', members: true });
    expect(kept?.placeholder).toBeFalsy();
    expect(local?.items.map((item) => `${item.name}=${item.value}`)).toEqual(['$Local.X=4', '$Local.Y=8']);
  });
});
