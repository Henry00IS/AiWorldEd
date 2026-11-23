import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_FORMULA_FUNCTION } from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptFunctionGroups } from '@/solid_script/language/solid_script_function_doc_groups.js';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';

/**
 * Works out one formula with Echo.
 *
 * @param formula Formula without the [= ].
 * @returns What Echo printed, or the error.
 */
function echoed(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'echo', values: { value: `[=${formula}]` } }]),
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

/** Functions that take a list or a text in the same input. */
const BOTH = ['len', 'slice', 'reversed', 'contains'];

describe('Functions that work on lists and on text', () => {
  it('finds an item in a list with Contains, and a piece of text as before', () => {
    expect(echoed('Contains(List(1, 2, 3), 2)')).toBe('Yes');
    expect(echoed('Contains(List("a", "b"), "c")')).toBe('No');
    expect(echoed('Contains([[1, 2], [3, 4]], [3, 4])')).toBe('Yes');
    expect(echoed('Contains("hello", "ell")')).toBe('Yes');
    expect(echoed('Contains("hello", "x")')).toBe('No');
  });

  it('lists every such function in both the List and the Text group of the formula editor', () => {
    const catalog = solidScriptFormulaCatalog();
    for (const group of ['List', 'Text'] as const) {
      const ids = catalog.ofCategory(group).map((command) => command.id);
      for (const key of BOTH) expect(ids, `${key} in ${group}`).toContain(`${SOLID_SCRIPT_FORMULA_FUNCTION}${key}`);
    }
  });

  it('gives each such function both groups, and the reference lists it under both', () => {
    for (const key of BOTH) expect([...solidScriptFunctionGroups(key)].sort(), key).toEqual(['List', 'Text']);
    expect(solidScriptFunctionGroups('uppercase')).toEqual(['Text']);
    const listed = solidScriptReference().split('Contains(list or text: ').length - 1;
    expect(listed).toBe(2);
  });
});
