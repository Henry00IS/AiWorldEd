import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_COMMAND_EACH_ICON,
  solidScriptCommandEachFills,
  solidScriptParameterEachActive,
  solidScriptParameterEachFills,
  solidScriptSystemFillEach,
} from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';
import { solidScriptSuggestions, solidScriptSuggestionContext } from '@/solid_script/ui/solid_script_suggestions.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/**
 * Returns a parameter of a command by key.
 *
 * @param id Command id.
 * @param key Field key.
 * @returns Parameter.
 */
function parameter(id: string, key: string) {
  const found = solidScriptCommandFind(id)?.parameters.find((entry) => entry.key === key);
  if (!found) throw new Error(`${id} has no ${key} field`);
  return found;
}

describe('SolidScript per-element fields', () => {
  it('declares Detail of Select Faces as per face only when Which is Where', () => {
    const detail = parameter('select_faces', 'detail');
    expect(detail.each).toBe('Face');
    expect(solidScriptParameterEachActive(detail, { which: 'Where' })).toBe('Face');
    expect(solidScriptParameterEachActive(detail, { which: 'All' })).toBeUndefined();
    expect(solidScriptParameterEachActive(detail, { which: 'Facing Up' })).toBeUndefined();
  });

  it('declares Distance of Displace as per vertex, and Detail of Select Vertices as per vertex when Which is Where', () => {
    expect(parameter('displace', 'distance').each).toBe('Vertex');
    expect(solidScriptParameterEachActive(parameter('displace', 'distance'), {})).toBe('Vertex');
    const detail = parameter('select_vertices', 'detail');
    expect(detail.each).toBe('Vertex');
    expect(solidScriptParameterEachActive(detail, { which: 'Where' })).toBe('Vertex');
    expect(solidScriptParameterEachActive(detail, { which: 'All' })).toBeUndefined();
    expect(parameter('select_edges', 'detail').each).toBe('Edge');
  });

  it('lists the current-element fills, including short forms, and recognises them for autocomplete', () => {
    expect(solidScriptParameterEachFills('Face')).toEqual(expect.arrayContaining(['$Face', '$Index', '$CX', '$NZ']));
    expect(solidScriptParameterEachFills('Vertex')).toEqual(expect.arrayContaining(['$Vertex', '$Index', '$X', '$NZ']));
    expect(solidScriptSystemFillEach('$Face')).toBe(true);
    expect(solidScriptSystemFillEach('$x')).toBe(true);
    expect(solidScriptSystemFillEach('$Selected.Faces')).toBe(false);
  });

  it('marks the Where condition in the script listing, and leaves other Detail values unmarked', () => {
    const command = solidScriptCommandFind('select_faces');
    if (!command) throw new Error('Select Faces is missing');
    const where = command.listing({ which: 'Where', detail: '[=[$Face.Area] > 1]' });
    expect(where.filter((part) => part.each)).toEqual(
      expect.arrayContaining([expect.objectContaining({ each: true, text: expect.stringContaining('$Face.Area') })]),
    );
    const all = command.listing({ which: 'All' });
    expect(all.some((part) => part.each)).toBe(false);
    const displace = solidScriptCommandFind('displace');
    if (!displace) throw new Error('Displace is missing');
    expect(displace.listing({ distance: '[=[$X]]' }).some((part) => part.each)).toBe(true);
  });

  it('puts the per-element icon on the Distance field and on $Vertex suggestions', () => {
    const field = solidScriptConfiguratorFieldBuild(parameter('displace', 'distance'), '[=[$X]]', () => {});
    expect(field.element.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldEachIcon}`)?.textContent).toBe(
      SOLID_SCRIPT_COMMAND_EACH_ICON,
    );
    const command = solidScriptCommandFind('displace');
    if (!command) throw new Error('Displace is missing');
    const labels = solidScriptSuggestions(solidScriptSuggestionContext('[', 1, false), {
      names: solidScriptDocumentNamesAt(solidScriptDocumentCreate([]), 0),
      extra: command.fills,
      words: [],
    });
    const index = labels.find((entry) => entry.label === '$Index');
    expect(index?.each).toBe(true);
    expect(labels.find((entry) => entry.label === '$X')?.each).toBe(true);
  });

  it('marks Value of Set as per vertex only when Variable is a Position write', () => {
    const value = parameter('variable', 'value');
    expect(value.each).toBe('Vertex');
    expect(solidScriptParameterEachActive(value, { name: '$Selected.Vertices.Positions' })).toBe('Vertex');
    expect(solidScriptParameterEachActive(value, { name: 'Vertex.Position' })).toBe('Vertex');
    expect(solidScriptParameterEachActive(value, { name: 'Width' })).toBeUndefined();
    const command = solidScriptCommandFind('variable');
    if (!command) throw new Error('Set is missing');
    const listed = command.listing({ name: '$Selected.Vertices.Positions', value: '[=[$Vertex.Position]]' });
    expect(listed.some((part) => part.each)).toBe(true);
    expect(command.listing({ name: 'Width', value: '1' }).some((part) => part.each)).toBe(false);
    expect(solidScriptCommandEachFills(command, { name: '$Selected.Vertices.Positions' })).toEqual(
      expect.arrayContaining(['$Vertex', '$Index', '$X']),
    );
    expect(solidScriptCommandEachFills(command, { name: 'Width' })).not.toEqual(expect.arrayContaining(['$Vertex']));
  });
});
