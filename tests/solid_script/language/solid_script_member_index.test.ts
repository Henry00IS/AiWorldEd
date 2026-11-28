import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptMemberWriteParse,
  solidScriptNameDotProblem,
  solidScriptNameIsDataWrite,
  solidScriptNameIsModeWrite,
  solidScriptNameIsPositionWrite,
  solidScriptNameIsUvWrite,
} from '@/solid_script/language/solid_script_name_rules.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const FAR: SolidScriptLine = { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } };

/**
 * Makes a line.
 *
 * @param command Command id.
 * @param values Field values.
 * @returns Line.
 */
function line(command: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command, values };
}

/**
 * Makes a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return line('variable', { name, value });
}

/**
 * Makes an Echo line.
 *
 * @param value What to write.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return line('echo', { value });
}

/**
 * Runs lines and returns what Echo wrote, or the error.
 *
 * @param lines Lines.
 * @returns Messages or the error.
 */
function run(lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? result.error.message : result.messages;
}

/** Two cubes with both objects selected. */
const OBJECTS = [CUBE, FAR, line('select_objects')];

/** One cube with all its faces selected. */
const FACES = [CUBE, line('select_objects'), line('select_faces', { which: 'All' })];

/** A mesh with its face corners held as Box. */
const MESH = [
  line('mesh_from_solids'),
  CUBE,
  END,
  line('select_objects'),
  set('Box', '[$Selected.Objects(0)]'),
  set('Corners', '[Box.Faces(0).FaceCorners]'),
];

describe('Item numbers on a member write, the same for every member', () => {
  it('sets one Mode with Modes(1) and leaves the others', () => {
    expect(
      run([
        ...OBJECTS,
        set('$Selected.Objects.Modes(1)', 'Subtractive'),
        echo('[$Selected.Objects(0).Mode] [$Selected.Objects(1).Mode]'),
      ]),
    ).toEqual(['Additive Subtractive']);
  });

  it('sets one Data value with Data.Key(2) and leaves the other faces', () => {
    expect(
      run([
        ...FACES,
        set('$Selected.Faces.Data.Kind(2)', 'roof'),
        echo('[$Selected.Faces(0).Data.Kind]|[$Selected.Faces(1).Data.Kind]|[$Selected.Faces(2).Data.Kind]'),
      ]),
    ).toEqual(['||roof']);
  });

  it('sets the UVs of one face with UVs(1)', () => {
    expect(
      run([
        ...FACES,
        set('$Selected.Faces.UVs(1)', '[0, 0], [3, 0], [3, 3], [0, 3]'),
        echo('[$Selected.Faces(1).UVs]'),
        echo('[$Selected.Faces(0).UVs]'),
      ]),
    ).toEqual(['[[0, 0, 0], [3, 0, 0], [3, 3, 0], [0, 3, 0]]', expect.not.stringContaining('[3, 3, 0]')]);
  });

  it('sets the UV of one face corner of a mesh with UV(2)', () => {
    expect(run([...MESH, set('Corners.UV(2)', '0.25, 0.75, 0'), echo('[Corners(2).UV] [Corners(1).UV]')])).toEqual([
      expect.stringMatching(/^\[0\.25, 0\.75, 0\] (?!\[0\.25)/),
    ]);
  });

  it('sets one corner with Positions(i), one axis with Positions(i).Y, and counts the corners of faces', () => {
    const lines = [
      ...FACES,
      set('$Selected.Faces.Positions(0).Y', '5'),
      echo('[=Max([$Selected.Objects(0).Vertices.Positions.Ys])]'),
    ];
    expect(run(lines)).toEqual(['5']);
    expect(run([...FACES, set('$Selected.Faces.Positions(8)', '0, 0, 0')])).toContain(
      '$Selected.Faces.Positions(8) is past the end: there are 8 corners, numbered from 0',
    );
  });

  it('reads the item number from a variable or a formula', () => {
    expect(
      run([
        ...OBJECTS,
        set('N', '1'),
        set('$Selected.Objects.Modes([N])', 'Intersecting'),
        set('$Selected.Objects.Data.Mark([=[N] - 1])', 'first'),
        echo('[$Selected.Objects(0).Mode] [$Selected.Objects(1).Mode] [$Selected.Objects(0).Data.Mark]'),
      ]),
    ).toEqual(['Additive Intersecting first']);
  });

  it('keeps the 🔁 per-item value, with the number the item has in the list', () => {
    expect(
      run([
        ...FACES,
        set('$Selected.Faces.Data.Slot(3)', '[=[$Index] * 10 + [$Count]]'),
        echo('[$Selected.Faces(3).Data.Slot]'),
      ]),
    ).toEqual(['36']);
  });

  it('stops with one clear message per member when the number is missing, past the end or not a whole number', () => {
    const cases: [string, RegExp][] = [
      ['$Selected.Objects.Modes()', /\.Modes\(\) needs a solid number, such as .*\.Modes\(0\)/],
      ['$Selected.Objects.Modes(2)', /\.Modes\(2\) is past the end: there are 2 solids, numbered from 0/],
      ['$Selected.Objects.Data.Kind(5)', /\.Data\.Kind\(5\) is past the end: there are 2 items, numbered from 0/],
      ['$Selected.Objects.Modes(1.5)', /the item number in .*Modes\(…\) must be a whole number from 0, not 1\.5/],
      ['$Selected.Objects.Modes(-1)', /must be a whole number from 0, not -1/],
    ];
    for (const [name, message] of cases)
      expect(run([...OBJECTS, set(name, 'Subtractive')]), name).toEqual(expect.stringMatching(message));
    expect(run([...FACES, set('$Selected.Faces.UVs(9)', '[0, 0]')])).toContain('there are 6 faces');
  });

  it('still sets every item when the member has no number', () => {
    expect(run([...OBJECTS, set('$Selected.Objects.Modes', 'Subtractive'), echo('[$Selected.Objects.Modes]')])).toEqual(
      ['[Subtractive, Subtractive]'],
    );
  });
});

describe('Names the member write reads', () => {
  it('reads the owner, member, item number, key and axis of each kind', () => {
    expect(solidScriptMemberWriteParse('$Selected.Vertices.Positions(0).X')).toMatchObject({
      kind: 'position',
      owner: '$Selected.Vertices',
      item: '0',
      axis: 'x',
    });
    expect(solidScriptMemberWriteParse('Box.Faces(1).Data.Height(2)')).toMatchObject({
      kind: 'data',
      owner: 'Box.Faces(1)',
      item: '2',
      key: 'Height',
    });
    expect(solidScriptMemberWriteParse('Faces.UVs(3)')).toMatchObject({ kind: 'uvs', owner: 'Faces', item: '3' });
    expect(solidScriptMemberWriteParse('Corners.UV')).toMatchObject({ kind: 'uv', owner: 'Corners', item: null });
    expect(solidScriptMemberWriteParse('$Selected.Objects.Modes(0)')).toMatchObject({ kind: 'mode', item: '0' });
    expect(solidScriptMemberWriteParse('Box.Data.Mode')).toMatchObject({ kind: 'data', key: 'Mode' });
    expect(solidScriptMemberWriteParse('Pos.X')).toBeNull();
    expect(solidScriptMemberWriteParse('$Box.Mode')).toBeNull();
  });

  it('accepts a number on every writable member before the run', () => {
    for (const name of [
      '$Selected.Objects.Modes(0)',
      '$Selected.Faces.UVs(0)',
      '$Selected.Faces.Data.Kind(1)',
      'Faces.Positions(2).Z',
    ])
      expect(solidScriptNameDotProblem(name, 'set'), name).toBe('');
    expect(solidScriptNameIsModeWrite('Objects.Modes(1)')).toBe(true);
    expect(solidScriptNameIsUvWrite('Faces.UVs(1)')).toBe(true);
    expect(solidScriptNameIsDataWrite('Faces.Data.Kind(1)')).toBe(true);
    expect(solidScriptNameIsPositionWrite('Faces.Positions(1).X')).toBe(true);
  });
});
