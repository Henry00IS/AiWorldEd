import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_FORMULA_FUNCTION } from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptFunctionGroups } from '@/solid_script/language/solid_script_function_doc_groups.js';
import { SOLID_SCRIPT_FUNCTION_GROUPS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';

/** Functions listed in the Dictionary group. */
const DICTIONARY = ['dictionary', 'keys', 'values', 'is_dictionary', 'contains'];

describe('The Dictionary group of functions', () => {
  it('is a group of its own, right after List', () => {
    const groups: readonly string[] = SOLID_SCRIPT_FUNCTION_GROUPS;
    expect(groups.indexOf('Dictionary')).toBe(groups.indexOf('List') + 1);
  });

  it('gives Dictionary, Keys and Values their own group, and lists IsDictionary and Contains there too', () => {
    expect(solidScriptFunctionGroups('dictionary')).toEqual(['Dictionary']);
    expect(solidScriptFunctionGroups('keys')).toEqual(['Dictionary']);
    expect(solidScriptFunctionGroups('values')).toEqual(['Dictionary']);
    expect(solidScriptFunctionGroups('is_dictionary')).toEqual(['Checks', 'Dictionary']);
    expect([...solidScriptFunctionGroups('contains')].sort()).toEqual(['Dictionary', 'List', 'Text']);
    expect(solidScriptFunctionGroups('is_list')).toEqual(['Checks']);
  });

  it('shows every such function in the Dictionary group of the formula editor', () => {
    const ids = solidScriptFormulaCatalog()
      .ofCategory('Dictionary')
      .map((command) => command.id);
    const blocks = DICTIONARY.map((key) =>
      key === 'is_dictionary' ? `${SOLID_SCRIPT_FORMULA_CHECK}${key}` : `${SOLID_SCRIPT_FORMULA_FUNCTION}${key}`,
    );
    expect(ids.sort()).toEqual(blocks.sort());
  });

  it('has a Dictionary group in the reference', () => {
    const reference = solidScriptReference();
    const start = reference.indexOf(' Dictionary: ');
    const end = reference.indexOf('\n', start);
    expect(start).toBeGreaterThan(0);
    const group = reference
      .slice(start, end)
      .split(/\. (?:Math|Trigonometry|Vector|Text|List|Dictionary|Curve|Path|Random|Checks): /)[0];
    for (const usage of ['Dictionary(keys', 'Keys(dictionary', 'Values(dictionary', 'IsDictionary(value', 'Contains('])
      expect(group, usage).toContain(usage);
  });
});
