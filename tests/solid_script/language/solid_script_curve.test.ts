import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';

const RAMP = curveEncode(
  curveFromPolyline([
    [0, 0.5],
    [1, 1],
  ]),
);

/**
 * Echoes formulas with a curve input called profile.
 *
 * @param inputs Inspector values.
 * @param values Echo values.
 * @returns Messages, or the error.
 */
function echo(inputs: Record<string, string>, ...values: string[]): string[] | string {
  const lines: SolidScriptLine[] = [
    { command: 'input', values: { name: 'profile', type: 'curve', default: '' } },
    ...values.map((value) => ({ command: 'echo', values: { value } })),
    { command: 'cube' },
  ];
  const run = solidScriptProgramRun(solidScriptDocumentCreate(lines), { inputs });
  return run.error ? run.error.message : run.messages;
}

describe('SolidScript curve inputs', () => {
  it('lists a curve input for the inspector', () => {
    const inputs = solidScriptInputsList([
      { command: 'input', values: { name: 'profile', type: 'curve', label: 'Profile', default: '' } },
    ]);
    expect(inputs).toMatchObject([{ name: 'profile', type: 'curve', label: 'Profile' }]);
  });

  it('reads a curve at a place along it, a number as a flat line, and empty text as one at 1', () => {
    expect(
      echo({ profile: RAMP }, '[=round(curve_at([profile], 0) * 1000)]', '[=round(curve_at([profile], 0.5) * 1000)]'),
    ).toEqual(['500', '750']);
    expect(echo({}, '[=curve_at([profile], 0.3)]')).toEqual(['1']);
    expect(echo({ profile: '0.25' }, '[=curve_at([profile], 0.9)]')).toEqual(['0.25']);
  });

  it('samples a profile into height and radius points', () => {
    expect(echo({ profile: RAMP }, '[=profile_points([profile], 4, 2)]')).toEqual(['[[0, 1], [4, 2]]']);
  });

  it('says plainly when the text is not a curve', () => {
    expect(echo({ profile: 'zigzag' }, '[=curve_at([profile], 0)]')).toMatch(/CurveAt\(curve, x\) needs a curve/);
  });
});
