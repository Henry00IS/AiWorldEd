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
import {
  SOLID_SCRIPT_EDITOR_CLASSES,
  SOLID_SCRIPT_EDITOR_EACH_COLOR,
  solidScriptEditorStylesheetEnsure,
} from '@/solid_script/ui/solid_script_editor_css.js';
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
  it('declares Where of Select Faces as per face for every Which', () => {
    const where = parameter('select_faces', 'where');
    expect(where.each).toBe('Face');
    expect(solidScriptParameterEachActive(where, { which: 'All' })).toBe('Face');
    expect(solidScriptParameterEachActive(where, { which: 'Facing Up' })).toBe('Face');
    expect(solidScriptParameterEachActive(where, { which: 'Between' })).toBe('Face');
  });

  it('declares Distance of Displace as per vertex, and Where of Select Vertices and Select Edges as per item', () => {
    expect(parameter('displace', 'distance').each).toBe('Vertex');
    expect(solidScriptParameterEachActive(parameter('displace', 'distance'), {})).toBe('Vertex');
    const where = parameter('select_vertices', 'where');
    expect(where.each).toBe('Vertex');
    expect(solidScriptParameterEachActive(where, { which: 'All' })).toBe('Vertex');
    expect(solidScriptParameterEachActive(where, { which: 'Between' })).toBe('Vertex');
    expect(parameter('select_edges', 'where').each).toBe('Edge');
    expect(parameter('select_brushes', 'where').each).toBe('Brush');
  });

  it('lists the current-element fills, including short forms, and recognises them for autocomplete', () => {
    expect(solidScriptParameterEachFills('Face')).toEqual(expect.arrayContaining(['$Face', '$Index', '$CX', '$NZ']));
    expect(solidScriptParameterEachFills('Vertex')).toEqual(expect.arrayContaining(['$Vertex', '$Index', '$X', '$NZ']));
    expect(solidScriptSystemFillEach('$Face')).toBe(true);
    expect(solidScriptSystemFillEach('$x')).toBe(true);
    expect(solidScriptSystemFillEach('$Selected.Faces')).toBe(false);
  });

  it('marks the Where condition in the script listing, and leaves an unused Where unmarked', () => {
    const command = solidScriptCommandFind('select_faces');
    if (!command) throw new Error('Select Faces is missing');
    const where = command.listing({ which: 'All', where: '[=[$Face.Area] > 1]' });
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

  it('declares Where of Filter List as per item, with $Item and $Index', () => {
    const where = parameter('filter_list', 'where');
    expect(where.each).toBe('Item');
    expect(solidScriptParameterEachActive(where, {})).toBe('Item');
    expect(solidScriptParameterEachFills('Item')).toEqual(['$Item', '$Index']);
    const command = solidScriptCommandFind('filter_list');
    if (!command) throw new Error('Filter List is missing');
    expect(solidScriptCommandEachFills(command, {})).toEqual(expect.arrayContaining(['$Item', '$Index']));
    const listed = command.listing({ list: '[Heights]', where: '[=[$Item] > 2]', into: 'Tall' });
    expect(listed.filter((part) => part.each)).toEqual(
      expect.arrayContaining([expect.objectContaining({ each: true, text: expect.stringContaining('$Item') })]),
    );
  });
});

describe('SolidScript per-element field chrome', () => {
  it('marks the textbox with green caps and does not outline the whole field', () => {
    solidScriptEditorStylesheetEnsure();
    const css = document.getElementById('solid-script-editor-stylesheet')?.textContent ?? '';
    expect(css).not.toMatch(/\.solid-script-editor-field-each\s*\{[^}]*outline\s*:/);
    expect(css).toContain('.solid-script-editor-field-each .solid-script-editor-field-inputs::before');
    expect(css).toContain('.solid-script-editor-field-each .solid-script-editor-field-inputs::after');
    expect(css).toContain(SOLID_SCRIPT_EDITOR_EACH_COLOR);
    const field = solidScriptConfiguratorFieldBuild(parameter('select_faces', 'where'), '', () => {});
    field.element.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.fieldEach);
    const inputs = field.element.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldInputs}`);
    const label = field.element.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel}`);
    const hint = field.element.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldHint}`);
    expect(inputs?.parentElement).toBe(field.element);
    expect(label?.parentElement).toBe(field.element);
    expect(hint?.parentElement).toBe(field.element);
    expect(inputs?.contains(label)).toBe(false);
    expect(inputs?.contains(hint)).toBe(false);
  });
});
