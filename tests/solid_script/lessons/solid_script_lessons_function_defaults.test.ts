import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFunctionInputs } from '@/solid_script/language/solid_script_function_inputs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a Function with the given Inputs field and echoes the given call.
 *
 * @param inputs Inputs field.
 * @param call Formula to echo.
 * @returns Program result.
 */
function run(inputs: string, call: string): ReturnType<typeof solidScriptProgramRun> {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'function', values: { name: 'Area', parameters: inputs } },
      { command: 'return', values: { value: '[=[Local.W] * [Local.D]]' } },
      { command: 'end' },
      { command: 'echo', values: { value: call } },
    ]),
  );
}

describe('Function input defaults', () => {
  it('fills inputs left off with their defaults', () => {
    expect(run('W, D = 3', '[=Area(2)] [=Area(2, 5)]').messages).toEqual(['6 10']);
  });

  it('still asks for inputs without a default', () => {
    expect(run('W, D = 3', '[=Area()]').error?.message).toContain('takes 1 to 2 value(s)');
  });

  it('wants inputs with a default last', () => {
    expect(run('W = 1, D', '[=Area(2, 2)]').error?.message).toContain('must come last');
  });

  it('reads lists and texts as defaults without splitting them', () => {
    expect(solidScriptFunctionInputs('P = [1, 2], T = "a, b", N')).toEqual([
      { name: 'P', fallback: '[1, 2]' },
      { name: 'T', fallback: '"a, b"' },
      { name: 'N', fallback: null },
    ]);
  });

  it('reruns for each item when a per-item formula uses it', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'function', values: { name: 'Big', parameters: 'N, Over = 10' } },
        { command: 'return', values: { value: '[=[Local.N] > [Local.Over]]' } },
        { command: 'end' },
        { command: 'for_each', values: { variable: 'N', list: '5, 15, 25', where: '[=Big([$Item])]' } },
        { command: 'echo', values: { value: '[N]' } },
        { command: 'end' },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['15', '25']);
  });
});
