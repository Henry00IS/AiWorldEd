import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';
import { SolidScriptFormulaWindow } from '@/solid_script/ui/solid_script_formula_window.js';

afterEach(() => document.body.replaceChildren());

/**
 * Evaluates a Solid Script formula after optional setup lines.
 *
 * @param formula Formula without [= ].
 * @param setup Extra lines before Echo.
 * @returns Evaluated text or error message.
 */
function runFormula(formula: string, setup: readonly SolidScriptLine[] = []): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...setup, { command: 'echo', values: { value: `[=${formula}]` } }]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('RemapAxes', () => {
  it('remaps vector lists with arbitrary axis order and duplicates', () => {
    const setup: SolidScriptLine[] = [
      { command: 'variable', values: { name: 'VecList', value: '[=[[1, 2, 3], [4, 5, 6]]]' } },
    ];
    expect(runFormula('RemapAxes([VecList], "X", "Z", "Y")', setup)).toBe('[[1, 3, 2], [4, 6, 5]]');
    expect(runFormula('RemapAxes([VecList], "X", "Z", "Z")', setup)).toBe('[[1, 3, 3], [4, 6, 6]]');
  });

  it('supports negated axes, lowercase, 2D vectors, empty lists, and optional defaults', () => {
    expect(runFormula('RemapAxes([[1, 2, 3], [0, 4, 5]], "x", "z", "-y")')).toBe('[[1, 3, -2], [0, 5, -4]]');
    expect(runFormula('RemapAxes([[0, 2, 3]], "-X", "-Z", "-Y")')).toBe('[[0, -3, -2]]');
    expect(runFormula('RemapAxes([[1, 2], [3, 4]], "X", "Z", "-Y")')).toBe('[[1, 0, -2], [3, 0, -4]]');
    expect(runFormula('RemapAxes(List(), "X", "Z", "Y")')).toBe('[]');
    expect(runFormula('RemapAxes([1, 2, 3])')).toBe('[1, 2, 3]');
    expect(runFormula('RemapAxes([1, 2, 3], "Z")')).toBe('[3, 2, 3]');
  });

  it('accepts a single vector as well as a Path value', () => {
    expect(runFormula('RemapAxes(Vector(1, 2, 3), "X", "Z", "Y")')).toBe('[1, 3, 2]');
    expect(runFormula('RemapAxes(Vector(2, 5), "X", "Z", "Y")')).toBe('[2, 0, 5]');
    const pathSetup: SolidScriptLine[] = [{ command: 'square', values: { size: '2, 2', into: 'Rect' } }];
    expect(runFormula('RemapAxes([Rect], "X", "Z", "-Y")', pathSetup)).toBe(
      '[[-1, 0, 1], [1, 0, 1], [1, 0, -1], [-1, 0, -1]]',
    );
  });

  it('reports clear errors for invalid axis names and non-vector inputs', () => {
    expect(runFormula('RemapAxes([[1, 2, 3]], "W", "Y", "Z")')).toMatch(/RemapAxes.*X, Y, Z, -X, -Y or -Z/);
    expect(runFormula('RemapAxes("hello", "X", "Z", "Y")')).toMatch(/RemapAxes/);
    expect(runFormula('RemapAxes([[1, 2, 3, 4]], "X", "Z", "Y")')).toMatch(/RemapAxes/);
  });

  it('works inside a script to lay XY polygon points onto XZ', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'square', values: { size: '4, 2', into: 'Box' } },
        { command: 'variable', values: { name: 'Flat', value: '[=RemapAxes([Box.Points], "X", "Z", "-Y")]' } },
        { command: 'path_from_points', values: { points: '[Flat]', closed: 'Yes', into: 'GroundPath' } },
        { command: 'echo', values: { value: '[=[GroundPath.Points]]' } },
      ]),
      {},
    );
    expect(result.error).toBeNull();
    expect(result.messages[0]).toBe('[[-2, 0, 1], [2, 0, 1], [2, 0, -1], [-2, 0, -1]]');
  });

  it('exposes axis enum choices in the formula editor block and round-trips', () => {
    const catalog = solidScriptFormulaCatalog();
    const block = catalog.find(`${SOLID_SCRIPT_FORMULA_CHECK}remap_axes`);
    expect(block).toBeDefined();
    expect(block?.category).toBe('Vector');
    expect(block?.alsoIn).toContain('List');
    const axes = ['X', 'Y', 'Z', '-X', '-Y', '-Z'];
    for (const [key, fallback] of [
      ['x', 'X'],
      ['y', 'Y'],
      ['z', 'Z'],
    ] as const) {
      const parameter = block?.parameters.find((entry) => entry.key === key);
      expect(parameter?.placeholder).toBe(fallback);
      expect(parameter?.words?.map((word) => word.word)).toEqual(axes);
    }

    const read = solidScriptFormulaRead('RemapAxes([VecList], "X", "Z", "Y")');
    expect(read.document.blocks.map((entry) => entry.command)).toEqual([`${SOLID_SCRIPT_FORMULA_CHECK}remap_axes`]);
    const written = solidScriptFormulaWrite(read.document, read, {});
    expect(written).toMatchObject({ text: 'RemapAxes([VecList], "X", "Z", "Y")' });

    new SolidScriptFormulaWindow({
      host: document.body,
      parent: null,
      label: 'Value',
      kind: 'value',
      stored: '[=RemapAxes([VecList], "X", "Z", "Y")]',
      context: {},
      names: [],
      fills: [],
      inputs: [],
      apply: () => undefined,
    }).show();
    const row = document.body.querySelector<HTMLElement>('[data-line="0"]');
    row?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const yInput = document.body.querySelector<HTMLInputElement>('input[aria-label="Y"]');
    expect(yInput?.value).toBe('Z');
    expect(yInput?.placeholder).toBe('Y');
  });

  it('offers axis choices in inline formula autocomplete for arguments 1, 2, and 3', () => {
    for (const text of [
      '[=RemapAxes([VecList], |)]',
      '[=RemapAxes([VecList], "X", |)]',
      '[=RemapAxes([VecList], "X", "Z", |)]',
    ]) {
      const caret = text.indexOf('|');
      const raw = text.replace('|', '');
      const context = solidScriptSuggestionContext(raw, caret, false);
      const list = solidScriptSuggestions(context, { names: [], extra: [], words: [] });
      const choices = list.filter((entry) => entry.category === 'Choices').map((entry) => entry.label);
      expect(choices).toEqual(['"X"', '"Y"', '"Z"', '"-X"', '"-Y"', '"-Z"']);
    }
  });

  it('has documentation and help entries', () => {
    expect(SOLID_SCRIPT_FUNCTION_DOCS['remap_axes']?.usage).toBe('RemapAxes(vectors, x, y, z)');
    expect(SOLID_SCRIPT_FUNCTION_DOCS['remap_axes']?.summary).toMatch(/Example/i);
    expect(readFileSync('documentation/solidscript.md', 'utf8')).toMatch(/RemapAxes/);
  });
});
