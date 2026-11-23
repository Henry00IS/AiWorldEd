import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { modifierStackBakeFinalRun } from '@/modifier/stack/bake/modifier_stack_bake_final.js';

/**
 * Runs a script that echoes Run.IsPreview.
 *
 * @returns The echoed text.
 */
function echoed(): string[] {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([{ command: 'echo', values: { value: '[$Run.IsPreview]' } }]),
  );
  expect(result.error?.message).toBeUndefined();
  return result.messages;
}

describe('Run.IsPreview', () => {
  it('is Yes in a live run and No inside a final build, such as a bake', () => {
    expect(echoed()).toEqual(['Yes']);
    expect(modifierStackBakeFinalRun(echoed)).toEqual(['No']);
    expect(echoed()).toEqual(['Yes']);
  });
});
