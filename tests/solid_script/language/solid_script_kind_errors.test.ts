import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

/**
 * Runs script lines and gives the mistake that stopped it.
 *
 * @param lines Lines.
 * @returns Mistake, empty when none.
 */
function mistake(...lines: SolidScriptLine[]): string {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines)).error?.message ?? '';
}

describe('a running script tells a wrong kind in plain words, from the declarations', () => {
  it('stops Extrude Face given Yes/No', () => {
    const text = mistake(
      { command: 'variable', values: { name: 'Flag', value: 'Yes' } },
      { command: 'extrude_face', values: { of: '[Flag]' } },
    );
    expect(text).toMatch(/needs a Brush, Face.*not (a )?Yes\/No/);
  });

  it('stops Abs() given a Brush', () => {
    const text = mistake(
      { command: 'cube', values: { size: '2, 2, 2', into: 'Box' } },
      { command: 'variable', values: { name: 'N', value: '[=Abs([Box])]' } },
    );
    expect(text).toMatch(/Abs\(\) needs a Number.*not a Brush/);
  });
});

describe('the shipped examples pass the editor checks', () => {
  it.each(SOLID_SCRIPT_EXAMPLES.map((example) => [example.id, example] as const))('%s', (_id, example) => {
    expect(solidScriptKindCheck(solidScriptDocumentCreate([...example.lines]))).toEqual([]);
  });
});
