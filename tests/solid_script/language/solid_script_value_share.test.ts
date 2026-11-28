import { describe, expect, it } from 'vitest';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptNameDotProblem } from '@/solid_script/language/solid_script_name_rules.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };

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
 * @param copy Whether Copy is on.
 * @returns Line.
 */
function set(name: string, value: string, copy = false): SolidScriptLine {
  return line('variable', copy ? { name, value, copy: 'Yes' } : { name, value });
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
 * Runs lines with a cube at the end and returns what Echo wrote.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function echoed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]));
  return result.error ? result.error.message : result.messages;
}

/**
 * Runs lines and counts the solids built.
 *
 * @param lines Lines.
 * @returns Number of solids, or the error.
 */
function solids(...lines: SolidScriptLine[]): number | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) return result.error.message;
  return result.shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid').length;
}

describe('Solid Script values: Set gives a second name', () => {
  it('keeps numbers and text their own value', () => {
    expect(echoed(set('A', '3'), set('B', '[A]'), set('B', '4'), echo('[A] [B]'))).toEqual(['3 4']);
    expect(echoed(set('A', 'hi'), set('B', '[A]'), set('B', 'ho'), echo('[A] [B]'))).toEqual(['hi ho']);
  });

  it('shares a list: Add Item, Insert Item, Set item and Remove Item through B change A', () => {
    const a = set('A', '1, 2, 3, 4');
    const b = set('B', '[A]');
    expect(echoed(a, b, line('add_item', { value: '5', list: 'B' }), echo('[A]'))).toEqual(['[1, 2, 3, 4, 5]']);
    expect(echoed(a, b, line('insert_item', { value: '0', list: 'B', at: '0' }), echo('[A]'))).toEqual([
      '[0, 1, 2, 3, 4]',
    ]);
    expect(echoed(a, b, set('B(1)', '9'), echo('[A]'))).toEqual(['[1, 9, 3, 4]']);
    expect(echoed(a, b, line('remove_item', { target: 'B(0)' }), echo('[A]'))).toEqual(['[2, 3, 4]']);
    expect(echoed(a, b, line('remove_value', { value: '3', list: 'B' }), echo('[A]'))).toEqual(['[1, 2, 4]']);
    expect(echoed(a, b, line('reverse_list', { list: 'B' }), echo('[A]'))).toEqual(['[4, 3, 2, 1]']);
    expect(echoed(a, b, line('sort_list', { list: 'B', descending: 'Yes' }), echo('[A]'))).toEqual(['[4, 3, 2, 1]']);
  });

  it('shares a vector: Set [B.X] changes A, with no exception for number lists', () => {
    expect(echoed(set('A', '1, 2, 3'), set('B', '[A]'), set('B.X', '9'), echo('[A]'))).toEqual(['[9, 2, 3]']);
    expect(echoed(set('A', '1, 2'), set('B', '[A]'), set('B.Z', '5'), echo('[A]'))).toEqual(['[1, 2, 5]']);
  });

  it('shares a Dictionary and a Dictionary kept inside another', () => {
    const make = line('make_dictionary', { into: 'D', keys: 'Wood', values: '5' });
    expect(
      echoed(make, set('E', '[D]'), line('add_entry', { key: 'Stone', value: '7', dictionary: 'E' }), echo('[D]')),
    ).toEqual(['Wood: 5, Stone: 7']);
    expect(
      echoed(
        make,
        line('make_dictionary', { into: 'Outer' }),
        line('add_entry', { key: 'Inner', value: '[D]', dictionary: 'Outer' }),
        line('add_entry', { key: 'Wood', value: '6', dictionary: 'D' }),
        echo('[Outer.Data.Inner.Data.Wood]'),
      ),
    ).toEqual(['6']);
  });

  it('shares nested lists, and Copy goes all the way down', () => {
    const inner = set('Row', '1, 2');
    const grid = line('add_item', { value: '[Row]', list: 'Grid' });
    const change = set('Row(0)', '9');
    expect(echoed(inner, grid, change, echo('[Grid]'))).toEqual(['[[9, 2]]']);
    const copied = line('copy', { value: '[Grid]', into: 'Saved' });
    expect(echoed(inner, grid, copied, change, echo('[Saved] [Grid]'))).toEqual(['[[1, 2]] [[9, 2]]']);
  });

  it('gives each round a fresh list from a value typed in the field, from brackets, from a formula and from Clear Variable', () => {
    const rounds: [SolidScriptLine, string][] = [
      [set('Row', '0, 0'), '[[0, 0], [1, 0], [2, 0]]'],
      [set('Row', '[=List(0, 0)]'), '[[0, 0], [1, 0], [2, 0]]'],
      [set('Row', '[0, 0]'), '[[0, 0], [1, 0], [2, 0]]'],
      [set('Row', '[]'), '[[0], [1], [2]]'],
      [line('clear_variable', { name: 'Row' }), '[[0], [1], [2]]'],
    ];
    for (const [fresh, rows] of rounds)
      expect(
        echoed(
          line('repeat', { variable: 'I', from: '0', to: '3' }),
          fresh,
          set('Row(0)', '[I]'),
          line('add_item', { value: '[Row]', list: 'Rows' }),
          END,
          echo('[Rows]'),
        ),
      ).toEqual([rows]);
  });

  it('lets a Function change in place the list it is given', () => {
    expect(
      echoed(
        line('function', { name: 'Grow', parameters: 'Items' }),
        line('add_item', { value: '7', list: '$Local.Items' }),
        END,
        set('A', '1, 2'),
        line('call', { name: 'Grow', values: '[A]' }),
        echo('[A]'),
      ),
    ).toEqual(['[1, 2, 7]']);
  });

  it('moves the real object through For Each and through a second name', () => {
    const select = line('select_objects');
    expect(
      echoed(
        CUBE,
        select,
        set('B', '[$Selected.Objects]'),
        line('move_by', { by: '0, 2, 0', of: '[B]' }),
        echo('[=Round([$Selected.Objects(0).Center.Y])]'),
      ),
    ).toEqual(['2']);
    const each = line('for_each', { variable: 'Obj', list: '[$Selected.Objects]' });
    const move = line('move_by', { by: '0, 5, 0', of: '[Obj]' });
    expect(echoed(CUBE, select, each, move, END, echo('[=Round([$Selected.Objects(0).Center.Y])]'))).toEqual(['5']);
  });

  it('stops a list from going inside itself', () => {
    expect(echoed(set('A', '1, 2'), line('add_item', { value: '[A]', list: 'A' }))).toContain(
      'this would put [A] inside itself',
    );
    expect(echoed(set('A', '1, 2'), set('B', '[A]'), set('A(0)', '[B]'))).toContain('inside itself');
  });

  it('keeps the list of an input or a built-in value read-only through another name', () => {
    const input = line('input', { name: 'Size', type: 'Vector', default: '1, 2, 3' });
    expect(echoed(input, set('S', '[Size]'), set('S.X', '9'))).toContain(
      '[S] is the script input Size, which can only be read; Copy it first',
    );
    expect(echoed(input, set('S', '[Size]', true), set('S.X', '9'), echo('[Size] [S]'))).toEqual([
      '[1, 2, 3] [9, 2, 3]',
    ]);
  });
});

describe('Solid Script values: Copy gives a second thing', () => {
  it('reads Copy and Set with Copy on the same way', () => {
    const a = set('A', '1, 2');
    for (const copy of [line('copy', { value: '[A]', into: 'B' }), set('B', '[A]', true)])
      expect(echoed(a, copy, line('add_item', { value: '3', list: 'B' }), echo('[A] [B]'))).toEqual([
        '[1, 2] [1, 2, 3]',
      ]);
  });

  it('copies a Dictionary with what it holds', () => {
    expect(
      echoed(
        line('make_dictionary', { into: 'D', keys: 'Wood', values: '5' }),
        line('copy', { value: '[D]', into: 'E' }),
        line('add_entry', { key: 'Wood', value: '6', dictionary: 'E' }),
        echo('[D] [E]'),
      ),
    ).toEqual(['Wood: 5 Wood: 6']);
  });

  it('copies a Path so moving the copy leaves the original', () => {
    const path = line('path_from_points', { points: '[0, 0, 0], [4, 0, 0]', into: 'Rail' });
    expect(
      echoed(
        path,
        line('copy', { value: '[Rail]', into: 'Spare' }),
        line('move_by', { by: '0, 1, 0', of: '[Spare]' }),
        echo('[Rail.Points(0)] [Spare.Points(0)]'),
      ),
    ).toEqual(['[0, 0, 0] [0, 1, 0]']);
  });

  it('makes a real second solid that moves on its own and is only built by Output', () => {
    const box = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Box' });
    const keep = set('Box', '[$Selected.Objects(0)]');
    const copy = line('copy', { value: '[Box]', into: 'Spare' });
    const move = line('move_by', { by: '5, 0, 0', of: '[Spare]' });
    const output = line('output', { of: '[Spare]' });
    expect(solids(box, line('select_objects'), keep, copy, move)).toBe(1);
    expect(solids(box, line('select_objects'), keep, copy, move, output)).toBe(2);
    expect(
      echoed(
        box,
        line('select_objects'),
        keep,
        set('Box.Data.Tag', 'a'),
        copy,
        move,
        set('Spare.Data.Tag', 'b'),
        echo('[=Round([Box.Center.X])] [=Round([Spare.Center.X])] [Box.Data.Tag] [Spare.Data.Tag]'),
      ),
    ).toEqual(['0 5 a b']);
  });

  it('makes a real second mesh', () => {
    const mesh = [line('mesh_from_solids'), CUBE, END, line('select_objects'), set('M', '[$Selected.Objects(0)]')];
    expect(
      echoed(
        ...mesh,
        line('copy', { value: '[M]', into: 'N' }),
        line('move_by', { by: '0, 3, 0', of: '[N]' }),
        echo('[=Round([M.Center.Y])] [=Round([N.Center.Y])] [N.Faces.Count]'),
      ),
    ).toEqual(['0 3 6']);
  });

  it('stops clearly on .Data, faces, edges and corners, before making anything', () => {
    const pick = [CUBE, line('select_objects'), set('Box', '[$Selected.Objects(0)]')];
    expect(echoed(...pick, line('copy', { value: '[Box.Data]', into: 'D' }))).toContain(
      '[Box.Data] holds the Data of an object or part, which belongs to it and cannot be copied on its own',
    );
    expect(echoed(...pick, set('D', '[Box.Data]', true))).toContain('cannot be copied on its own');
    for (const part of ['[Box.Faces(0)]', '[Box.Edges]', '[Box.Vertices(0)]'])
      expect(echoed(...pick, line('copy', { value: part, into: 'P' }))).toContain(
        'a part of its object, which cannot be copied on its own; copy the object instead',
      );
    expect(echoed(...pick, set('L', '[Box], [Box.Faces(0)]'), line('copy', { value: '[L]', into: 'P' }))).toContain(
      'cannot be copied on its own',
    );
  });

  it('keeps numbers, text and Yes/No as they are', () => {
    expect(
      echoed(line('copy', { value: '3', into: 'N' }), line('copy', { value: 'Yes', into: 'Y' }), echo('[N] [Y]')),
    ).toEqual(['3 Yes']);
  });
});

describe('Solid Script values: Set on system values', () => {
  const select = [CUBE, line('select_objects'), line('select_vertices', { which: 'All' })];

  const highest = echo('[=Round(Max([$Selected.Objects(0).Vertices.Positions.Ys]))]');

  it('moves one selected corner with $Selected.Vertices.Positions(0)', () => {
    expect(
      echoed(
        ...select,
        set('Before', '[$Selected.Vertices.Positions(0)]'),
        set('$Selected.Vertices.Positions(0)', '[=[Before] + [0, 3, 0]]'),
        echo('[=Round(Max([$Selected.Objects(0).Vertices.Positions.Ys])) == Round([Before.Y]) + 3]'),
      ),
    ).toEqual(['Yes']);
  });

  it('sets one axis of one corner, and every corner per item with $Vertex', () => {
    expect(echoed(...select, set('$Selected.Vertices.Positions(1).Y', '7'), highest)).toEqual(['7']);
    expect(
      echoed(
        ...select,
        set('$Selected.Vertices.Positions', '[=[$Vertex.Position] + [0, 1, 0]]'),
        echo('[=Round([$Selected.Objects(0).Center.Y])]'),
      ),
    ).toEqual(['1']);
  });

  it('stops a corner number past the end', () => {
    expect(echoed(...select, set('$Selected.Vertices.Positions(99)', '0, 0, 0'))).toContain('past the end');
  });

  it('writes .Data, Mode and an item of a $Selected list through system values', () => {
    expect(
      echoed(...select, set('$Selected.Objects.Data.Tag', 'wall'), echo('[$Selected.Objects(0).Data.Tag]')),
    ).toEqual(['wall']);
    expect(
      echoed(...select, set('$Selected.Objects.Modes', 'Subtractive'), echo('[$Selected.Objects(0).Mode]')),
    ).toEqual(['Subtractive']);
    expect(
      echoed(
        ...select,
        set('$Selected.Vertices(0)', '[$Selected.Vertices(1)]'),
        echo('[=[$Selected.Vertices(0)] == [$Selected.Vertices(1)]]'),
      ),
    ).toEqual(['Yes']);
  });

  it('no longer refuses a system value before the script runs', () => {
    for (const name of ['$Selected.Vertices.Positions(0)', '$Selected.Faces.Data.Kind', '$Box.Width'])
      expect(solidScriptNameDotProblem(name, 'set'), name).toBe('');
  });

  it('stops a truly read-only system value only when the line runs', () => {
    const document = solidScriptDocumentCreate([set('$Box.Width', '3'), CUBE]);
    const result = solidScriptProgramRun(document);
    expect(result.error?.message).toContain('[$Box.Width] is a built-in value and can only be read');
    expect(result.error?.line).toBe(1);
    expect(echoed(line('if', { condition: 'false' }), set('$Box.Width', '3'), END, echo('ok'))).toEqual(['ok']);
    expect(echoed(set('S', '[$Box.Size]'), set('S.X', '1'))).toContain('is the built-in value $Box.Size');
  });
});

describe('Solid Script values: persistent lists changed through another name', () => {
  it('stores a persistent list grown through a second name', () => {
    const script = solidScriptDocumentCreate([
      line('input', { name: 'Add', type: 'Button' }),
      line('when_button_pressed', { name: 'Add' }),
      line('if', { condition: 'is_undef([$persistent.rows])' }),
      line('clear_variable', { name: '$persistent.rows' }),
      END,
      set('Rows', '[$persistent.rows]'),
      line('add_item', { value: '5', list: 'Rows' }),
      END,
      CUBE,
    ]);
    const first = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {});
    expect(first.error).toBeNull();
    expect(first.persistent).toEqual({ rows: [5] });
    const second = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {}, first.persistent);
    expect(second.persistent).toEqual({ rows: [5, 5] });
  });
});
