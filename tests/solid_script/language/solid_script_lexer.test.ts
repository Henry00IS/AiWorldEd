import { describe, expect, it } from 'vitest';
import { SolidScriptLexer, solidScriptStringWrite } from '@/solid_script/language/solid_script_lexer.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Reads the text of the one string a formula holds.
 *
 * @param formula Formula.
 * @returns String text.
 */
function text(formula: string): string {
  return new SolidScriptLexer(formula).tokenize()[0]?.text ?? '';
}

describe('SolidScript formula strings', () => {
  it.each([
    ['"Say $"Hi$""', 'Say "Hi"'],
    ['"cost $$5"', 'cost $5'],
    ['"a $ b $x"', 'a $ b $x'],
    ['"C:\\temp\\n"', 'C:\\temp\\n'],
    ['"$"$$\\ mixed $$$""', '"$\\ mixed $"'],
    ['"$""', '"'],
    ['"$$"', '$'],
    ['"\\"', '\\'],
    ['""', ''],
  ])('reads %s as %j, a backslash as itself', (formula, expected) => {
    expect(text(formula)).toBe(expected);
    expect(solidScriptStringWrite(expected).length).toBeGreaterThan(1);
    expect(text(solidScriptStringWrite(expected))).toBe(expected);
  });

  it.each(['"open', '"ends in $"', '"a $$$"'])('stops on the unterminated string %s', (formula) => {
    expect(() => new SolidScriptLexer(formula).tokenize()).toThrow(/unterminated string/);
  });

  it('runs a field formula with quotes, dollars and backslashes as written', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'variable', values: { name: 'T', value: '[="Say $"Hi$" for $$$$5 \\o/"]' } },
        { command: 'echo', values: { value: '[=Str([T], "!")]' } },
      ]),
    );
    expect(run.error).toBeNull();
    expect(run.messages).toEqual(['Say "Hi" for $5 \\o/!']);
  });
});
