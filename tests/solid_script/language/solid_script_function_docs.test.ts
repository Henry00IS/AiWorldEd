import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionInputsLeast,
} from '@/solid_script/language/solid_script_function_docs.js';

describe('SolidScript function docs', () => {
  it('counts the inputs a function cannot do without', () => {
    expect(solidScriptFunctionInputsLeast('clamp')).toBe(3);
    expect(solidScriptFunctionInputsLeast('abs')).toBe(1);
    expect(solidScriptFunctionInputsLeast('pad_left')).toBe(2);
    expect(solidScriptFunctionInputsLeast('noise')).toBe(3);
    expect(solidScriptFunctionInputsLeast('max')).toBe(1);
    expect(solidScriptFunctionInputsLeast('pick')).toBe(2);
  });

  it('asks for at least one input and never more than a function has', () => {
    for (const key of Object.keys(SOLID_SCRIPT_FUNCTION_DOCS)) {
      const least = solidScriptFunctionInputsLeast(key);
      const inputs = solidScriptFunctionArguments(key);
      if (inputs.length === 0) continue;
      expect(least, key).toBeGreaterThanOrEqual(1);
      if (!inputs.some((input) => input.name === '...')) expect(least, key).toBeLessThanOrEqual(inputs.length);
    }
  });
});
