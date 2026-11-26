import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { CURVE_POINTS_MAX, curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptKindOf } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';
import { SolidScriptCurveValue } from '@/solid_script/language/solid_script_curve_value.js';
import {
  solidScriptPersistentValueEncode,
  solidScriptPersistentValueRead,
} from '@/solid_script/language/persistent/solid_script_persistent_codec.js';

const RAMP = curveEncode(
  curveFromPolyline([
    [0, 0.5],
    [1, 1],
  ]),
);

/**
 * Turns one test step into a line: Name := value sets a variable, anything else
 * is echoed.
 *
 * @param step Step.
 * @returns Line.
 */
function line(step: string): SolidScriptLine {
  const [name, value] = step.split(' := ');
  return value === undefined
    ? { command: 'echo', values: { value: step } }
    : { command: 'variable', values: { name: name!, value } };
}

/**
 * Echoes formulas with a Curve input called Profile.
 *
 * @param inputs Inspector values.
 * @param values Steps.
 * @returns Messages, or the error.
 */
function echo(inputs: Record<string, string>, ...values: string[]): string[] | string {
  const lines: SolidScriptLine[] = [
    { command: 'input', values: { name: 'Profile', type: 'Curve', default: '' } },
    ...values.map(line),
    { command: 'cube' },
  ];
  const run = solidScriptProgramRun(solidScriptDocumentCreate(lines), { inputs });
  return run.error ? run.error.message : run.messages;
}

describe('Curve values', () => {
  it('gives a Curve input as a Curve with points, a point count and segments', () => {
    expect(echo({ Profile: RAMP }, '[Profile.Points]', '[Profile.Length]', '[=Len([Profile.Segments])]')).toEqual([
      '[[0, 0.5], [1, 1]]',
      '2',
      '1',
    ]);
  });

  it('describes each segment with its Kind, Start, End, Handles and Detail', () => {
    const shown = echo({ Profile: RAMP }, '[=Pick(0, [Profile.Segments])]');
    expect(shown).toEqual(['[Kind: Linear, Start: [0, 0.5], End: [1, 1], Handles: [[0, 0.5], [1, 1]], Detail: 8]']);
  });

  it('makes a curve from points and reads it back the way a formula writes it', () => {
    expect(echo({}, '[=Curve([[0, 0], [0.5, 1], [1, 0]])]', 'C := [=Curve([[0, 0], [1, 1]])]', '[C.Length]')).toEqual([
      'Curve([[0, 0], [0.5, 1], [1, 0]])',
      '2',
    ]);
    expect(Number(echo({}, '[=CurveAt(Curve([[0, 0], [1, 1]]), 0.25)]')[0])).toBeCloseTo(0.25, 6);
  });

  it('bends segments from Dictionaries like .Segments gives', () => {
    const shown = echo(
      {},
      'S := [=Dictionary(["Kind", "Handles", "Detail"], ["Bezier", [[0.25, 0], [0.75, 1]], 12])]',
      'C := [=Curve([[0, 0], [1, 1]], List([S]))]',
      '[=Pick(0, [C.Segments])]',
      '[=Round(CurveAt([C], 0.5) * 1000) / 1000]',
    );
    expect(shown).toEqual([
      '[Kind: Bezier, Start: [0, 0], End: [1, 1], Handles: [[0.25, 0], [0.75, 1]], Detail: 12]',
      '0.5',
    ]);
  });

  it('copies the shape of a curve from its points and segments', () => {
    expect(echo({ Profile: RAMP }, 'C := [=Curve([Profile.Points], [Profile.Segments])]', '[C.Points]')).toEqual([
      '[[0, 0.5], [1, 1]]',
    ]);
  });

  it('makes a curve from a curve, a number or a preset name', () => {
    expect(
      echo({ Profile: RAMP }, 'C := [=Curve([Profile])]', '[C.Length]', 'D := [=Curve(0.5)]', '[D.Points]'),
    ).toEqual(['2', '[[0, 0.5], [1, 0.5]]']);
    expect(Number(echo({}, 'C := [=Curve("Classic Column")]', '[C.Length]')[0])).toBeGreaterThan(2);
  });

  it('feeds the Curve block and CurveProfile', () => {
    expect(echo({ Profile: RAMP }, '[=Len(CurveProfile([Profile], 1, 0.2, "Normal", 4))]')[0]).toMatch(/^\d+$/);
  });

  it('says plainly what a curve needs', () => {
    expect(echo({}, '[=Curve([[0, 0]])]')).toContain('needs 2 to');
    expect(echo({}, '[=Curve([[0, 0], [2, 1]])]')).toContain('X from 0 to 1');
    expect(echo({}, '[=Curve([[0.5, 0], [0.2, 1]])]')).toContain('left to right');
    expect(echo({}, 'S := [=Dictionary(["Kind"], ["Wavy"])]', '[=Curve([[0, 0], [1, 1]], List([S]))]')).toContain(
      'Linear, Quadratic, Bezier',
    );
    expect(echo({}, 'S := [=Dictionary(["Detail"], [0])]', '[=Curve([[0, 0], [1, 1]], List([S]))]')).toContain(
      'Detail from 1 to 64',
    );
    expect(echo({}, '[=Curve("no such curve")]')).toContain('needs a list of points');
    expect(echo({ Profile: RAMP }, '[Profile.Wobble]')).toContain('.Points, .Length, .Segments');
  });

  it('takes the most points a curve may hold', () => {
    const points = Array.from({ length: CURVE_POINTS_MAX }, (_, index) => `[${index / (CURVE_POINTS_MAX - 1)}, 0.5]`);
    expect(echo({}, `C := [=Curve([${points.join(', ')}])]`, '[C.Length]')).toEqual([String(CURVE_POINTS_MAX)]);
    expect(echo({}, `[=Curve([${points.join(', ')}, [1, 1]])]`)).toContain(`needs 2 to ${CURVE_POINTS_MAX}`);
  });

  it('names its kind and the kinds of its members', () => {
    expect(
      solidScriptKindOf(
        new SolidScriptCurveValue(
          curveFromPolyline([
            [0, 0],
            [1, 1],
          ]),
        ),
      ),
    ).toBe('Curve');
    expect(solidScriptMemberType('Curve', 'Points')).toBe('Vector List');
    expect(solidScriptMemberType('Curve', 'Length')).toBe('Number');
    expect(solidScriptMemberType('Curve', 'Segments')).toBe('Dictionary List');
  });

  it('is kept between runs as plain data', () => {
    const curve = new SolidScriptCurveValue(
      curveFromPolyline([
        [0, 0.5],
        [1, 1],
      ]),
    );
    const stored = solidScriptPersistentValueEncode([curve]);
    const read = solidScriptPersistentValueRead(JSON.parse(JSON.stringify(stored)));
    expect(String((read as SolidScriptCurveValue[])[0])).toBe('Curve([[0, 0.5], [1, 1]])');
  });

  it('reads a curve many times quickly', () => {
    const steps = Array.from({ length: 400 }, (_, index) => `[=CurveAt([Profile], ${index / 399})]`);
    const started = performance.now();
    expect(echo({ Profile: RAMP }, ...steps)).toHaveLength(400);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
