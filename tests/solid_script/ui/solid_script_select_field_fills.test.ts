import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptCommandFieldFills } from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNamesUnknown,
  solidScriptFieldEachFillWarning,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptSuggestions, solidScriptSuggestionContext } from '@/solid_script/ui/solid_script_suggestions.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';

/**
 * Returns a command, or throws when it is missing.
 *
 * @param id Command id.
 * @returns Command.
 */
function command(id: string) {
  const found = solidScriptCommandFind(id);
  if (!found) throw new Error(`${id} is missing`);
  return found;
}

/**
 * Returns a parameter of a command by key.
 *
 * @param id Command id.
 * @param key Field key.
 * @returns Parameter.
 */
function parameter(id: string, key: string) {
  const found = command(id).parameters.find((entry) => entry.key === key);
  if (!found) throw new Error(`${id} has no ${key} field`);
  return found;
}

/**
 * Suggestion labels a field offers after a leading bracket.
 *
 * @param id Command id.
 * @param key Field key.
 * @param values Stored values of the line.
 * @returns Labels.
 */
function labels(id: string, key: string, values: Readonly<Record<string, string>> = {}): string[] {
  return solidScriptSuggestions(solidScriptSuggestionContext('[', 1, false), {
    names: solidScriptDocumentNamesAt(solidScriptDocumentCreate([]), 0),
    extra: solidScriptCommandFieldFills(command(id), parameter(id, key), values),
    words: [],
  }).map((entry) => entry.label);
}

describe('SolidScript per-element fills stay in their field', () => {
  it.each([
    ['select_objects', '$Object'],
    ['select_faces', '$Face'],
    ['select_edges', '$Edge'],
    ['select_vertices', '$Vertex'],
  ] as const)('offers %s only in Where of %s', (id, fill) => {
    expect(labels(id, 'where')).toEqual(expect.arrayContaining([fill, '$Index']));
    expect(labels(id, 'of')).not.toContain(fill);
    expect(labels(id, 'of')).not.toContain('$Index');
    expect(labels(id, 'which')).not.toContain(fill);
    expect(labels(id, 'into')).not.toContain(fill);
    const values = { where: `[=[${fill}]]`, of: `[=[${fill}]]` };
    expect(solidScriptFieldEachFillWarning(command(id), parameter(id, 'where'), values, values.where)).toBe('');
    expect(solidScriptFieldEachFillWarning(command(id), parameter(id, 'of'), values, values.of)).toBe(
      `Of cannot use [${fill}]; it is only filled in Where.`,
    );
    const script = solidScriptDocumentCreate([
      { command: id, values: { which: 'All', where: `[=[${fill}]]` } },
      { command: id, values: { which: 'All', of: `[=[${fill}]]` } },
    ]);
    const unknown = solidScriptDocumentNamesUnknown(script);
    expect(unknown.get(0)?.size ?? 0).toBe(0);
    expect([...(unknown.get(1) ?? [])]).toContain(fill.toLowerCase());
  });

  it('offers $Item and $Index only in Where of Filter List', () => {
    expect(labels('filter_list', 'where')).toEqual(expect.arrayContaining(['$Item', '$Index']));
    expect(labels('filter_list', 'list')).not.toContain('$Item');
    expect(labels('filter_list', 'list')).not.toContain('$Index');
    expect(labels('filter_list', 'into')).not.toContain('$Item');
    const ofList = { list: '[=[$Item]]', where: '[=[$Item]]' };
    expect(
      solidScriptFieldEachFillWarning(command('filter_list'), parameter('filter_list', 'where'), ofList, ofList.where),
    ).toBe('');
    expect(
      solidScriptFieldEachFillWarning(command('filter_list'), parameter('filter_list', 'list'), ofList, ofList.list),
    ).toBe('List cannot use [$Item]; it is only filled in Where.');
    const script = solidScriptDocumentCreate([
      { command: 'filter_list', values: { list: '1, 2, 3', where: '[=[$Item] > 0]', into: 'Kept' } },
      { command: 'filter_list', values: { list: '[=[$Item]]', into: 'Kept' } },
    ]);
    const unknown = solidScriptDocumentNamesUnknown(script);
    expect(unknown.get(0)?.size ?? 0).toBe(0);
    expect([...(unknown.get(1) ?? [])]).toContain('$item');
  });

  it('still allows system lists such as $Selected in Of', () => {
    const of = '[$Selected.Objects]';
    expect(solidScriptFieldEachFillWarning(command('select_faces'), parameter('select_faces', 'of'), { of }, of)).toBe(
      '',
    );
    const script = solidScriptDocumentCreate([{ command: 'select_faces', values: { which: 'All', of } }]);
    expect(solidScriptDocumentNamesUnknown(script).size).toBe(0);
  });
});
