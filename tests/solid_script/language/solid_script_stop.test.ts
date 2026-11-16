import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Runs lines and returns the result.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Builds a line.
 *
 * @param command Command id.
 * @param values Values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

describe('Stop Script and safe helpers', () => {
  it('end the script with Stop Script, keeping what was built, also from a Function', () => {
    const result = run(
      line('function', { name: 'Finish', parameters: '' }),
      line('stop_script'),
      line('end'),
      line('cube'),
      line('call', { name: 'Finish', values: '' }),
      line('echo', { value: 'never' }),
      line('sphere'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([]);
    expect(result.steps.length).toBe(1);
  });

  it('stop a Repeat early with Stop Script, keeping its shapes', () => {
    const result = run(
      line('repeat', { variable: 'I', from: '0', to: '9' }),
      line('cube'),
      line('if', { condition: '[I] == 1' }),
      line('stop_script'),
      line('end'),
      line('end'),
      line('echo', { value: 'never' }),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([]);
    expect(result.steps.length).toBe(2);
  });

  it('give a list item or a fallback with ItemOr', () => {
    const result = run(
      line('cube'),
      line('variable', { name: 'Sizes', value: '[=$[1, 2$]]' }),
      line('echo', { value: '[=ItemOr([Sizes], 1, 0)] [=ItemOr([Sizes], 5, 0)] [=ItemOr([Sizes], -1, "none")]' }),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['2 0 none']);
  });
});
