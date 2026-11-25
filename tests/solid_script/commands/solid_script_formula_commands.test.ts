import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  SOLID_SCRIPT_FORMULA_CHECK,
  SOLID_SCRIPT_FORMULA_LEAVES,
  SOLID_SCRIPT_FORMULA_COMMAND,
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaGroupOf } from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptFormulaCheckInputs } from '@/solid_script/commands/solid_script_formula_inputs.js';
import { solidScriptParameterPlaceholder } from '@/solid_script/commands/solid_script_parameter_default.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFormulaTyped } from '@/solid_script/language/solid_script_formula_field.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** Wording that tells a default in words instead of showing it greyed. */
const LEFT_OFF_WORDING = /left off|leave off|left empty|leave empty|if empty/i;

/**
 * Examples a field hint gives, such as 2 and 0.5 from "such as 2 or 0.5".
 *
 * @param hint Field hint.
 * @returns Examples.
 */
function hintExamples(hint: string): string[] {
  const found = [...hint.matchAll(/(?:such as|usually) (.+?)(?= for |;|\.\s|\.$|$)/g)];
  return found.flatMap((match) => (match[1] ?? '').split(' or '));
}

/**
 * Formula blocks with fields, each field with the kind its text is typed as.
 *
 * @returns Block id, field and kind.
 */
function formulaFields() {
  const formula = solidScriptFormulaCatalog();
  return formula.commands.flatMap((command) =>
    command.parameters.map((parameter) => {
      const inputs = solidScriptFormulaCheckInputs(command.id.slice(SOLID_SCRIPT_FORMULA_CHECK.length), {});
      const kind =
        inputs.find((input) => input.name === parameter.key)?.kind ??
        SOLID_SCRIPT_FORMULA_LEAVES.find((leaf) => leaf.id === command.id)?.kind ??
        'any';
      return { command, parameter, kind };
    }),
  );
}

/**
 * Runs a formula through Echo with a few variables set, and tells its error.
 *
 * @param formula Formula.
 * @returns Error, or empty.
 */
function evaluateError(formula: string): string {
  const set = (name: string, value: string) => ({ command: 'variable', values: { name, value } });
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      set('Width', '2'),
      set('Spot', '0, 0, 0'),
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube' },
    ]),
  );
  return result.error?.message ?? '';
}

describe('SolidScript formula commands', () => {
  it('keeps formula blocks out of the script editor, and script commands out of the formula editor', () => {
    const formula = solidScriptFormulaCatalog();
    for (const category of SOLID_SCRIPT_FORMULA_CATEGORIES)
      expect(SOLID_SCRIPT_COMMAND_CATALOG.ofCategory(category)).toEqual([]);
    expect(SOLID_SCRIPT_COMMAND_CATALOG.find(SOLID_SCRIPT_FORMULA_COMMAND.and)).toBeUndefined();
    expect(formula.find('cube')).toBeUndefined();
    expect(formula.name).not.toBe(SOLID_SCRIPT_COMMAND_CATALOG.name);
    expect(formula.categories).toEqual(SOLID_SCRIPT_FORMULA_CATEGORIES);
  });

  it('has a value block of each kind, an operator block per operator and Groups for logic', () => {
    const formula = solidScriptFormulaCatalog();
    expect(formula.ofCategory('Values').map((command) => command.label)).toEqual([
      'Expression',
      'List',
      'Number',
      'Text',
      'Variable',
      'Vector',
    ]);
    expect(formula.ofCategory('Groups').map((command) => command.label)).toEqual([
      'And',
      'Else',
      'If',
      'Not',
      'Or',
      'Then',
    ]);
    expect(formula.ofCategory('Operators').map((command) => command.label)).toContain('Equals');
    expect(formula.ofCategory('Operators')).toHaveLength(13);
  });

  it('has a block for every function that takes inputs, and none for checks', () => {
    const formula = solidScriptFormulaCatalog();
    const keys = Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)
      .filter(([, doc]) => doc.group !== 'Checks')
      .map(([key]) => key);
    const blocks = formula.commands.filter((command) => command.id.startsWith(SOLID_SCRIPT_FORMULA_FUNCTION));
    expect(blocks.length).toBeGreaterThan(50);
    for (const block of blocks) expect(keys).toContain(block.id.slice(SOLID_SCRIPT_FORMULA_FUNCTION.length));
    expect(formula.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}abs`)?.label).toBe('Absolute');
    expect(formula.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}in_box`)).toBeUndefined();
    expect(solidScriptFormulaGroupOf(`${SOLID_SCRIPT_FORMULA_FUNCTION}max`)?.max).toBe(Number.POSITIVE_INFINITY);
    expect(solidScriptFormulaGroupOf(`${SOLID_SCRIPT_FORMULA_FUNCTION}clamp`)?.max).toBe(3);
  });

  it('describes every block in plain words with an example, and never runs one', () => {
    for (const command of solidScriptFormulaCatalog({ each: 'Face' }).commands) {
      if (command.id === 'end' || command.id === 'blank') continue;
      expect(command.description, command.id).not.toBe('');
      expect(command.manual, command.id).not.toBe('');
      expect(`${command.label} ${command.description}`).not.toMatch(/\bShape\b/);
      expect(command.runs, command.id).toBe(false);
    }
    expect(solidScriptFormulaCatalog().find(SOLID_SCRIPT_FORMULA_COMMAND.vector)?.description).toMatch(/such as/);
  });

  it('opens operators and functions as groups closed by End, values and checks as single lines', () => {
    const formula = solidScriptFormulaCatalog();
    expect(formula.find('formula_equals')?.nesting).toBe('open');
    expect(formula.find(`${SOLID_SCRIPT_FORMULA_FUNCTION}abs`)?.nesting).toBe('open');
    expect(formula.find(SOLID_SCRIPT_FORMULA_COMMAND.then)?.nesting).toBe('continue');
    expect(formula.find(SOLID_SCRIPT_FORMULA_COMMAND.number)?.nesting).toBe('none');
    expect(formula.find('formula_check_in_box')?.nesting).toBe('none');
  });

  it('shows the element as a placeholder only where the formula is worked out per element', () => {
    const point = (each?: 'Face') =>
      solidScriptFormulaCatalog(each ? { each } : {})
        .find('formula_check_in_box')
        ?.parameters.find((field) => field.key === 'point');
    expect(point('Face')?.placeholder).toBe('[$Face.Center]');
    expect(point('Face')?.optional).toBe(true);
    expect(point()?.placeholder).toBeUndefined();
    expect(point()?.optional).toBeFalsy();
    expect(solidScriptFormulaCatalog({ each: 'Face' })).toBe(solidScriptFormulaCatalog({ each: 'Face' }));
  });

  it('refuses a value that is no formula, naming the field', () => {
    const number = solidScriptFormulaCatalog().find(SOLID_SCRIPT_FORMULA_COMMAND.number)!;
    expect(number.check?.({ value: '5, 2, 7' })).toBe('');
    expect(number.check?.({ value: '[a] +' })).toMatch(/^Number: /);
    const inBox = solidScriptFormulaCatalog().find('formula_check_in_box')!;
    expect(inBox.check?.({ point: '', center: '0, 0, 0', size: '1' })).toMatch(/Point needs a value/);
  });
});

describe('SolidScript formula block listings', () => {
  it('quotes and colours every value the way script lines do, a lone variable as a variable', () => {
    const formula = solidScriptFormulaCatalog();
    for (const category of SOLID_SCRIPT_FORMULA_CATEGORIES)
      for (const command of formula.ofCategory(category)) {
        const values = Object.fromEntries(command.parameters.map((field) => [field.key, '7']));
        const parts = command.listing(values);
        for (const part of parts.filter((piece) => piece.text.includes('7')))
          expect([command.id, part.kind, part.text]).toEqual([command.id, 'value', "'7'"]);
      }
    const kinds = (id: string, value: string) =>
      formula
        .find(id)
        ?.listing({ value })
        .filter((part) => part.text.trim() !== '')
        .map((part) => [part.kind, part.text]);
    expect(kinds(SOLID_SCRIPT_FORMULA_COMMAND.number, '0.5')).toEqual([
      ['name', 'Number'],
      ['value', "'0.5'"],
    ]);
    expect(kinds(SOLID_SCRIPT_FORMULA_COMMAND.variable, '$NY')).toEqual([
      ['name', 'Variable'],
      ['variable', '[$NY]'],
    ]);
    expect(kinds(SOLID_SCRIPT_FORMULA_COMMAND.text, 'Top')).toEqual([
      ['name', 'Text'],
      ['value', "'Top'"],
    ]);
  });

  it('gives every formula block field a hint with an example typed in its own field form, and no default in words', () => {
    let examples = 0;
    for (const { command, parameter, kind } of formulaFields()) {
      const where = `${command.label} ${parameter.label}`;
      expect(parameter.hint, where).not.toMatch(LEFT_OFF_WORDING);
      expect(`${command.description} ${command.manual}`, where).not.toMatch(LEFT_OFF_WORDING);
      expect(parameter.hint, where).not.toMatch(/Vector\(/);
      expect(parameter.hint, where).not.toMatch(/\[-?[\d.]+,/);
      for (const example of hintExamples(parameter.hint)) {
        examples++;
        const filled = Object.fromEntries(
          command.parameters.map((field) => [field.key, hintExamples(field.hint)[0] ?? '1']),
        );
        expect(command.check?.({ ...filled, [parameter.key]: example }), `${where}: ${example}`).toBe('');
        if (!example.includes('$') && !example.includes('[Wall]'))
          expect(evaluateError(solidScriptFormulaTyped(kind, example)), `${where}: ${example}`).toBe('');
      }
    }
    expect(examples).toBeGreaterThan(20);
    const facing = solidScriptFormulaCatalog().find(`${SOLID_SCRIPT_FORMULA_CHECK}facing`);
    expect(facing?.parameters[1]?.hint).toBe('Direction it should face, such as 0, 1, 0 for up.');
  });

  it('shows the default of every formula block field that has one greyed in the empty field', () => {
    const shown = formulaFields()
      .map(({ command, parameter }) => [
        `${command.label} ${parameter.label}`,
        solidScriptParameterPlaceholder(parameter),
      ])
      .filter(([, placeholder]) => placeholder !== '');
    expect(shown).toEqual([
      ['Facing Direction', '0, 1, 0'],
      ['Facing Within', '30'],
      ['In Box Center', '0, 0, 0'],
      ['In Box Size', '1, 1, 1'],
      ['Near Target', '0, 0, 0'],
      ['Near Distance', '1'],
      ['Every Nth Step', '2'],
      ['Every Nth Start', '0'],
      ['Has Tag Name', 'Top'],
      ['Hits How', 'Touching'],
      ['Chance Probability', '0.5'],
      ['Chance ID', '0'],
      ['Chance Seed', '0'],
      ['Random Min', '0'],
      ['Random Max', '1'],
      ['Random ID', '0'],
      ['Random Seed', '0'],
      ['Random Whole Number Min', '1'],
      ['Random Whole Number Max', '3'],
      ['Random Whole Number ID', '0'],
      ['Random Whole Number Seed', '0'],
      ['Random Direction ID', '0'],
      ['Random Direction Seed', '0'],
      ['Random Rotation ID', '0'],
      ['Random Rotation Seed', '0'],
      ['Spread From', '0'],
      ['Spread To', '1'],
      ['Along Point', '0, 0, 0'],
      ['Along Direction', '0, 1, 0'],
      ['Along Distance', '1'],
      ['Xor A', 'true'],
      ['Xor B', 'false'],
      ['Remap Axes Vectors', '1, 2, 3'],
      ['Remap Axes X', 'X'],
      ['Remap Axes Y', 'Y'],
      ['Remap Axes Z', 'Z'],
      ['Curve Profile Height', '1'],
      ['Curve Profile Depth', '0.2'],
      ['Curve Profile Side', 'Normal'],
      ['Curve Profile Segments', '16'],
      ['Hits Box Center', '0, 0, 0'],
      ['Hits Box Size', '1'],
      ['Hits Box How', 'Touching'],
    ]);
  });
});
