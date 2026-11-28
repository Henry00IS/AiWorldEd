import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const set = (name: string, value: string): SolidScriptLine => line('variable', { name, value });
const echo = (value: string): SolidScriptLine => line('echo', { value });

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
}

/**
 * Messages of a run that must succeed.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * What one formula gives, as Echo writes it.
 *
 * @param formula Formula without its [= ].
 * @returns Text.
 */
function formula(formula: string): string {
  return printed(echo(`[=${formula}]`))[0] ?? '';
}

/**
 * The error a run stops with.
 *
 * @param lines Lines.
 * @returns Error text, or an empty text when it ran.
 */
function failure(...lines: SolidScriptLine[]): string {
  return run(...lines).error?.message ?? '';
}

/**
 * Corners of every solid a run that must succeed built, rounded, so two runs
 * can be compared.
 *
 * @param lines Lines.
 * @returns Corners per solid.
 */
function corners(...lines: SolidScriptLine[]): string[][] {
  const result = run(...lines);
  expect(result.error?.message ?? null).toBeNull();
  const leaves = result.shapes.flatMap((shape: SolidScriptShape) => solidScriptShapeLeavesPositive(shape));
  expect(leaves.length).toBeGreaterThan(0);
  return leaves.map((leaf) =>
    'points' in leaf && Array.isArray(leaf.points)
      ? leaf.points.map((point) =>
          point
            .toArray()
            .map((value) => value.toFixed(4))
            .join(','),
        )
      : [leaf.kind],
  );
}

/**
 * Lines that extrude one flat path drawn by a line.
 *
 * @param drawn Line that draws the path, a block or not.
 * @param inside Lines inside the drawing block, which then gets an End.
 * @returns Lines.
 */
function extruded(drawn: SolidScriptLine, inside: SolidScriptLine[] | null = null): SolidScriptLine[] {
  return [line('linear_extrude', { height: '1' }), drawn, ...(inside ? [...inside, END] : []), END];
}

describe('SolidScript flat vectors: [x, y] is [x, y, 0]', () => {
  it('reads [x, y] in a field the same as x, y', () => {
    expect(printed(set('V', '[1, 2]'), echo('[V]'))).toEqual(printed(set('V', '1, 2'), echo('[V]')));
    expect(printed(set('V', '[1, 2], [3, 4]'), echo('[V]'))).toEqual(['[[1, 2], [3, 4]]']);
  });

  it('reads brackets of one number or of four as a list, and stops on a vector with a number left out', () => {
    expect(printed(set('V', '[1,2,3,4]'), echo('[V.Count]'))).toEqual(['4']);
    expect(printed(set('V', '[7]'), echo('[V.Count]'))).toEqual(['1']);
    expect(failure(set('V', '[1,]'))).toMatch(/Did you mean to write \[1, 0\]\?/);
  });

  it('draws a Polygon from [x, y] points as from [x, y, 0] points, typed or from a list', () => {
    const flat = corners(...extruded(line('polygon', { points: '[0, 0], [2, 0], [2, 2], [0, 2]' }), []));
    const full = corners(...extruded(line('polygon', { points: '[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]' }), []));
    expect(flat).toEqual(full);
    const listed = [set('P', '[0, 0], [2, 0], [2, 2], [0, 2]'), ...extruded(line('polygon', { points: '[P]' }), [])];
    expect(corners(...listed)).toEqual(full);
    expect(corners(...extruded(line('polygon', { points: '[0, 0], [2, 0, 0], [2, 2], [0, 2, 0]' }), []))).toEqual(full);
  });

  it('places a Point of x, y like one of x, y, 0, however it is written', () => {
    const rest = [line('point', { position: '2, 0, 0' }), line('point', { position: '2, 2, 0' })];
    const full = corners(...extruded(line('polygon'), [line('point', { position: '1, 2, 0' }), ...rest]));
    for (const position of ['1, 2', '[1, 2]', '[=[1, 2]]', '[=Vector(1, 2)]'])
      expect(corners(...extruded(line('polygon'), [line('point', { position }), ...rest]))).toEqual(full);
  });

  it('reads a Square Size and a Top Scale in brackets, leaving out a Z', () => {
    const square = (size: string) => corners(...extruded(line('square', { size })));
    expect(square('[2, 3]')).toEqual(square('2, 3'));
    expect(square('[2, 3, 4]')).toEqual(square('2, 3'));
    expect(square('[=[2, 3, 4]]')).toEqual(square('2, 3'));
    const tapered = (scale: string) =>
      corners(line('linear_extrude', { height: '1', scale }), line('square', { size: '1, 1' }), END);
    expect(tapered('[0.5, 0.5]')).toEqual(tapered('0.5, 0.5'));
    expect(tapered('0.5, 0.5, 0.5')).toEqual(tapered('0.5, 0.5'));
  });

  it('moves by and to x, y as by and to x, y, 0', () => {
    const moved = (command: string, key: string, value: string) =>
      printed(line('cube', { size: '1', into: 'B' }), line(command, { [key]: value, of: '[B]' }), echo('[B.Center]'));
    for (const value of ['1, 2', '[1, 2]', '[=[1, 2]]', '[=Vector(1, 2)]']) {
      expect(moved('move_by', 'by', value)).toEqual(moved('move_by', 'by', '1, 2, 0'));
      expect(moved('move_to', 'to', value)).toEqual(moved('move_to', 'to', '1, 2, 0'));
    }
  });

  it('gives a Cube of x, y a Z of 0, which is no size', () => {
    expect(failure(line('cube', { size: '[1, 2]' }))).toMatch(/greater than 0/);
  });

  it('takes [x, y] points in every points field', () => {
    const path = (points: string) => printed(line('path_from_points', { points, into: 'W' }), echo('[W.Points]'));
    expect(path('[0, 0], [1, 0], [1, 1]')).toEqual(path('[0, 0, 0], [1, 0, 0], [1, 1, 0]'));
    const sweep = (profile: string) =>
      corners(
        line('path_from_points', { points: '[0, 0, 0], [1, 0, 0], [2, 1, 0]', into: 'W' }),
        line('sweep_along_path', { path: '[W]', profile }),
      );
    expect(sweep('[0, 0], [0.2, 0], [0.2, 0.1]')).toEqual(sweep('[0, 0, 0], [0.2, 0, 0], [0.2, 0.1, 0]'));
    const tetra = (points: string) => corners(line('polyhedron', { points }), END);
    expect(tetra('[0, 0], [1, 0], [0, 1], [0, 0, 1]')).toEqual(tetra('[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]'));
    const hull = (points: string) => corners(line('hull', { points }), END);
    expect(hull('[=[[0, 0], [1, 0], [0, 1], [0, 0, 1]]]')).toEqual(hull('[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]'));
  });

  it('fills a loop of [x, y] points like one of [x, y, 0] points', () => {
    const filled = (paths: string) => corners(line('fill_paths', { paths }));
    const full = filled('[0, 0, 0], [0, 2, 0], [2, 2, 0], [2, 0, 0]');
    expect(filled('[0, 0], [0, 2], [2, 2], [2, 0]')).toEqual(full);
    expect(filled('[=[[0, 0], [0, 2], [2, 2], [2, 0]]]')).toEqual(full);
  });

  it('places copies at [x, y] points as at [x, y, 0] points', () => {
    const placed = (at: string) => corners(line('place_at_points', { at }), line('cube', { size: '1' }), END);
    expect(placed('[0, 0], [3, 1]')).toEqual(placed('[0, 0, 0], [3, 1, 0]'));
    expect(placed('[=[[0, 0], [3, 1]]]')).toEqual(placed('[0, 0, 0], [3, 1, 0]'));
  });

  it('makes Points at a flat vector', () => {
    expect(printed(line('points', { count: '3', at: '[=Vector([$Index], 0)]', into: 'P' }), echo('[P]'))).toEqual([
      '[[0, 0, 0], [1, 0, 0], [2, 0, 0]]',
    ]);
    expect(printed(line('points', { count: '2', at: '[=[[$Index], 1]]', into: 'P' }), echo('[P]'))).toEqual([
      '[[0, 1, 0], [1, 1, 0]]',
    ]);
  });

  it('places a mesh Vertex at x, y and reads a UV in brackets', () => {
    const mesh = (position: string, uv = '') =>
      printed(
        line('mesh', { into: 'M' }),
        line('vertex', { position, uv }),
        line('vertex', { position: '1, 0, 0', uv }),
        line('vertex', { position: '0, 1, 0', uv }),
        line('face'),
        END,
        echo('[M.Vertices.Positions]|[M.Faces(0).UVs]'),
      );
    expect(mesh('[0.5, 0.5]')).toEqual(mesh('0.5, 0.5, 0'));
    expect(mesh('[=Vector(0.5, 0.5)]')).toEqual(mesh('0.5, 0.5, 0'));
    expect(mesh('0, 0, 0', '[0.5, 0.25]')).toEqual(mesh('0, 0, 0', '0.5, 0.25'));
    expect(mesh('0, 0, 0', '[=[0.5, 0.25, 0]]')).toEqual(mesh('0, 0, 0', '0.5, 0.25'));
  });

  it('reads a Vector input of two or three numbers, in brackets or not', () => {
    const input = (value: string) =>
      printed(line('input', { name: 'In', type: 'Vector', default: value }), echo('[In]'));
    expect(input('1, 2')).toEqual(['[1, 2, 0]']);
    expect(input('[1, 2]')).toEqual(['[1, 2, 0]']);
    expect(input('[1, 2, 3]')).toEqual(['[1, 2, 3]']);
    expect(failure(line('input', { name: 'In', type: 'Vector', default: '1' }))).toMatch(/two or three numbers/);
    expect(failure(line('input', { name: 'In', type: 'Vector', default: '1, 2', min: '0', max: '1' }))).toMatch(
      /from 0 to 1/,
    );
  });

  it('reads a Path input of [x, y] points like [x, y, 0]', () => {
    const path = (value: string) =>
      printed(line('input', { name: 'In', type: 'Path', default: value }), echo('[In.Points]'));
    expect(path('[0, 0], [1, 0], [1, 1]')).toEqual(path('[0, 0, 0], [1, 0, 0], [1, 1, 0]'));
  });
});

describe('SolidScript flat vectors keep $[ escapes as written', () => {
  it('leaves escaped brackets as text, never a vector', () => {
    expect(printed(echo('$[1, 2$]'))).toEqual(['[1, 2]']);
    expect(printed(echo('$[0, 0$], $[2, 0$]'))).toEqual(['[0, 0], [2, 0]']);
    expect(formula('"$[1, 2$]"')).toBe('[1, 2]');
    expect(formula('$[1, 2$]')).toBe('[1, 2]');
    expect(formula('Len($[1, 2$])')).toBe('2');
    expect(formula('$[1, 2$] + $[1, 2, 3$]')).toBe('[2, 4, 3]');
  });
});

describe('SolidScript flat vectors in Curves', () => {
  /**
   * Corners of a Curve profile extruded.
   *
   * @param curve Curve field text.
   * @param before Lines before.
   * @returns Corners.
   */
  const profile = (curve: string, before: SolidScriptLine[] = []) =>
    corners(...before, ...extruded(line('curve_profile', { curve, height: '1', depth: '0.2' })));

  it('reads the same points in the Curve field, in a Curve input, and from a list', () => {
    const typed = profile('[0, 1], [0.5, 0.5], [1, 0]');
    const input = [line('input', { name: 'C', type: 'Curve', default: '[0, 1], [0.5, 0.5], [1, 0]' })];
    expect(profile('[C]', input)).toEqual(typed);
    expect(profile('[=[[0, 1], [0.5, 0.5], [1, 0]]]')).toEqual(typed);
    expect(profile('[P]', [set('P', '[0, 1], [0.5, 0.5], [1, 0]')])).toEqual(typed);
    expect(profile('[0, 1, 0], [0.5, 0.5, 0], [1, 0, 0]')).toEqual(typed);
    const flatInput = [line('input', { name: 'C', type: 'Curve', default: '[0, 1, 0], [0.5, 0.5, 0], [1, 0, 0]' })];
    expect(profile('[C]', flatInput)).toEqual(typed);
  });

  it('still stops on a curve whose X leaves 0 to 1', () => {
    expect(failure(...extruded(line('curve_profile', { curve: '[0, 1], [2, 0]' })))).toMatch(/must be a curve/);
  });
});

describe('SolidScript flat vectors in formulas', () => {
  it('pads Vector() to three numbers, one number filling every axis', () => {
    expect(formula('Vector(1, 2)')).toBe('[1, 2, 0]');
    expect(formula('Vector(1)')).toBe('[1, 1, 1]');
    expect(formula('Vector(1, 2, 3)')).toBe('[1, 2, 3]');
    expect(failure(echo('[=Vector(1, 2, 3, 4)]'))).toMatch(/one, two or three numbers/);
  });

  it('keeps a list of two numbers as written, so lists still count and loop the same', () => {
    expect(formula('[1, 2]')).toBe('[1, 2]');
    expect(formula('Len([1, 2])')).toBe('2');
    expect(formula('Sum([1, 2])')).toBe('3');
    expect(formula('Reversed([3, 4])')).toBe('[4, 3]');
    const looped = printed(
      set('L', '[=[3, 4]]'),
      set('N', '0'),
      line('for_each', { list: '[L]', item: 'I' }),
      set('N', '[=[N] + 1]'),
      END,
      echo('[N]'),
    );
    expect(looped).toEqual(['2']);
  });

  it('reads the Z of a flat vector as 0, and can set it', () => {
    expect(formula('[1, 2].Z')).toBe('0');
    expect(formula('Vector(1, 2).Z')).toBe('0');
    expect(printed(set('P', '[=[1, 2]]'), echo('[P.Z]|[P.X]|[P.Length]'))).toEqual(['0|1|2.236067977']);
    expect(printed(set('P', '[=[1, 2]]'), set('P.Z', '5'), echo('[P]'))).toEqual(['[1, 2, 5]']);
    expect(printed(set('P', '[=[1, 2]]'), set('P.X', '5'), echo('[P]'))).toEqual(['[5, 2]']);
    expect(formula('$[for (p = $[$[1, 2$], $[3, 4$]$]) p.Z$]')).toBe('[0, 0]');
  });

  it('combines a flat and a full vector part by part, the flat one with Z 0', () => {
    expect(formula('[1, 2] + [1, 2, 3]')).toBe('[2, 4, 3]');
    expect(formula('[1, 2, 3] - [1, 2]')).toBe('[0, 0, 3]');
    expect(formula('[1, 2] * [1, 2, 3]')).toBe('[1, 4, 0]');
    expect(formula('Vector(1, 2) + [1, 2]')).toBe('[2, 4, 0]');
    expect(failure(echo('[=[1, 2, 3, 4] + [1, 2]]'))).toMatch(/lists of 4 and 2 numbers/);
    expect(failure(echo('[=[1] + [1, 2]]'))).toMatch(/lists of 1 and 2 numbers/);
  });

  it('compares [x, y] as [x, y, 0]', () => {
    expect(formula('[1, 2] == [1, 2, 0]')).toBe('Yes');
    expect(formula('[1, 2] != [1, 2, 0]')).toBe('No');
    expect(formula('[1, 2] == [1, 2, 1]')).toBe('No');
    expect(formula('[1, 2] < [2, 3, 4]')).toBe('Yes');
    expect(formula('[1, 2] < [2, 3, -1]')).toBe('No');
    expect(formula('["a", "b"] == ["a", "b", 0]')).toBe('No');
  });

  it('lets every vector function take a flat vector as one with Z 0', () => {
    const pairs: [string, string][] = [
      ['Cross([1, 0], [0, 1])', 'Cross([1, 0, 0], [0, 1, 0])'],
      ['ToCylinder([1, 2])', 'ToCylinder([1, 2, 0])'],
      ['ToSphere([1, 2])', 'ToSphere([1, 2, 0])'],
      ['RotateVector([1, 2], [0, 1, 0], 90)', 'RotateVector([1, 2, 0], [0, 1, 0], 90)'],
      ['RotateVector([1, 2], [0, 1], 90, [0, 0])', 'RotateVector([1, 2, 0], [0, 1, 0], 90, [0, 0, 0])'],
      ['RotateEuler([1, 2], [0, 90])', 'RotateEuler([1, 2, 0], [0, 90, 0])'],
      ['ApplyRotation([1, 2], Rotation(0, 0, 90))', 'ApplyRotation([1, 2, 0], Rotation(0, 0, 90))'],
      ['RotationAround([0, 1], 90)', 'RotationAround([0, 1, 0], 90)'],
      [
        'TransformPoint(Transform([1, 0], [0, 0, 0], [1, 1, 1]), [1, 2])',
        'TransformPoint(Transform([1, 0, 0], [0, 0, 0], [1, 1, 1]), [1, 2, 0])',
      ],
      [
        'TransformDirection(Transform([0, 0, 0], [0, 0, 90], [2, 2]), [1, 2])',
        'TransformDirection(Transform([0, 0, 0], [0, 0, 90], [2, 2, 0]), [1, 2, 0])',
      ],
      [
        'ProjectPoint(Transform([1, 0, 0], [0, 0, 0], [1, 1, 1]), [1, 2])',
        'ProjectPoint(Transform([1, 0, 0], [0, 0, 0], [1, 1, 1]), [1, 2, 0])',
      ],
      ['Noise([1, 2])', 'Noise([1, 2, 0])'],
      ['Voronoi([1, 2])', 'Voronoi([1, 2, 0])'],
      ['Gabor([1, 2])', 'Gabor([1, 2, 0])'],
      ['Gradient([0.5, 0.5])', 'Gradient([0.5, 0.5, 0])'],
      ['Dot([1, 2], [3, 4, 5])', 'Dot([1, 2, 0], [3, 4, 5])'],
      ['Distance([0, 0], [3, 4, 0])', 'Distance([0, 0, 0], [3, 4, 0])'],
      ['Lerp([0, 0], [2, 2, 2], 0.5)', 'Lerp([0, 0, 0], [2, 2, 2], 0.5)'],
      ['FlipToward([1, 2], [-1, -2, 0])', 'FlipToward([1, 2, 0], [-1, -2, 0])'],
      ['Reflect([1, 2], [0, 1, 0])', 'Reflect([1, 2, 0], [0, 1, 0])'],
      ['ProjectOnPlane([1, 2], [0, 0], [0, 1, 0])', 'ProjectOnPlane([1, 2, 0], [0, 0, 0], [0, 1, 0])'],
      ['Slerp([1, 0], [0, 1, 0], 0.5)', 'Slerp([1, 0, 0], [0, 1, 0], 0.5)'],
    ];
    for (const [flat, full] of pairs) expect(formula(flat), flat).toBe(formula(full));
  });

  it('keeps flat answers flat where both vectors are flat', () => {
    expect(formula('Normalize([3, 4])')).toBe('[0.6, 0.8]');
    expect(formula('Lerp([0, 0], [2, 2], 0.5)')).toBe('[1, 1]');
    expect(formula('[1, 2] * 2')).toBe('[2, 4]');
  });
});

describe('SolidScript flat vectors in the editor checks', () => {
  /**
   * Warnings of the editor checks for one line.
   *
   * @param lines Lines.
   * @returns Warning texts.
   */
  const warned = (...lines: SolidScriptLine[]) =>
    solidScriptKindCheck(solidScriptDocumentCreate(lines)).map((warning) => warning.text);

  it('points out a flat and a full vector written together in math, so a missing number shows', () => {
    const texts = warned(echo('[=[1, 2] + [1, 2, 3]]'));
    expect(texts.some((text) => /\[1, 2\] counts as \[1, 2, 0\]/.test(text))).toBe(true);
    expect(warned(echo('[=[1, 2, 0] + [1, 2, 3]]'))).toEqual([]);
    expect(warned(echo('[=[1, 2] + [3, 4]]'))).toEqual([]);
  });

  it('accepts [x, y] in vector fields without a squiggle', () => {
    expect(warned(line('cube', { size: '1', into: 'B' }), line('move_by', { by: '[1, 2]', of: '[B]' }))).toEqual([]);
    expect(warned(...extruded(line('square', { size: '[2, 3]' })))).toEqual([]);
  });
});
