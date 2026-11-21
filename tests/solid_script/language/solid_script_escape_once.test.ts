import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { SolidScriptFormulaSource } from '@/solid_script/language/solid_script_formula_source.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * Runs Echo lines after a few variables.
 *
 * @param texts Echo texts.
 * @returns What each Echo wrote, or the error.
 */
function echoes(...texts: string[]): string[] | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      line('variable', { name: 'K', value: '3' }),
      line('variable', { name: 'S', value: '$$' }),
      ...texts.map((value) => line('echo', { value })),
      line('cube'),
    ]),
  );
  return result.error ? result.error.message : result.messages;
}

describe('SolidScript $ escapes are read once', () => {
  it('reads the $ escapes of a formula string only in the formula', () => {
    expect(echoes('[="$$"]', '[="x $$"]', '[="a$b"]', '[="say $"hi$""]', '[="$[x$], y"]')).toEqual([
      '$',
      'x $',
      'a$b',
      'say "hi"',
      '[x], y',
    ]);
  });

  it('keeps the field escapes outside formula strings', () => {
    expect(echoes('Price $$5 $[x$]', '[S]', '[=ItemOr($[1, 2$], 1, 0)]', '[="W [K] mm"]', '[=[0, "a$$b"]]')).toEqual([
      'Price $5 [x]',
      '$',
      '2',
      'W 3 mm',
      '[0, a$b]',
    ]);
  });

  it('reads a formula string in a condition the same way', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        line('variable', { name: 'S', value: '$$' }),
        line('if', { condition: '[S] == "$$"' }),
        line('echo', { value: 'same' }),
        line('end'),
        line('cube'),
      ]),
    );
    expect(result.error?.message ?? result.messages).toEqual(['same']);
  });

  it('reads a formula with a $ string as the running formula does', () => {
    expect(() => SolidScriptFormulaSource.read('"$$" + [K]')).not.toThrow();
    expect(() => SolidScriptFormulaSource.read('"a$"b"')).not.toThrow();
  });

  it('has system values for a new line and a tab', () => {
    expect(echoes('a[$Text.NewLine]b', '[=Str("a", [$Text.Tab], "b")]')).toEqual(['a\nb', 'a\tb']);
  });
});
