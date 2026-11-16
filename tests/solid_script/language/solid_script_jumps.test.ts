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

describe('Label, Go To and Stop Script', () => {
  it('jump back to a Label to loop, and forward to skip lines', () => {
    const result = run(
      line('variable', { name: 'Rings', value: '0' }),
      line('label', { name: 'Again' }),
      line('cube'),
      line('variable', { name: 'Rings', value: '[=[Rings] + 1]' }),
      line('if', { condition: '[Rings] < 3' }),
      line('go_to', { name: 'AGAIN' }),
      line('end'),
      line('go_to', { name: 'Done' }),
      line('echo', { value: 'skipped' }),
      line('label', { name: 'done' }),
      line('echo', { value: '[Rings] rings' }),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['3 rings']);
    expect(result.steps.length).toBe(3);
  });

  it('leave a Repeat for a Label around it', () => {
    const result = run(
      line('variable', { name: 'Last', value: '-1' }),
      line('repeat', { variable: 'I', from: '0', to: '9' }),
      line('cube'),
      line('if', { condition: '[I] == 1' }),
      line('variable', { name: 'Last', value: '[I]' }),
      line('go_to', { name: 'Out' }),
      line('end'),
      line('end'),
      line('label', { name: 'Out' }),
      line('echo', { value: 'stopped at [Last]' }),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['stopped at 1']);
    expect(result.steps.length).toBe(2);
  });

  it('stop on a missing Label, a duplicate Label and a jump out of a Function', () => {
    expect(run(line('cube'), line('go_to', { name: 'Nowhere' })).error?.message).toMatch(
      /Go To found no Label "Nowhere"/,
    );
    expect(run(line('label', { name: 'A' }), line('cube'), line('label', { name: 'a' })).error?.message).toMatch(
      /already a Label "a"/,
    );
    const outside = run(
      line('label', { name: 'Out' }),
      line('function', { name: 'Leave', parameters: '' }),
      line('go_to', { name: 'Out' }),
      line('end'),
      line('cube'),
      line('call', { name: 'Leave', values: '' }),
    );
    expect(outside.error?.message).toMatch(/Go To cannot leave a Function/);
  });

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
