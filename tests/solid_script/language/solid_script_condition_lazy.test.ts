import { describe, expect, it } from 'vitest';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/**
 * A running line whose field holds the text, reading every value as Yes.
 *
 * @param text Field text.
 * @returns Running line.
 */
function line(text: string): SolidScriptBlockRun {
  return { source: () => text, valueWith: () => true } as unknown as SolidScriptBlockRun;
}

describe('Where conditions', () => {
  it('make the values they read only when the field is set', () => {
    let made = 0;
    const bindings = () => {
      made += 1;
      return { $Index: 0 };
    };
    expect(solidScriptConditionHolds(line(' '), 'where', bindings)).toBe(true);
    expect(made).toBe(0);
    expect(solidScriptConditionHolds(line('[=[$Index] == 0]'), 'where', bindings)).toBe(true);
    expect(made).toBe(1);
  });
});
