import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

/** Wording the placeholder now covers, which must not return on a choice field. */
const SOLID_SCRIPT_AUDIT_EMPTY_WORDING = /if left empty|leave empty for|left empty/i;

describe('choice field hints do not say what the placeholder already shows', () => {
  it('has no "if left empty" wording on a field that takes one of a few words', () => {
    const hits: string[] = [];
    for (const command of solidScriptCommands) {
      for (const parameter of command.parameters) {
        if (!parameter.words || parameter.words.length === 0) continue;
        if (SOLID_SCRIPT_AUDIT_EMPTY_WORDING.test(parameter.hint))
          hits.push(`${command.id}.${parameter.key}: ${parameter.hint}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
