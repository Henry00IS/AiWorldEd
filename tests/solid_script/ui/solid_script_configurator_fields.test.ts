import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNamesAt,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';

/**
 * Returns the Variable field of the Set command.
 *
 * @returns Parameter.
 */
function setVariableParameter(): SolidScriptCommandParameter {
  const parameter = solidScriptCommandFind('variable')?.parameters.find((entry) => entry.key === 'name');
  if (parameter === undefined) throw new Error('Set has no Variable field');
  return parameter;
}

/**
 * Checks a text typed into the Variable field of Set.
 *
 * @param text Typed text.
 * @returns Problem the field shows, or an empty string.
 */
function setVariableProblem(text: string): string {
  return solidScriptConfiguratorFieldBuild(setVariableParameter(), text, () => {}).problem();
}

describe('SolidScript configurator Set Variable field', () => {
  it('accepts a value under .Data, also through members and items', () => {
    for (const text of [
      'Face.Data.Height',
      'Brush.Edges.Data.Anything',
      'Brush.Faces(0).Edges.Data.Kind',
      'Edge.Parent.Data.Kind',
      'Sides(0).Data.[Key]',
    ])
      expect(setVariableProblem(text), text).toBe('');
  });

  it('still refuses members that can only be read', () => {
    expect(setVariableProblem('Face.UVs')).toBe('');
    expect(setVariableProblem('Brush.Edges')).toMatch(/Brush\.Edges can only be read/);
    expect(setVariableProblem('Face.Centre')).toMatch(/Face\.Centre can only be read/);
    expect(setVariableProblem('Brush.Edges.Data')).toMatch(/Brush\.Edges\.Data needs a key to set/);
  });
});

/**
 * Builds a script and returns the names its line at a position sees.
 *
 * @param lines Script lines.
 * @param position Index of the line the field belongs to.
 * @returns Names.
 */
function namesAt(lines: SolidScriptLine[], position: number): SolidScriptName[] {
  return solidScriptDocumentNamesAt(solidScriptDocumentCreate(lines), position);
}

/**
 * Puts a field of a command on the page, types text into it with the caret at
 * the end and returns the suggestions listed.
 *
 * @param command Command id.
 * @param key Field key.
 * @param names Names the line sees.
 * @param text Typed text.
 * @returns The field's input and the labels of the suggestions shown.
 */
function typedSuggestions(
  command: string,
  key: string,
  names: readonly SolidScriptName[],
  text: string,
): { input: HTMLInputElement; shown: string[] } {
  const parameter = solidScriptCommandFind(command)?.parameters.find((entry) => entry.key === key);
  if (parameter === undefined) throw new Error(`${command} has no ${key} field`);
  const field = solidScriptConfiguratorFieldBuild(parameter, '', () => {}, { names, extra: [] });
  document.body.append(field.element);
  const input = field.element.querySelector<HTMLInputElement>('input[type="text"]');
  if (input === null) throw new Error('the field has no text input');
  input.focus();
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  input.dispatchEvent(new Event('input'));
  const shown = [...document.querySelectorAll('[role="option"]')].map(
    (row) => row.firstElementChild?.textContent ?? '',
  );
  return { input, shown };
}

/** Line that builds a brush into the variable Brush. */
const CUBE_INTO_BRUSH = { command: 'cube', values: { size: '2, 2, 2', into: 'Brush' } };

/** Lines setting a few variables of the script, an Input and a Function. */
const SCRIPT_WITH_NAMES: SolidScriptLine[] = [
  { command: 'input', values: { name: 'Wide', type: 'Number', value: '1' } },
  { command: 'variable', values: { name: 'Width', value: '3' } },
  { command: 'variable', values: { name: 'Window', value: '2' } },
  CUBE_INTO_BRUSH,
  { command: 'function', values: { name: 'Wiggle', parameters: '' } },
  { command: 'end', values: {} },
];

describe('SolidScript configurator suggestions in fields naming a variable', () => {
  afterEach(() => document.body.replaceChildren());

  it('offers the variables of the script starting with what Set Variable has typed, bare', () => {
    const names = namesAt(SCRIPT_WITH_NAMES, SCRIPT_WITH_NAMES.length);
    const variables = names
      .filter((entry) => entry.category === 'Variables' && entry.name.toLowerCase().startsWith('wi'))
      .map((entry) => entry.name);
    expect(variables.length).toBeGreaterThan(1);
    const { shown } = typedSuggestions('variable', 'name', names, 'Wi');
    expect(shown).toEqual(expect.arrayContaining(variables));
    expect(shown.some((label) => label.startsWith('['))).toBe(false);
    expect(shown).not.toContain('Wide');
    expect(shown).not.toContain('Wiggle');
  });

  it('offers only the writable $Selected lists among the system values in Set Variable', () => {
    const { shown } = typedSuggestions('variable', 'name', namesAt(SCRIPT_WITH_NAMES, 0), '$');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((label) => /^\$Selected\./.test(label))).toBe(true);
  });

  it('offers Data and the members that give elements after Brush. and Brush.Edges.', () => {
    const names = namesAt([CUBE_INTO_BRUSH], 1);
    const brush = typedSuggestions('variable', 'name', names, 'Brush.').shown;
    expect(brush).toEqual(expect.arrayContaining(['Brush.Edges', 'Brush.Faces', 'Brush.Data']));
    expect(brush).not.toContain('Brush.Centre');
    document.body.replaceChildren();
    const edges = typedSuggestions('variable', 'name', names, 'Brush.Edges.').shown;
    expect(edges).toContain('Brush.Edges.Data');
    expect(edges).not.toContain('Brush.Edges.Count');
  });

  it('offers .X, .Y and .Z of a vector variable, and no keys under .Data the script does not know', () => {
    const lines: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'Pos', value: '1, 2, 3' } },
      CUBE_INTO_BRUSH,
    ];
    const names = namesAt(lines, lines.length);
    expect(typedSuggestions('variable', 'name', names, 'Pos.').shown).toEqual(['Pos.X', 'Pos.Y', 'Pos.Z']);
    document.body.replaceChildren();
    expect(typedSuggestions('variable', 'name', names, 'Brush.Data.').shown).toEqual([]);
  });

  it('writes a picked member as the whole field, so the next dot goes on from it', () => {
    const { input, shown } = typedSuggestions('variable', 'name', namesAt([CUBE_INTO_BRUSH], 1), 'Brush.Ed');
    expect(shown).toEqual(['Brush.Edges']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input.value).toBe('Brush.Edges');
  });

  it('offers the variables of the script in an Into field, without system values or functions', () => {
    const names = namesAt(SCRIPT_WITH_NAMES, SCRIPT_WITH_NAMES.length);
    const variables = names.filter((entry) => entry.category === 'Variables').map((entry) => entry.name);
    const { shown } = typedSuggestions('sphere', 'into', names, '');
    expect(shown).toEqual(expect.arrayContaining(variables));
    expect(shown.some((label) => label.startsWith('$'))).toBe(false);
    expect(shown).not.toContain('Wiggle');
    expect(shown).not.toContain('Wide');
  });
});
