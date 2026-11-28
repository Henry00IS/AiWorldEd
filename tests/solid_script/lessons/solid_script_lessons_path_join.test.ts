import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Makes a Path From Points line.
 *
 * @param into Variable to write.
 * @param points Points.
 * @returns Line.
 */
function made(into: string, points: string): SolidScriptLine {
  return { command: 'path_from_points', values: { points, into } };
}

/** Three points along X in [A], and two more on from them in [B]. */
const PREP: SolidScriptLine[] = [made('A', '[0, 0, 0], [2, 0, 0], [4, 0, 0]'), made('B', '[10, 0, 0], [12, 0, 0]')];

/**
 * Runs lines after the paths and prints what Echo reads.
 *
 * @param lines Lines after the paths.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...PREP, ...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/**
 * Makes a Join Paths line.
 *
 * @param values Fields to override.
 * @returns Line.
 */
function join(values: Record<string, string> = {}): SolidScriptLine {
  return { command: 'join_paths', values: { path: '[A]', with: '[B]', add: 'End', into: 'J', ...values } };
}

/**
 * Makes an Insert Path line.
 *
 * @param at Position.
 * @param values Fields to override.
 * @returns Line.
 */
function insert(at: string, values: Record<string, string> = {}): SolidScriptLine {
  return { command: 'insert_path', values: { path: '[A]', with: '[B]', at, into: 'J', ...values } };
}

describe('Join Paths', () => {
  it('adds the other path after the last point, or before the first', () => {
    expect(ran([join()], '[J.Points.Count]')).toBe('5');
    expect(ran([join()], '[J.Points(3)]')).toBe('[10, 0, 0]');
    expect(ran([join({ add: 'Start' })], '[J.Points(0)]')).toBe('[10, 0, 0]');
    expect(ran([join({ add: 'Start' })], '[J.Points(4)]')).toBe('[4, 0, 0]');
  });

  it('takes the words in any case, and End when empty', () => {
    expect(ran([join({ add: 'start' })], '[J.Points(0)]')).toBe('[10, 0, 0]');
    expect(ran([join({ add: '' })], '[J.Points(0)]')).toBe('[0, 0, 0]');
    expect(ran([join({ add: 'Middle' })], '[J]')).toContain('Add At takes End or Start');
  });

  it('adds several paths in the order given, from a comma list or a list of Paths', () => {
    const third = made('C', '[20, 0, 0], [22, 0, 0]');
    expect(ran([third, join({ with: '[B], [C]' })], '[J.Points(5)]')).toBe('[20, 0, 0]');
    expect(ran([third, join({ with: '[C], [B]' })], '[J.Points(3)]')).toBe('[20, 0, 0]');
    expect(ran([third, join({ with: '[C], [B]', add: 'Start' })], '[J.Points(0)]')).toBe('[20, 0, 0]');
    const list: SolidScriptLine = { command: 'variable', values: { name: 'Both()', value: '[B]' } };
    const more: SolidScriptLine = { command: 'variable', values: { name: 'Both()', value: '[C]' } };
    expect(ran([third, list, more, join({ with: '[Both]' })], '[J.Points.Count]')).toBe('7');
  });

  it('keeps a point shared where one path ends at the place the next starts', () => {
    const meets = made('B', '[4, 0, 0], [6, 0, 0]');
    expect(ran([meets, join()], '[J.Points.Count]')).toBe('4');
    expect(ran([meets, join()], '[J.Length]')).toBe('6');
  });

  it('joins a gap with a straight stretch, so the length counts it', () => {
    expect(ran([join()], '[J.Length]')).toBe('12');
  });

  it('takes a list of points for either path', () => {
    expect(ran([join({ path: '[0, 0, 0], [1, 0, 0]', with: '[5, 0, 0], [6, 0, 0]' })], '[J.Points.Count]')).toBe('4');
  });

  it('leaves the paths it was given, and writes the result open', () => {
    expect(ran([join()], '[A.Points.Count]')).toBe('3');
    expect(ran([join()], '[B.Points.Count]')).toBe('2');
    expect(ran([join()], '[J.Closed]')).toBe('No');
    expect(ran([join({ into: 'A' })], '[A.Points.Count]')).toBe('5');
  });

  it('keeps tilts, with 0 on a path that has none', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[A]', tilt: '30', into: 'A' } };
    expect(ran([tilt, join()], '[J.Tilts]')).toBe('[30, 30, 30, 0, 0]');
    expect(ran([tilt, join({ add: 'Start' })], '[J.Tilts]')).toBe('[0, 0, 30, 30, 30]');
  });

  it('keeps Bezier handles of a curved path', () => {
    const bend: SolidScriptLine = {
      command: 'set_path_type',
      values: { path: '[B]', type: 'Bezier', resolution: '4', into: 'B' },
    };
    expect(ran([bend, join()], '[J.HandlesRight]')).toContain('[10.666666667, 0, 0], [12, 0, 0]]');
    expect(ran([bend, join()], '[J.HandleTypesRight]')).toBe('[Free, Free, Free, Vector, Vector]');
  });

  it('stops on a closed path, saying which and how to open it', () => {
    const close: SolidScriptLine = { command: 'set_path_closed', values: { path: '[B]', closed: 'Yes', into: 'B' } };
    expect(ran([close, join()], '[J]')).toContain('Join Paths needs open paths, but the path to add is closed');
    const closeA: SolidScriptLine = { command: 'set_path_closed', values: { path: '[A]', closed: 'Yes', into: 'A' } };
    expect(ran([closeA, join()], '[J]')).toContain('the first path is closed; open it first with Set Path Closed');
  });

  it('stops on something that is not a path, or a single point', () => {
    expect(ran([join({ with: '5' })], '[J]')).toContain('With:');
    expect(ran([join({ path: '[0, 0, 0]' })], '[J]')).toContain('Join Paths needs a Path or a list of points in Path');
  });
});

describe('Insert Path', () => {
  it('puts the path first at 0, last at the point count, and between points in between', () => {
    expect(ran([insert('0')], '[J.Points(0)]')).toBe('[10, 0, 0]');
    expect(ran([insert('3')], '[J.Points(4)]')).toBe('[12, 0, 0]');
    expect(ran([insert('1')], '[J.Points(1)]')).toBe('[10, 0, 0]');
    expect(ran([insert('1')], '[J.Points(3)]')).toBe('[2, 0, 0]');
    expect(ran([insert('2')], '[J.Points.Count]')).toBe('5');
  });

  it('takes a formula for Position', () => {
    expect(ran([insert('[=[A.Points.Count]]')], '[J.Points(3)]')).toBe('[10, 0, 0]');
  });

  it('stops on a Position below 0, past the end or not whole, saying the range', () => {
    for (const at of ['-1', '4', '1.5', '"two"'])
      expect(ran([insert(at)], '[J]')).toContain(
        'Position needs a whole number from 0 to 3, because the path has 3 points',
      );
  });

  it('keeps a closed path closed and counts its points the same way', () => {
    const closeA: SolidScriptLine = { command: 'set_path_closed', values: { path: '[A]', closed: 'Yes', into: 'A' } };
    expect(ran([closeA, insert('1')], '[J.Closed]')).toBe('Yes');
    expect(ran([closeA, insert('1')], '[J.Points.Count]')).toBe('5');
    expect(ran([closeA, insert('3')], '[J.Points(3)]')).toBe('[10, 0, 0]');
    expect(ran([closeA, insert('4')], '[J.Points.Count]')).toContain('Position needs a whole number from 0 to 3');
  });

  it('stops on a closed path to put in', () => {
    const close: SolidScriptLine = { command: 'set_path_closed', values: { path: '[B]', closed: 'Yes', into: 'B' } };
    expect(ran([close, insert('1')], '[J]')).toContain('Insert Path needs open paths');
  });

  it('puts several paths in one after another', () => {
    const third = made('C', '[20, 0, 0], [22, 0, 0]');
    expect(ran([third, insert('1', { with: '[B], [C]' })], '[J.Points(3)]')).toBe('[20, 0, 0]');
  });

  it('keeps the tilts of both paths where they sit', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[B]', tilt: '45', into: 'B' } };
    expect(ran([tilt, insert('1')], '[J.Tilts]')).toBe('[0, 45, 45, 0, 0]');
  });

  it('writes to Into without changing either path', () => {
    expect(ran([insert('1')], '[A.Points.Count]')).toBe('3');
    expect(ran([insert('1', { into: 'A' })], '[A.Points.Count]')).toBe('5');
  });
});

describe('Copy Path', () => {
  const alias: SolidScriptLine = { command: 'variable', values: { name: 'C', value: '[A]' } };
  const copy: SolidScriptLine = { command: 'copy_path', values: { from: '[A]', into: 'C' } };
  const move: SolidScriptLine = { command: 'move_by', values: { by: '0, 5, 0', of: '[C]' } };

  it('is needed: setting a variable to a Path shares it, so moving one moves the other', () => {
    expect(ran([alias, move], '[A.Points(0)]')).toBe('[0, 5, 0]');
  });

  it('makes a path that moving, turning or scaling does not carry back', () => {
    expect(ran([copy, move], '[A.Points(0)]')).toBe('[0, 0, 0]');
    expect(ran([copy, move], '[C.Points(0)]')).toBe('[0, 5, 0]');
    const turn: SolidScriptLine = { command: 'rotate_by', values: { by: '0, 90, 0', of: '[C]' } };
    const scale: SolidScriptLine = { command: 'scale_by', values: { by: '2, 2, 2', of: '[C]' } };
    expect(ran([copy, turn, scale], '[A.Points(2)]')).toBe('[4, 0, 0]');
  });

  it('keeps tilts, Bezier handles, handle types and Closed', () => {
    const tilt: SolidScriptLine = { command: 'set_tilt', values: { path: '[A]', tilt: '20', into: 'A' } };
    const bend: SolidScriptLine = { command: 'set_path_type', values: { path: '[A]', type: 'Bezier', into: 'A' } };
    const close: SolidScriptLine = { command: 'set_path_closed', values: { path: '[A]', closed: 'Yes', into: 'A' } };
    const prep = [tilt, bend, close, copy];
    for (const member of [
      'Tilts',
      'HandlesLeft',
      'HandlesRight',
      'HandleTypesLeft',
      'HandleTypesRight',
      'Closed',
      'Length',
    ])
      expect(ran(prep, `[C.${member}]`)).toBe(ran(prep, `[A.${member}]`));
  });

  it('copies a list of points into a straight open path, and stops on a single point', () => {
    const points: SolidScriptLine = { command: 'copy_path', values: { from: '[0, 0, 0], [1, 0, 0]', into: 'C' } };
    expect(ran([points], '[C.Points.Count]')).toBe('2');
    const one: SolidScriptLine = { command: 'copy_path', values: { from: '[0, 0, 0]', into: 'C' } };
    expect(ran([one], '[C]')).toContain('Copy Path needs a Path or a list of points in From');
  });

  it('can copy over its own name, leaving a path nothing else shares', () => {
    const own: SolidScriptLine = { command: 'copy_path', values: { from: '[C]', into: 'C' } };
    expect(ran([alias, own, move], '[A.Points(0)]')).toBe('[0, 0, 0]');
  });
});
