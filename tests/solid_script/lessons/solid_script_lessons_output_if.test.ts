import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Builds a cube into a variable, then runs the given lines after it.
 *
 * @param lines Lines after the cube is built.
 * @returns Run result.
 */
function afterCube(lines: readonly SolidScriptLine[]) {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'mesh_from_solids', values: { into: 'Box' } },
      { command: 'cube' },
      { command: 'end' },
      ...lines,
    ]),
  );
}

/**
 * Wraps Output [Box] in an If with the given condition, then Echoes a note.
 *
 * @param condition If condition.
 * @returns Run result.
 */
function stampIf(condition: string) {
  return afterCube([
    { command: 'if', values: { condition } },
    { command: 'output', values: { of: '[Box]' } },
    { command: 'end' },
    { command: 'echo', values: { value: 'still running' } },
  ]);
}

describe('Output inside If', () => {
  it('has only Of, with no Enabled field', () => {
    const keys = solidScriptCommandFind('output')?.parameters.map((parameter) => parameter.key);
    expect(keys).toEqual(['of']);
  });

  it('stamps by default and when If is true or a true comparison', () => {
    expect(afterCube([{ command: 'output', values: { of: '[Box]' } }]).shapes).toHaveLength(1);
    expect(stampIf('true').shapes).toHaveLength(1);
    expect(stampIf('2 > 1').shapes).toHaveLength(1);
  });

  it('stamps nothing, without stopping, when If is false or a false comparison', () => {
    const off = stampIf('false');
    expect(off.error).toBeNull();
    expect(off.shapes).toHaveLength(0);
    expect(off.messages).toEqual(['still running']);
    const comparison = stampIf('1 > 2');
    expect(comparison.error).toBeNull();
    expect(comparison.shapes).toHaveLength(0);
    expect(comparison.messages).toEqual(['still running']);
  });

  it('stamps only when a variable condition holds, and still stamps a later Output', () => {
    const on = afterCube([
      { command: 'variable', values: { name: 'Steps', value: '3' } },
      { command: 'if', values: { condition: '[Steps] > 0' } },
      { command: 'output', values: { of: '[Box]' } },
      { command: 'end' },
    ]);
    expect(on.error).toBeNull();
    expect(on.shapes).toHaveLength(1);
    const skipped = afterCube([
      { command: 'variable', values: { name: 'Steps', value: '0' } },
      { command: 'if', values: { condition: '[Steps] > 0' } },
      { command: 'output', values: { of: '[Box]' } },
      { command: 'end' },
      { command: 'output', values: { of: '[Box]' } },
    ]);
    expect(skipped.error).toBeNull();
    expect(skipped.shapes).toHaveLength(1);
  });

  it('loads a stored Enabled value and ignores it, without stopping', () => {
    const stored = solidScriptDocumentNormalize({
      version: 1,
      name: 'Old Output',
      blocks: [
        { command: 'mesh_from_solids', values: { into: 'Box' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'output', values: { of: '[Box]', enabled: 'No' } },
        { command: 'echo', values: { value: 'still running' } },
      ],
    });
    const output = stored.blocks.find((block) => block.command === 'output');
    expect(output?.values['of']).toBe('[Box]');
    const result = solidScriptProgramRun(stored);
    expect(result.error).toBeNull();
    expect(result.shapes).toHaveLength(1);
    expect(result.messages).toEqual(['still running']);
  });

  it('loads stored Enabled formulas and $[ escapes without treating them as leaked JSON', () => {
    const stored = solidScriptDocumentNormalize({
      version: 1,
      name: 'Old Formula',
      blocks: [
        { command: 'mesh_from_solids', values: { into: 'Box' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'output', values: { of: '[Box]', enabled: '[=1 > 2]' } },
        { command: 'echo', values: { value: 'Price $$5 $[x$]' } },
      ],
    });
    const result = solidScriptProgramRun(stored);
    expect(result.error).toBeNull();
    expect(result.shapes).toHaveLength(1);
    expect(result.messages).toEqual(['Price $5 [x]']);
  });
});
