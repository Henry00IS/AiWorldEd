import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaCheckInputs } from '@/solid_script/commands/solid_script_formula_inputs.js';
import {
  SOLID_SCRIPT_WHERE_HELPER_KEYS,
  SOLID_SCRIPT_WHERE_HELPERS,
} from '@/solid_script/language/solid_script_where_helpers.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';

describe('SolidScript Where helpers', () => {
  it('shows the Where helpers first in the formula palette', () => {
    expect(SOLID_SCRIPT_FORMULA_CATEGORIES[0]).toBe('Where');
    const where = solidScriptFormulaCatalog({ each: 'Face' })
      .ofCategory('Where')
      .map((command) => command.label);
    expect(where).toEqual(expect.arrayContaining(['Facing', 'In Box', 'Near', 'Every Nth', 'Has Tag', 'Hits']));
  });

  it('declares every helper once, with its docs, and its per-item defaults', () => {
    expect(SOLID_SCRIPT_WHERE_HELPERS.map((helper) => helper.key)).toEqual([...SOLID_SCRIPT_WHERE_HELPER_KEYS]);
    for (const helper of SOLID_SCRIPT_WHERE_HELPERS) {
      expect(SOLID_SCRIPT_FUNCTION_DOCS[helper.key]?.group).toBe(helper.group);
      expect(SOLID_SCRIPT_FUNCTION_DOCS[helper.key]?.usage).toMatch(new RegExp(`^${helper.name}\\(`));
    }
    const index = solidScriptFormulaCheckInputs('every_nth', { each: 'Item' }).find((input) => input.name === 'index');
    expect(index?.fallback).toBe('[$Index]');
    expect(solidScriptFormulaCheckInputs('every_nth', {}).find((input) => input.name === 'index')?.fallback).toBe('');
  });
});
