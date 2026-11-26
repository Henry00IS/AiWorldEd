import { describe, expect, it } from 'vitest';
import {
  solidScriptBlockCreate,
  solidScriptDocumentCreate,
  type SolidScriptDocument,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  SOLID_SCRIPT_FUNCTION_GROUPS,
} from '@/solid_script/language/solid_script_function_docs.js';
import {
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaOwnId,
} from '@/solid_script/commands/solid_script_formula_groups.js';
import type { SolidScriptFormulaContext } from '@/solid_script/commands/solid_script_formula_inputs.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';

/**
 * A script with a Function Henry, its Note above it, that calls itself, and a
 * Function Seed that takes nothing.
 *
 * @param name Name of the first Function.
 * @returns Script.
 */
function script(name = 'Henry'): SolidScriptDocument {
  const lines: SolidScriptLine[] = [
    { command: 'note', values: { text: 'Mixes two numbers.' } },
    { command: 'function', values: { name, parameters: 'A, B' } },
    { command: 'return', values: { value: `[=${name}([$Local.A] - 1, [$Local.B])]` } },
    { command: 'end' },
    { command: 'function', values: { name: 'Seed', parameters: '' } },
    { command: 'return', values: { value: '4' } },
    { command: 'end' },
  ];
  return solidScriptDocumentCreate(lines);
}

/**
 * Where a formula of the script is used: its Functions, as the names tell them.
 *
 * @param document Script.
 * @returns Context.
 */
function context(document: SolidScriptDocument): SolidScriptFormulaContext {
  return { functions: solidScriptDocumentNames(document).filter((entry) => entry.category === 'Functions') };
}

/**
 * Lists the function block labels of a catalog, in palette order.
 *
 * @param where Where the formula is used.
 * @returns Labels.
 */
function functions(where: SolidScriptFormulaContext): string[] {
  return solidScriptFormulaCatalog(where)
    .ofCategory('Functions')
    .map((command) => command.label);
}

/**
 * Reads a formula and writes the blocks again.
 *
 * @param text Formula.
 * @param where Where it is used.
 * @returns Command ids of the blocks and the formula written.
 */
function roundTrip(text: string, where: SolidScriptFormulaContext): { ids: string[]; text: string } {
  const blocks = solidScriptFormulaRead(text, where);
  const written = solidScriptFormulaWrite(blocks.document, blocks, where);
  return { ids: blocks.document.blocks.map((block) => block.command), text: 'text' in written ? written.text : '' };
}

describe('SolidScript formula blocks of the Functions of the script', () => {
  it('lists each Function among the built-in functions, sorted by name', () => {
    const labels = functions(context(script()));
    expect(labels).toContain('Henry');
    expect(labels).toContain('Seed');
    const around = ['Format Number', 'Hash', 'Henry', 'Hypot', 'Index Of'].filter((label) => labels.includes(label));
    expect(around).toContain('Henry');
    const at = around.map((label) => labels.indexOf(label));
    expect(at).toEqual([...at].sort((left, right) => left - right));
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });

  it('describes a Function from the Note above it, its inputs and what it gives', () => {
    const henry = solidScriptFormulaCatalog(context(script())).find(solidScriptFormulaOwnId('Henry'))!;
    expect(henry.description).toBe('Mixes two numbers');
    expect(henry.manual).toBe(
      'Mixes two numbers. Put a block inside for each of: A, B. Written as Henry(A, B) -> Any.',
    );
    const seed = solidScriptFormulaCatalog(context(script())).find(solidScriptFormulaOwnId('Seed'))!;
    expect(seed.description).toBe('A Function of this script');
    expect(seed.manual).toBe('A Function of this script. Written as Seed() -> Number.');
  });

  it('reads a call as its block holding a block per input, and writes it back the same', () => {
    const where = context(script());
    const read = roundTrip('Henry([a], 2) > Seed()', where);
    expect(read.ids).toEqual([
      'formula_more',
      solidScriptFormulaOwnId('Henry'),
      'formula_variable',
      'formula_number',
      'end',
      solidScriptFormulaOwnId('Seed'),
      'end',
      'end',
    ]);
    expect(read.text).toBe('Henry([a], 2) > Seed()');
    expect(roundTrip('henry(1, Henry(2, 3))', where).text).toBe('henry(1, Henry(2, 3))');
  });

  it('writes a dropped block as the call, and names the inputs it lacks', () => {
    const where = context(script());
    const catalog = solidScriptFormulaCatalog(where);
    const blocks = solidScriptFormulaRead('', where);
    const add = (command: string, values: Record<string, string> = {}) =>
      solidScriptBlockCreate(command, values, false, catalog);
    const henry = [add(solidScriptFormulaOwnId('Henry')), add('formula_number', { value: '1' })];
    const document = { ...blocks.document, blocks: [...henry, add('end')] };
    expect(solidScriptFormulaWrite(document, blocks, where)).toEqual({
      problem: 'Henry needs at least 2 parts.',
      line: 0,
    });
    document.blocks.splice(2, 0, add('formula_variable', { value: 'Size' }));
    expect(solidScriptFormulaWrite(document, blocks, where)).toMatchObject({ text: 'Henry(1, [Size])' });
  });

  it('follows a renamed or removed Function', () => {
    expect(functions(context(script('Henri')))).toContain('Henri');
    expect(functions(context(script('Henri')))).not.toContain('Henry');
    expect(functions({})).not.toContain('Henry');
    expect(roundTrip('Henry(1, 2)', {}).ids).toEqual(['formula_value']);
    expect(roundTrip('Henry(1, 2)', context(script('Henri'))).ids).toEqual(['formula_value']);
  });
});

describe('SolidScript formula function categories', () => {
  it('gives every built-in function a group, and its block that palette category', () => {
    const catalog = solidScriptFormulaCatalog();
    for (const [key, doc] of Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)) {
      expect(SOLID_SCRIPT_FUNCTION_GROUPS, key).toContain(doc.group);
      const block = catalog.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}${key}`);
      if (block) expect(block.category, key).toBe(doc.group);
    }
  });

  it('shows the function groups in the palette, Functions last for the rest and the script own Functions', () => {
    const catalog = solidScriptFormulaCatalog(context(script()));
    const counts = new Map<string, number>();
    for (const category of SOLID_SCRIPT_FORMULA_CATEGORIES)
      counts.set(category, catalog.commands.filter((command) => command.category === category).length);
    expect([...counts.keys()].slice(5)).toEqual([
      'Math',
      'Trigonometry',
      'Vector',
      'Text',
      'List',
      'Dictionary',
      'Curve',
      'Path',
      'Random',
      'Functions',
    ]);
    for (const group of ['Math', 'Trigonometry', 'Vector', 'Text', 'List', 'Path', 'Random'])
      expect(counts.get(group), group).toBeGreaterThan(2);
    expect(counts.get('Curve')).toBe(4);
    expect(catalog.find(solidScriptFormulaOwnId('Henry'))?.category).toBe('Functions');
    const calls = catalog.commands.filter((command) => /^formula_(fn|own)_/.test(command.id));
    expect(calls.filter((command) => !SOLID_SCRIPT_FORMULA_CATEGORIES.includes(command.category))).toEqual([]);
  });
});
