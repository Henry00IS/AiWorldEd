import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  SOLID_SCRIPT_FORMULA_CHECK,
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import {
  solidScriptFormulaCheckInputs,
  solidScriptFormulaCheckKeys,
} from '@/solid_script/commands/solid_script_formula_inputs.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionInputsLeast,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentCommandInsert } from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptEditorIcon } from '@/solid_script/ui/solid_script_editor_icons.js';

/**
 * Inputs that name what a function works on: the user picks them, no start
 * value fits.
 */
const SUBJECTS = new Set([
  'number',
  'value',
  'text',
  'list',
  'list or text',
  'text or list',
  'vector',
  'matrix',
  'points',
  'curve',
  'key',
  'table',
  'tags',
  'element',
  'first',
  'second',
  'fallback',
  'seconds',
  'part',
  'find',
  'with',
  'pattern',
  'index',
  'normal',
  'point',
]);

/**
 * Inserts a block into an empty formula and lists the blocks it brings.
 *
 * @param command Block id.
 * @param each Element the formula is worked out for.
 * @returns Command and values of each block.
 */
function inserted(command: string, each?: 'Face') {
  const catalog = solidScriptFormulaCatalog(each ? { each } : {});
  const empty = { ...solidScriptDocumentCreate([]), blocks: [] };
  const { document } = solidScriptDocumentCommandInsert(empty, command, 0, 'before', undefined, catalog);
  return document.blocks.map((block) => ({
    command: block.command,
    values: Object.fromEntries(
      Object.entries(block.values).map(([key, value]) => [
        key,
        value || catalog.find(block.command)?.parameters.find((field) => field.key === key)?.default || '',
      ]),
    ),
  }));
}

describe('formula blocks start with sensible values', () => {
  it('fills Min and Max of Random, the Probability of Chance, From and To of Spread', () => {
    const random = inserted(`${SOLID_SCRIPT_FORMULA_CHECK}random`, 'Face')[0]?.values;
    expect(random).toMatchObject({ min: '0', max: '1', id: '', seed: '' });
    expect(inserted(`${SOLID_SCRIPT_FORMULA_CHECK}chance`)[0]?.values).toMatchObject({ probability: '0.5' });
    expect(inserted(`${SOLID_SCRIPT_FORMULA_CHECK}spread`, 'Face')[0]?.values).toMatchObject({ from: '0', to: '1' });
    expect(inserted(`${SOLID_SCRIPT_FORMULA_CHECK}along`)[0]?.values).toMatchObject({
      point: '0, 0, 0',
      direction: '0, 1, 0',
      distance: '1',
    });
  });

  it('shows ID as [$Id] and Seed as 0 greyed, and Along starts at the face', () => {
    const random = solidScriptFormulaCheckInputs('random', { each: 'Face' });
    expect(random.find((input) => input.name === 'id')?.fallback).toBe('[$Id]');
    expect(random.find((input) => input.name === 'seed')?.default).toBe('0');
    const along = solidScriptFormulaCheckInputs('along', { each: 'Face' });
    expect(along.find((input) => input.name === 'point')?.fallback).toBe('[$Face.Center]');
    expect(along.find((input) => input.name === 'direction')?.fallback).toBe('[$Face.Normal]');
    expect(inserted(`${SOLID_SCRIPT_FORMULA_CHECK}along`, 'Face')[0]?.values).toMatchObject({
      point: '',
      distance: '1',
    });
  });

  it('puts a value block inside a function block for each input it needs', () => {
    expect(inserted(`${SOLID_SCRIPT_FORMULA_FUNCTION}lerp`)).toEqual([
      { command: `${SOLID_SCRIPT_FORMULA_FUNCTION}lerp`, values: {} },
      { command: 'formula_number', values: { value: '0' } },
      { command: 'formula_number', values: { value: '1' } },
      { command: 'formula_number', values: { value: '0.5' } },
      { command: 'end', values: {} },
    ]);
    expect(inserted(`${SOLID_SCRIPT_FORMULA_FUNCTION}clamp`).map((block) => block.values['value'])).toEqual([
      undefined,
      '',
      '0',
      '1',
      undefined,
    ]);
    expect(inserted(`${SOLID_SCRIPT_FORMULA_FUNCTION}rotate_vector`)[2]).toEqual({
      command: 'formula_vector',
      values: { value: '0, 1, 0' },
    });
    expect(inserted(`${SOLID_SCRIPT_FORMULA_FUNCTION}abs`)).toHaveLength(2);
  });

  it('gives every input a block needs a start value, unless it names what the block works on', () => {
    const missing: string[] = [];
    const keys = Object.keys(SOLID_SCRIPT_FUNCTION_DOCS);
    for (const key of keys) {
      const least = solidScriptFunctionInputsLeast(key);
      solidScriptFunctionArguments(key).forEach((argument, index) => {
        if (index >= least || argument.name === '...' || SUBJECTS.has(argument.name)) return;
        if (argument.type === 'Any') return;
        if ((argument.start ?? argument.default ?? '') === '') missing.push(`${key}.${argument.name}`);
      });
    }
    for (const key of solidScriptFormulaCheckKeys())
      for (const input of solidScriptFormulaCheckInputs(key, { each: 'Face' }))
        if (!input.optional && !SUBJECTS.has(input.name) && input.fallback === '' && input.start === '')
          missing.push(`${key}.${input.name}`);
    expect(missing).toEqual([]);
  });

  it('draws an icon for every palette group of the formula editor, Where too', () => {
    for (const category of SOLID_SCRIPT_FORMULA_CATEGORIES)
      expect(solidScriptEditorIcon(category).innerHTML, category).toMatch(/<(path|rect|circle)/);
  });
});
