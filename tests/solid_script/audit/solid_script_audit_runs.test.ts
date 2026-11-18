import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS, solidScriptAuditScript } from './solid_script_audit_lines.js';

describe('every registered command runs with its defaults in a place it belongs', () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', (_id, command) => {
    const run = solidScriptProgramRun(solidScriptDocumentCreate(solidScriptAuditScript(command).lines));
    expect(run.error?.message ?? '').toBe('');
    // Stop Script ends the run before the last line, as it should.
    expect(run.messages.at(-1)).toBe(command.id === 'stop_script' ? undefined : 'done');
  });
});
