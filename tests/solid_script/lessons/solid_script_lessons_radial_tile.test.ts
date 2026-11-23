import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Evaluates one formula and returns what Echo prints, or the error.
 *
 * @param formula Formula without [= ].
 * @returns Printed value.
 */
function formula(formula: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'echo', values: { value: `[=${formula}]` } },
      { command: 'cube', values: {} },
    ]),
    {},
  );
  return result.error ? result.error.message : (result.messages[0] ?? '');
}

describe('RadialTile', () => {
  it('numbers the segments round the Z axis from X, each centred on its angle', () => {
    expect(formula('RadialTile(Vector(1, 0, 0), 4)')).toBe('0');
    expect(formula('RadialTile(Vector(0, 1, 0), 4)')).toBe('1');
    expect(formula('RadialTile(Vector(-1, 0, 0), 4)')).toBe('2');
    expect(formula('RadialTile(Vector(0, -1, 0), 4)')).toBe('3');
    expect(formula('RadialTile(Vector(1, 0.9, 0), 4)')).toBe('0');
    expect(formula('RadialTile(Vector(0.9, 1, 0), 4)')).toBe('1');
  });

  it('gives the centre angle, the position in the segment and the width at its distance', () => {
    expect(formula('RadialTile(Vector(0, 2, 0), 4, "Angle")')).toBe('90');
    expect(formula('Round(RadialTile(Vector(-0.5, 2, 0.5), 4, "Local") * 1000) / 1000')).toBe('[2, 0.5, 0.5]');
    expect(formula('Round(RadialTile(Vector(2, 0, 0), 4, "Width") * 1000) / 1000')).toBe('3.142');
  });

  it('needs whole Segments of 1 or more and a known Output', () => {
    expect(formula('RadialTile(Vector(1, 0, 0), 0)')).toContain('whole Segments of 1 or more');
    expect(formula('RadialTile(Vector(1, 0, 0), 4, "Other")')).toContain('Output Segment, Angle, Local or Width');
    expect(formula('RadialTile(5, 4)')).toContain('needs a Vector for Position');
  });
});
