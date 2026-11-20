import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  SOLID_SCRIPT_FORMULA_COMMAND,
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaGroupOf } from '@/solid_script/commands/solid_script_formula_groups.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';

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
    const blocks = formula.ofCategory('Functions');
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
});
