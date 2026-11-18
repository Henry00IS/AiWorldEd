import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFieldAsTyped } from '@/solid_script/language/solid_script_field.js';
import { solidScriptConfiguratorSuggests } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS } from './solid_script_audit_lines.js';

const fields = SOLID_SCRIPT_AUDIT_COMMANDS.flatMap(([id, command]) =>
  command.parameters
    .filter((parameter) => !solidScriptFieldAsTyped(parameter))
    .map((parameter) => [`${id}.${parameter.key}`, command, parameter] as const),
);

describe('every field that reads names suggests them as [ or [= is typed', () => {
  it.each(fields)('%s', (_name, command, parameter) => {
    expect(solidScriptConfiguratorSuggests(parameter)).toBe(true);
    const document = solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Width', value: '15' } },
      { command: command.id, values: {} },
    ]);
    const scope = {
      names: solidScriptDocumentNamesAt(document, 1),
      extra: command.fills ?? [],
      words: parameter.words ?? [],
    };
    const words = (parameter.words ?? []).length > 0;
    const names = solidScriptSuggestions(solidScriptSuggestionContext('[Wi', 3, words), scope).map(
      (entry) => entry.label,
    );
    expect(names).toContain('Width');
    const formula = solidScriptSuggestions(solidScriptSuggestionContext('[=Cl', 4, words), scope).map(
      (entry) => entry.label,
    );
    expect(formula.some((label) => label.startsWith('Clamp'))).toBe(true);
  });
});
