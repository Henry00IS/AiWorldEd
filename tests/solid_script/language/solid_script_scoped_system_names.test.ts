import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';

/**
 * Builds a script line.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Runs lines and gives the messages and the mistake.
 *
 * @param lines Lines.
 * @returns Messages and mistake text.
 */
function run(...lines: SolidScriptLine[]): { messages: readonly string[]; error: string } {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([line('cube'), ...lines]));
  return { messages: result.messages, error: result.error?.message ?? '' };
}

describe('$Local and $Persistent', () => {
  it('reads and writes the values of a Function call as $Local', () => {
    const result = run(
      line('function', { name: 'Twice', parameters: 'W' }),
      line('variable', { name: '$Local.Double', value: '[=[$Local.W] * 2]' }),
      line('return', { value: '[$Local.Double]' }),
      { command: 'end' },
      line('echo', { value: '[=Twice(4)]' }),
    );
    expect(result).toEqual({ messages: ['8'], error: '' });
  });

  it('tells that $Local only works inside a Function, spelled with its $', () => {
    expect(run(line('echo', { value: '[$Local.X]' })).error).toMatch(
      /\[\$Local\.X\] is a local variable, and \$Local\. only works inside a Function; outside one, write \[X\]/,
    );
  });

  it('keeps $Persistent values a button press sets, stored on the generator', () => {
    const script = solidScriptDocumentCreate([
      line('input', { name: 'Add', type: 'Button' }),
      line('when_button_pressed', { name: 'Add' }),
      line('variable', { name: '$Persistent.Count', value: '1' }),
      { command: 'end' },
      line('cube'),
    ]);
    const pressed = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {});
    expect(pressed.error).toBeNull();
    expect(pressed.inputs).toEqual({});
    expect(pressed.persistent).toEqual({ count: 1 });
  });

  it('reads Local. and Persistent. without the $ as plain names', () => {
    expect(run(line('echo', { value: '[Persistent.X]' })).error).toMatch(
      /there is no variable \[Persistent\.X\]; set it on a line above/,
    );
  });

  it('colours $Local and $Persistent names as their own kinds, not as system values', () => {
    const kinds = (text: string): string[] => solidScriptFieldTokens(text).map((token) => token.kind);
    expect(kinds('[$Local.W]')).toContain('local');
    expect(kinds('[$Persistent.P]')).toContain('persistent');
    expect(kinds('[$Persistent.P]')).not.toContain('system');
  });
});
