import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs a Width variable and a Warn line.
 *
 * @param values Warn values.
 * @returns Run result.
 */
function warned(values: Record<string, string>) {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'variable', values: { name: 'Width', value: '25' } },
      { command: 'warn', values },
      { command: 'cube', values: { size: '1' } },
    ]),
  );
}

describe('Warn', () => {
  it('adds a warning with variables filled in and keeps building', () => {
    const result = warned({ text: 'Width [Width] is too wide' });
    expect(result.error).toBeNull();
    expect(result.warnings.map((warning) => warning.text)).toContain('Width 25 is too wide');
    expect(result.shapes.length).toBeGreaterThan(0);
  });

  it('stops the script with the message when Kind is Stop', () => {
    expect(warned({ text: 'Too wide', kind: 'Stop' }).error?.message).toMatch(/Too wide/);
    expect(warned({ text: 'x', kind: 'Info' }).error?.message).toMatch(/Kind needs Warning or Stop/);
  });
});
