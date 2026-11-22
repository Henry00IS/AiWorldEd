import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATALOG } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_FORMULA_COMMAND,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptListingText } from '@/solid_script/commands/solid_script_command_listing.js';
import { solidScriptFormulaRead } from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import { solidScriptFieldTokens } from '@/solid_script/language/solid_script_field_tokens.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  solidScriptSuggestionWrite,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

void SOLID_SCRIPT_COMMAND_CATALOG;

/** Suggestions for a field that may name the script's system values. */
const SCOPE: SolidScriptSuggestionScope = { names: [], extra: ['$Input.Objects', '$Face.Parent'], words: [] };

/**
 * Reads a formula and gives the value of each Variable block in it.
 *
 * @param formula Formula without [= ].
 * @returns Values.
 */
function variables(formula: string): string[] {
  return solidScriptFormulaRead(formula)
    .document.blocks.filter((block) => block.command === SOLID_SCRIPT_FORMULA_COMMAND.variable)
    .map((block) => block.values['value'] ?? '');
}

/**
 * Lists a Variable block holding a value the way the script shows it.
 *
 * @param value Field value.
 * @returns Listing.
 */
function listed(value: string): string {
  const command = solidScriptFormulaCatalog().find(SOLID_SCRIPT_FORMULA_COMMAND.variable);
  return solidScriptListingText(command?.listing({ value }) ?? []);
}

describe('Variable block field', () => {
  it('opens a loaded reference in brackets, so it is coloured as a name', () => {
    const [value = ''] = variables('[$Input.Objects]');
    expect(value).toBe('[$Input.Objects]');
    expect(solidScriptFieldTokens(value).some((token) => token.kind === 'system')).toBe(true);
    expect(variables('[$Face.Parent] == [Wall]')).toEqual(['[$Face.Parent]', '[Wall]']);
  });

  it('lists a reference without quotes, however it was typed', () => {
    expect(listed('[$Face.Parent]')).toBe('Variable [$Face.Parent]');
    expect(listed('[$Input.Objects]')).toBe('Variable [$Input.Objects]');
    expect(listed('[Wall]')).toBe('Variable [Wall]');
  });

  it('writes and reads back the same field and the same formula', () => {
    const first = solidScriptFormulaRead('[$Face.Parent] == [Wall]');
    const written = solidScriptFormulaWrite(first.document, first);
    if (!('text' in written)) throw new Error(written.problem);
    expect(written.text).toBe('[$Face.Parent] == [Wall]');
    expect(variables(written.text)).toEqual(['[$Face.Parent]', '[Wall]']);
  });

  it('suggests names in an empty reference field and writes the pick in brackets', () => {
    const context = solidScriptSuggestionContext('', 0, false, false, true);
    const labels = solidScriptSuggestions(context, { ...SCOPE, reference: true }).map((entry) => entry.label);
    expect(labels).toContain('$Input.Objects');
    const picked = solidScriptSuggestions(context, { ...SCOPE, reference: true }).find(
      (entry) => entry.label === '$Input.Objects',
    );
    if (!picked) throw new Error('no suggestion');
    expect(solidScriptSuggestionWrite(picked, '', 0, 0, true).text).toBe('[$Input.Objects]');
    expect(solidScriptSuggestionWrite(picked, '$Inp', 4, 4, true).text).toBe('[$Input.Objects]');
  });

  it('marks the Variable block field as holding a reference', () => {
    const command = solidScriptFormulaCatalog().find(SOLID_SCRIPT_FORMULA_COMMAND.variable);
    expect(command?.parameters.find((field) => field.key === 'value')?.reference).toBe(true);
  });
});
