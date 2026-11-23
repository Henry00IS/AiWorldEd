import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Builds a cube into a variable and stamps it with the given Enabled.
 *
 * @param enabled Enabled value, or none for the default.
 * @returns Run result.
 */
function stamp(enabled?: string) {
  return solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'mesh_from_solids', values: { into: 'Box' } },
      { command: 'cube' },
      { command: 'end' },
      { command: 'output', values: { of: '[Box]', ...(enabled === undefined ? {} : { enabled }) } },
    ]),
  );
}

describe('Output Enabled', () => {
  it('stamps by default and when Enabled is Yes', () => {
    expect(stamp().shapes).toHaveLength(1);
    expect(stamp('Yes').shapes).toHaveLength(1);
  });

  it('stamps nothing, without stopping, when Enabled is No or a formula gives No', () => {
    const off = stamp('No');
    expect(off.error).toBeNull();
    expect(off.shapes).toHaveLength(0);
    expect(stamp('[=1 > 2]').shapes).toHaveLength(0);
    expect(stamp('[=2 > 1]').shapes).toHaveLength(1);
  });

  it('needs Yes or No in Enabled', () => {
    expect(stamp('Maybe').error?.message).toContain('Yes or No');
  });
});
