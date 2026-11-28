import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Runs lines and prints what Echo reads.
 *
 * @param lines Lines before the echo.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/**
 * Makes a Linear Curve line into [C].
 *
 * @param values Fields to override.
 * @returns Line.
 */
function linear(values: Record<string, string> = {}): SolidScriptLine {
  return { command: 'linear_curve', values: { from: '0, 0', to: '1, 1', into: 'C', ...values } };
}

/** A curve of three points in [C]: 0, 0 then 0.5, 1 then 1, 0. */
const TENT: SolidScriptLine[] = [
  linear({ to: '1, 0' }),
  { command: 'insert_segment', values: { curve: '[C]', at: '1', point: '0.5, 1', kind: 'Linear', into: 'C' } },
];

/**
 * Makes an Insert Segment line on [C].
 *
 * @param at Position.
 * @param point Point.
 * @param kind Kind.
 * @returns Line.
 */
function insert(at: string, point: string, kind = 'Linear'): SolidScriptLine {
  return { command: 'insert_segment', values: { curve: '[C]', at, point, kind, into: 'C' } };
}

/**
 * Makes a Set Curve Point line on [C].
 *
 * @param at Point number.
 * @param x X.
 * @param y Y.
 * @returns Line.
 */
function set(at: string, x: string, y: string): SolidScriptLine {
  return { command: 'set_curve_point', values: { curve: '[C]', at, x, y, into: 'C' } };
}

/**
 * Makes a Remove Segment line.
 *
 * @param of What to take a segment out of.
 * @param segment Segment number.
 * @param into Where to write.
 * @returns Line.
 */
function remove(of: string, segment: string, into = 'C'): SolidScriptLine {
  return { command: 'remove_segment', values: { from: of, segment, into } };
}

describe('Linear Curve, Bezier Curve and Quadratic Curve', () => {
  it('make a curve of one segment from the left edge to the right edge', () => {
    expect(ran([linear()], '[C.Points]')).toBe('[[0, 0], [1, 1]]');
    expect(ran([linear()], '[C.Length]')).toBe('2');
    expect(ran([linear()], '[C.Segments(0).Kind]')).toBe('Linear');
    expect(Number(ran([linear({ from: '0, 0.25', to: '1, 0.75' })], '[=CurveAt([C], 0.5)]'))).toBeCloseTo(0.5, 6);
    expect(ran([linear()], '[=IsCurve([C])]')).toBe('Yes');
  });

  it('make a Bezier segment bent by two handles, Detail pieces', () => {
    const bezier: SolidScriptLine = {
      command: 'bezier_curve',
      values: { from: '0, 0', from_handle: '0.4, 0', to_handle: '0.6, 1', to: '1, 1', detail: '16', into: 'C' },
    };
    expect(ran([bezier], '[C.Segments(0).Kind]')).toBe('Bezier');
    expect(ran([bezier], '[C.Segments(0).Handles]')).toBe('[[0.4, 0], [0.6, 1]]');
    expect(ran([bezier], '[C.Segments(0).Detail]')).toBe('16');
    expect(Number(ran([bezier], '[=CurveAt([C], 0.5)]'))).toBeCloseTo(0.5, 6);
  });

  it('make a Quadratic segment pulled toward Middle', () => {
    const quadratic: SolidScriptLine = {
      command: 'quadratic_curve',
      values: { from: '0, 0', middle: '0.5, 1', to: '1, 0', detail: '8', into: 'C' },
    };
    expect(ran([quadratic], '[C.Segments(0).Kind]')).toBe('Quadratic');
    expect(ran([quadratic], '[C.Segments(0).Handles]')).toBe('[[0.5, 1], [1, 0]]');
    expect(Number(ran([quadratic], '[=CurveAt([C], 0.5)]'))).toBeCloseTo(0.5, 6);
  });

  it('keep handles between the two ends, as the editor does', () => {
    const wide: SolidScriptLine = {
      command: 'bezier_curve',
      values: { from: '0, 0', from_handle: '3, 5', to_handle: '-2, -1', to: '1, 1', detail: '8', into: 'C' },
    };
    const handles = ran([wide], '[C.Segments(0).Handles]');
    expect(handles).toBe('[[0.5, 1], [0.5, 0]]');
  });

  it('stop on ends that are not at X 0 and X 1, heights outside 0 to 1, or a bad Detail', () => {
    expect(ran([linear({ from: '0.2, 0' })], '[C]')).toContain('Linear Curve needs From at X 0 and To at X 1');
    expect(ran([linear({ to: '0.9, 1' })], '[C]')).toContain('needs From at X 0 and To at X 1');
    expect(ran([linear({ from: '0, 1.5' })], '[C]')).toContain('heights from 0 to 1');
    expect(ran([linear({ to: '1, -0.1' })], '[C]')).toContain('heights from 0 to 1');
    expect(ran([linear({ from: '0' })], '[C]')).toContain('needs two numbers in From');
    const detail = (value: string): SolidScriptLine => ({
      command: 'bezier_curve',
      values: { from: '0, 0', from_handle: '0.4, 0', to_handle: '0.6, 1', to: '1, 1', detail: value, into: 'C' },
    });
    for (const bad of ['0', '65', '2.5']) expect(ran([detail(bad)], '[C]')).toContain('Detail from 1 to 64');
  });
});

describe('Insert Segment', () => {
  it('puts a point in the middle, keeping x between its neighbours', () => {
    expect(ran(TENT, '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0]]');
    expect(ran([linear(), insert('1', '0.3, 0.2')], '[C.Points]')).toBe('[[0, 0], [0.3, 0.2], [1, 1]]');
    expect(ran([linear(), insert('1', '3, 0.2')], '[C.Points]')).toBe('[[0, 0], [1, 0.2], [1, 1]]');
    expect(ran([linear(), insert('1', '-3, 0.2')], '[C.Points]')).toBe('[[0, 0], [0, 0.2], [1, 1]]');
    expect(ran(TENT.concat(insert('2', '0.9, 0.3')), '[C.Points]')).toBe('[[0, 0], [0.5, 1], [0.9, 0.3], [1, 0]]');
    expect(ran(TENT.concat(insert('2', '0.1, 0.3')), '[C.Points]')).toBe('[[0, 0], [0.5, 1], [0.5, 0.3], [1, 0]]');
  });

  it('puts a point first at 0 and last at the point count, moving the old end to Point x', () => {
    expect(ran([linear(), insert('0', '0.2, 0.9')], '[C.Points]')).toBe('[[0, 0.9], [0.2, 0], [1, 1]]');
    expect(ran([linear(), insert('2', '0.7, 0.9')], '[C.Points]')).toBe('[[0, 0], [0.7, 1], [1, 0.9]]');
    expect(ran(TENT.concat(insert('3', '0.8, 0.4')), '[C.Points]')).toBe('[[0, 0], [0.5, 1], [0.8, 0], [1, 0.4]]');
    expect(ran(TENT.concat(insert('0', '9, 0.4')), '[C.Points]')).toBe('[[0, 0.4], [0.5, 0], [0.5, 1], [1, 0]]');
  });

  it('gives the new segment the Kind, and keeps the kind of the part before', () => {
    const bent: SolidScriptLine[] = [
      { command: 'quadratic_curve', values: { from: '0, 0', middle: '0.5, 1', to: '1, 0', detail: '8', into: 'C' } },
      insert('1', '0.5, 0.5', 'Bezier'),
    ];
    expect(ran(bent, '[C.Segments(0).Kind]')).toBe('Quadratic');
    expect(ran(bent, '[C.Segments(1).Kind]')).toBe('Bezier');
    expect(ran([linear(), insert('0', '0.5, 0.5', 'quadratic')], '[C.Segments(0).Kind]')).toBe('Quadratic');
    expect(ran([linear(), insert('2', '0.5, 0.5', 'Bezier')], '[C.Segments(1).Kind]')).toBe('Bezier');
    expect(ran([linear(), insert('1', '0.5, 0.5', '')], '[C.Segments(1).Kind]')).toBe('Linear');
  });

  it('starts a bent new segment straight along its chord', () => {
    const bezier = [linear(), insert('1', '0.5, 0.5', 'Bezier')];
    expect(Number(ran(bezier, '[=CurveAt([C], 0.75)]'))).toBeCloseTo(0.75, 6);
  });

  it('stops on a Position outside 0 to the point count, a bad Point or Kind', () => {
    for (const at of ['-1', '3', '1.5', '"x"'])
      expect(ran([linear(), insert(at, '0.5, 0.5')], '[C]')).toContain(
        'Position needs a whole number from 0 to 2, because the curve has 2 points',
      );
    expect(ran([linear(), insert('1', '0.5')], '[C]')).toContain('Insert Segment needs two numbers in Point');
    expect(ran([linear(), insert('1', '0.5, 0.5', 'Round')], '[C]')).toContain(
      'Kind takes Linear, Quadratic or Bezier',
    );
  });

  it('does not change the Curve it was given when Into is another name', () => {
    const other: SolidScriptLine = {
      ...insert('1', '0.5, 0.5'),
      values: { ...insert('1', '0.5, 0.5').values, into: 'D' },
    };
    expect(ran([linear(), other], '[C.Length]')).toBe('2');
    expect(ran([linear(), other], '[D.Length]')).toBe('3');
  });
});

describe('Set Curve Point', () => {
  it('moves a point to X and Y, keeping the other when one is empty', () => {
    expect(ran([...TENT, set('1', '0.3', '0.8')], '[C.Points]')).toBe('[[0, 0], [0.3, 0.8], [1, 0]]');
    expect(ran([...TENT, set('1', '', '0.2')], '[C.Points]')).toBe('[[0, 0], [0.5, 0.2], [1, 0]]');
    expect(ran([...TENT, set('1', '0.7', '')], '[C.Points]')).toBe('[[0, 0], [0.7, 1], [1, 0]]');
    expect(ran([...TENT, set('1', '', '')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0]]');
  });

  it('never lets a point pass its neighbours in X: it stops at them', () => {
    const four = [...TENT, insert('2', '0.8, 0.5')];
    expect(ran([...four, set('1', '0.95', '1')], '[C.Points]')).toBe('[[0, 0], [0.8, 1], [0.8, 0.5], [1, 0]]');
    expect(ran([...four, set('2', '0.1', '0.5')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [0.5, 0.5], [1, 0]]');
    expect(ran([...four, set('1', '-4', '1')], '[C.Points]')).toBe('[[0, 0], [0, 1], [0.8, 0.5], [1, 0]]');
    expect(ran([...four, set('2', '9', '0.5')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0.5], [1, 0]]');
  });

  it('keeps the first and last point at X 0 and 1, moving them up and down', () => {
    expect(ran([...TENT, set('0', '0.4', '0.6')], '[C.Points]')).toBe('[[0, 0.6], [0.5, 1], [1, 0]]');
    expect(ran([...TENT, set('2', '0.4', '0.6')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0.6]]');
  });

  it('keeps Y from 0 to 1', () => {
    expect(ran([...TENT, set('1', '0.5', '4')], '[C.Points(1)]')).toBe('[0.5, 1]');
    expect(ran([...TENT, set('1', '0.5', '-4')], '[C.Points(1)]')).toBe('[0.5, 0]');
  });

  it('keeps the handles of a moved point between its neighbours', () => {
    const bezier: SolidScriptLine = {
      command: 'bezier_curve',
      values: { from: '0, 0', from_handle: '0.4, 0', to_handle: '0.6, 1', to: '1, 1', detail: '8', into: 'C' },
    };
    const mid: SolidScriptLine = insert('1', '0.5, 0.5', 'Bezier');
    expect(ran([bezier, mid, set('1', '0.1', '0.5')], '[C.Segments(0).Handles(1)]')).not.toBe('');
    const handles = ran([bezier, mid, set('1', '0.1', '0.5')], '[C.Segments]');
    expect(handles).not.toContain('NaN');
  });

  it('stops on a Point past the last point, or an X or Y that is not a number', () => {
    for (const at of ['-1', '3', '0.5'])
      expect(ran([...TENT, set(at, '0.5', '0.5')], '[C]')).toContain(
        'Point needs a whole number from 0 to 2, because the curve has 3 points',
      );
    expect(ran([...TENT, set('1', '"left"', '0.5')], '[C]')).toContain('Set Curve Point needs a number in X');
    expect(ran([...TENT, set('1', '0.5', '"up"')], '[C]')).toContain('Set Curve Point needs a number in Y');
  });
});

describe('Remove Segment on a curve', () => {
  const four = [...TENT, insert('2', '0.8, 0.5')];

  it('takes the segment and the point it ends at, so the points either side join up', () => {
    expect(ran([...four, remove('[C]', '1')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0]]');
    expect(ran([...four, remove('[C]', '0')], '[C.Points]')).toBe('[[0, 0], [0.8, 0.5], [1, 0]]');
  });

  it('takes the point the last segment starts at, so the curve keeps both ends', () => {
    expect(ran([...four, remove('[C]', '2')], '[C.Points]')).toBe('[[0, 0], [0.5, 1], [1, 0]]');
    expect(ran([...four, remove('[C]', '2')], '[C.Segments.Count]')).toBe('2');
    expect(ran([...TENT, remove('[C]', '1')], '[C.Points]')).toBe('[[0, 0], [1, 0]]');
  });

  it('keeps the kind of the segment that runs on', () => {
    const mixed = [linear(), insert('1', '0.5, 0.5', 'Quadratic'), insert('2', '0.8, 0.5', 'Bezier')];
    expect(ran([...mixed, remove('[C]', '0')], '[C.Segments(0).Kind]')).toBe('Quadratic');
    expect(ran([...mixed, remove('[C]', '1')], '[C.Segments(1).Kind]')).toBe('Bezier');
  });

  it('writes to Into and leaves the curve it was given', () => {
    expect(ran([...four, remove('[C]', '1', 'D')], '[C.Length]')).toBe('4');
    expect(ran([...four, remove('[C]', '1', 'D')], '[D.Length]')).toBe('3');
    expect(ran([...four, remove('[C]', '1', 'D')], '[=IsCurve([D])]')).toBe('Yes');
  });

  it('stops on a Segment outside 0 to the last segment, and on a curve of one segment', () => {
    for (const segment of ['-1', '3', '1.5'])
      expect(ran([...four, remove('[C]', segment)], '[C]')).toContain(
        'Segment needs a whole number from 0 to 2, because the curve has 3 segments',
      );
    expect(ran([linear(), remove('[C]', '0')], '[C]')).toContain('Remove Segment needs a curve of at least 2 segments');
  });
});

describe('Remove Segment on a path', () => {
  const path = (points: string): SolidScriptLine => ({ command: 'path_from_points', values: { points, into: 'P' } });
  const four = path('[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]');

  it('takes the segment and the point it ends at, so the points either side join up', () => {
    expect(ran([four, remove('[P]', '1', 'P')], '[P.Points]')).toBe('[[0, 0, 0], [1, 0, 0], [3, 0, 0]]');
    expect(ran([four, remove('[P]', '0', 'P')], '[P.Points]')).toBe('[[0, 0, 0], [2, 0, 0], [3, 0, 0]]');
  });

  it('takes the point the last segment starts at, so both ends stay', () => {
    expect(ran([four, remove('[P]', '2', 'P')], '[P.Points]')).toBe('[[0, 0, 0], [1, 0, 0], [3, 0, 0]]');
  });

  it('opens a closed path at the segment, keeping every point', () => {
    const ring = path('[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]');
    const close: SolidScriptLine = { command: 'set_path_closed', values: { path: '[P]', closed: 'Yes', into: 'P' } };
    expect(ran([ring, close, remove('[P]', '3', 'P')], '[P.Points]')).toBe(
      '[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]',
    );
    expect(ran([ring, close, remove('[P]', '1', 'P')], '[P.Points]')).toBe(
      '[[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]]',
    );
    expect(ran([ring, close, remove('[P]', '1', 'P')], '[P.Closed]')).toBe('No');
    expect(ran([ring, close, remove('[P]', '1', 'P')], '[P.Points.Count]')).toBe('4');
  });

  it('keeps tilts and Bezier handles with their points', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[P]', tilt: '[=[$Index] * 10]', into: 'P' } };
    expect(ran([four, tilt, remove('[P]', '1', 'P')], '[P.Tilts]')).toBe('[0, 10, 30]');
    expect(ran([four, tilt, remove('[P]', '2', 'P')], '[P.Tilts]')).toBe('[0, 10, 30]');
    const bend: SolidScriptLine = { command: 'set_path_type', values: { path: '[P]', type: 'Bezier', into: 'P' } };
    expect(ran([four, bend, remove('[P]', '1', 'P')], '[P.HandleTypesLeft]')).toBe('[Vector, Vector, Vector]');
    expect(ran([four, bend, remove('[P]', '1', 'P')], '[P.HandleTypesRight]')).toBe('[Vector, Vector, Vector]');
  });

  it('works on a list of points, and leaves the original when Into is another name', () => {
    const list: SolidScriptLine = remove('[0, 0, 0], [1, 0, 0], [2, 0, 0]', '0', 'Q');
    expect(ran([list], '[Q.Points]')).toBe('[[0, 0, 0], [2, 0, 0]]');
    expect(ran([four, remove('[P]', '1', 'Q')], '[P.Points.Count]')).toBe('4');
  });

  it('turns a Catmull Rom path into Bezier first', () => {
    const catmull: SolidScriptLine = {
      command: 'set_path_type',
      values: { path: '[P]', type: 'Catmull Rom', into: 'P' },
    };
    expect(ran([four, catmull, remove('[P]', '1', 'P')], '[P.HandleTypesLeft]')).toBe('[Align, Align, Align]');
  });

  it('stops on a Segment out of range, a path of 2 points, and something that is not a path', () => {
    for (const segment of ['-1', '3', '0.5'])
      expect(ran([four, remove('[P]', segment, 'P')], '[P]')).toContain(
        'Segment needs a whole number from 0 to 2, because the path has 3 segments',
      );
    expect(ran([path('[0, 0, 0], [1, 0, 0]'), remove('[P]', '0', 'P')], '[P]')).toContain(
      'Remove Segment needs a path of at least 3 points',
    );
    expect(ran([remove('[0, 0, 0]', '0')], '[C]')).toContain('From needs a Path or Curve');
  });
});
