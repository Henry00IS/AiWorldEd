import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFieldMistake } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptMistakeCheck } from '@/solid_script/language/solid_script_use_check.js';

describe('SolidScript math hints', () => {
  it('leaves conditions alone, since they are worked out like formulas', () => {
    const script = solidScriptDocumentCreate([
      { command: 'if', values: { condition: 'Abs([Rise]) > 0.000001 or Abs([B.y] - [A.y]) > 0.000001' } },
      { command: 'end', values: {} },
      { command: 'if', values: { condition: '[Rise] <= 0.000001 or Max([A.y], [B.y]) <= 0.000001' } },
      { command: 'end', values: {} },
    ]);
    expect(solidScriptMistakeCheck(script)).toEqual([]);
  });

  it('keeps a call with commas whole, so the hint is balanced', () => {
    expect(solidScriptFieldMistake('[Rise] <= 0.000001 or Max([A.y], [B.y]) <= 0.000001')).toBe(
      '[=[Rise] <= 0.000001 or Max([A.y], [B.y]) <= 0.000001]',
    );
    expect(solidScriptFieldMistake('Max([A], [B]) * 2, 0, 0')).toBe('[=Max([A], [B]) * 2], 0, 0');
  });
});
