import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Makes an Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

/**
 * Runs a Function with one input N called with 2, holding the given lines.
 *
 * @param inside Lines of the Function.
 * @returns Error message of the run.
 */
function functionError(...inside: SolidScriptLine[]): string | undefined {
  return run({ command: 'function', values: { name: 'Twice', parameters: 'N' } }, ...inside, END, {
    command: 'call',
    values: { name: 'Twice', values: '2' },
  }).error?.message;
}

describe('SolidScript $Local hint for a missing variable', () => {
  it('suggests $Local for a Function input read without it, in a field and in a formula', () => {
    expect(functionError(echo('[N]'))).toContain(
      'there is no variable [N]; set it on a line above this one. Did you mean [$Local.N]?',
    );
    expect(functionError(echo('[=[N] * 2]'))).toContain('Did you mean [$Local.N]?');
  });

  it('suggests $Local for a member of an input', () => {
    expect(functionError(echo('[N.Count]'))).toContain('Did you mean [$Local.N.Count]?');
  });

  it('suggests $Local for a local variable only once it is set', () => {
    const before = functionError(echo('[Tmp]'), { command: 'variable', values: { name: '$Local.Tmp', value: '1' } });
    expect(before).toContain('there is no variable [Tmp]');
    expect(before).not.toContain('Did you mean');
    const after = functionError({ command: 'variable', values: { name: '$Local.Tmp', value: '1' } }, echo('[Tmp]'));
    expect(after).toContain('Did you mean [$Local.Tmp]?');
  });

  it('gives no hint for a name the Function does not hold, or outside a Function', () => {
    expect(functionError(echo('[Other]'))).not.toContain('Did you mean');
    const outside = run(echo('[N]')).error?.message;
    expect(outside).toContain('there is no variable [N]; set it on a line above this one');
    expect(outside).not.toContain('Did you mean');
  });

  it('still reads the input with $Local', () => {
    const result = run(
      { command: 'function', values: { name: 'Twice', parameters: 'N' } },
      echo('[=[$Local.N] * 2]'),
      END,
      { command: 'call', values: { name: 'Twice', values: '2' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['4']);
  });
});
