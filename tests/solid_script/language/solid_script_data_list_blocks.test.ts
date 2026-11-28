import { describe, expect, it } from 'vitest';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptListItemTargetParse } from '@/solid_script/language/solid_script_list_item.js';

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
 * Runs lines with a cube at the end and returns what Echo wrote, or the error.
 *
 * @param lines Lines.
 * @returns Messages, or the error.
 */
function echoed(...lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...lines, CUBE]));
  return result.error ? result.error.message : result.messages;
}

/** A cube kept as Box, with its faces, edges and vertices ready. */
const BOX: SolidScriptLine[] = [CUBE, line('select_objects'), set('Box', '[$Selected.Objects(0)]')];

/** A cube with all faces selected. */
const FACES: SolidScriptLine[] = [...BOX, line('select_faces', { which: 'All' })];

describe('solidScriptListItemTargetParse', () => {
  it('reads an item after a member path, including Faces(2).Data.Kind()', () => {
    expect(solidScriptListItemTargetParse('Box.Data.Items(2)')).toEqual({ name: 'Box.Data.Items', index: '2' });
    expect(solidScriptListItemTargetParse('Faces(2).Data.Kind()')).toEqual({ name: 'Faces(2).Data.Kind', index: '' });
    expect(solidScriptListItemTargetParse('Faces(2).Data.Kind(1)')).toEqual({ name: 'Faces(2).Data.Kind', index: '1' });
    expect(solidScriptListItemTargetParse('Points(0)')).toEqual({ name: 'Points', index: '0' });
    expect(solidScriptListItemTargetParse('Box.Data.Items')).toBeNull();
  });
});

describe('List blocks on a Data member', () => {
  it('appends with Add Item instead of replacing the list, and aliases see the change', () => {
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Items', '1, 2'),
        set('Alias', '[Box.Data.Items]'),
        line('add_item', { value: '3', list: 'Box.Data.Items' }),
        line('add_item', { value: '4', list: 'Box.Data.Items' }),
        echo('[Box.Data.Items] [Alias] [Alias.Count]'),
      ),
    ).toEqual(['[1, 2, 3, 4] [1, 2, 3, 4] 4']);
  });

  it('makes a list when Add Item targets a missing Data key, including an empty key first', () => {
    expect(
      echoed(
        ...BOX,
        line('add_item', { value: '5', list: 'Box.Data.Items' }),
        line('add_item', { value: '6', list: 'Box.Data.Items' }),
        echo('[Box.Data.Items]'),
      ),
    ).toEqual(['[5, 6]']);
  });

  it('inserts, removes a value, sorts, reverses, finds and sets an item in place', () => {
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Items', '5, 2, 9'),
        set('Alias', '[Box.Data.Items]'),
        line('insert_item', { value: '7', list: 'Box.Data.Items', at: '1' }),
        echo('[Box.Data.Items]'),
        line('sort_list', { list: 'Box.Data.Items' }),
        echo('[Alias]'),
        line('sort_list', { list: 'Box.Data.Items', descending: 'true' }),
        echo('[Box.Data.Items]'),
        line('reverse_list', { list: 'Box.Data.Items' }),
        echo('[Alias]'),
        line('find_item', { value: '7', list: 'Box.Data.Items', result: 'At' }),
        echo('[At]'),
        set('Box.Data.Items(1)', '8'),
        echo('[Alias]'),
        line('remove_value', { value: '8', list: 'Box.Data.Items' }),
        echo('[Box.Data.Items]'),
      ),
    ).toEqual(['[5, 7, 2, 9]', '[2, 5, 7, 9]', '[9, 7, 5, 2]', '[2, 5, 7, 9]', '2', '[2, 8, 7, 9]', '[2, 7, 9]']);
  });

  it('removes a numbered item or the last item, and appends with Set Items()', () => {
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Items', 'a, b, c, d'),
        set('Alias', '[Box.Data.Items]'),
        line('remove_item', { target: 'Box.Data.Items(1)' }),
        echo('[Alias]'),
        line('remove_item', { target: 'Box.Data.Items()' }),
        echo('[Box.Data.Items]'),
        set('Box.Data.Items()', 'e'),
        echo('[Alias]'),
      ),
    ).toEqual(['[a, c, d]', '[a, c]', '[a, c, e]']);
  });

  it('clears a Data list to a new empty list, so an alias keeps the old items', () => {
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Items', '1, 2'),
        set('Alias', '[Box.Data.Items]'),
        line('clear_variable', { name: 'Box.Data.Items' }),
        echo('[Box.Data.Items.Count] [Alias]'),
      ),
    ).toEqual(['0 [1, 2]']);
  });

  it('clears a Data Dictionary to a new empty one, and a number to 0', () => {
    expect(
      echoed(
        ...BOX,
        line('make_dictionary', { into: 'Prices', keys: 'Wood', values: '5' }),
        set('Box.Data.Prices', '[Prices]'),
        set('Alias', '[Box.Data.Prices]'),
        set('Box.Data.Heat', '4'),
        line('clear_variable', { name: 'Box.Data.Prices' }),
        line('clear_variable', { name: 'Box.Data.Heat' }),
        echo('<[Box.Data.Prices]> [Alias] [Box.Data.Heat]'),
      ),
    ).toEqual(['<> Wood: 5 0']);
  });

  it('changes a nested list stored in Data, and a list of lists item by item', () => {
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Groups', '[1, 2], [3]'),
        set('Inner', '[Box.Data.Groups(0)]'),
        line('add_item', { value: '8', list: 'Box.Data.Groups(0)' }),
        echo('[Box.Data.Groups] [Inner]'),
        line('insert_item', { value: '0', list: 'Box.Data.Groups(1)', at: '0' }),
        line('reverse_list', { list: 'Box.Data.Groups(0)' }),
        echo('[Box.Data.Groups]'),
      ),
    ).toEqual(['[[1, 2, 8], [3]] [1, 2, 8]', '[[8, 2, 1], [0, 3]]']);
  });

  it('adds to each face list, or only the numbered face, and to edges, vertices and face corners', () => {
    const mesh = [
      line('mesh_from_solids'),
      CUBE,
      END,
      line('select_objects'),
      set('Box', '[$Selected.Objects(0)]'),
      set('Corners', '[Box.Faces(0).FaceCorners]'),
    ];
    expect(
      echoed(
        ...FACES,
        line('add_item', { value: 'a', list: 'Box.Faces.Data.Tags' }),
        line('add_item', { value: 'b', list: 'Box.Faces.Data.Tags' }),
        echo('[Box.Faces(0).Data.Tags] [Box.Faces(5).Data.Tags]'),
        line('add_item', { value: 'c', list: 'Box.Faces.Data.Tags(2)' }),
        echo('[Box.Faces(2).Data.Tags] [Box.Faces(0).Data.Tags]'),
      ),
    ).toEqual(['[a, b] [a, b]', '[a, b, c] [a, b]']);
    expect(
      echoed(
        ...BOX,
        line('select_edges', { which: 'All' }),
        line('add_item', { value: '1', list: 'Box.Edges.Data.Marks' }),
        line('add_item', { value: '2', list: 'Box.Edges.Data.Marks(0)' }),
        echo('[Box.Edges(0).Data.Marks] [Box.Edges(1).Data.Marks]'),
      ),
    ).toEqual(['[1, 2] [1]']);
    expect(
      echoed(
        ...BOX,
        line('select_vertices', { which: 'All' }),
        line('add_item', { value: 'up', list: 'Box.Vertices.Data.Labels(0)' }),
        echo('[Box.Vertices(0).Data.Labels] "[Box.Vertices(1).Data.Labels]"'),
      ),
    ).toEqual(['[up] ""']);
    expect(
      echoed(
        ...mesh,
        line('add_item', { value: 'p', list: 'Corners.Data.Pins(1)' }),
        echo('[Corners(1).Data.Pins] "[Corners(0).Data.Pins]"'),
      ),
    ).toEqual(['[p] ""']);
  });

  it('removes an item from one face list with Faces(2).Data.Kind(1), and uses a Data.[Key] name', () => {
    expect(
      echoed(
        ...FACES,
        set('Box.Faces(2).Data.Kind', 'x, y, z'),
        line('remove_item', { target: 'Box.Faces(2).Data.Kind(1)' }),
        echo('[Box.Faces(2).Data.Kind]'),
        set('Name', 'Items'),
        line('add_item', { value: '1', list: 'Box.Data.[Name]' }),
        line('add_item', { value: '2', list: 'Box.Data.[Name]' }),
        echo('[Box.Data.Items]'),
      ),
    ).toEqual(['[x, z]', '[1, 2]']);
  });

  it('adds, removes and merges Dictionary entries under a Data key', () => {
    expect(
      echoed(
        ...BOX,
        line('add_entry', { key: 'Wood', value: '5', dictionary: 'Box.Data.Prices' }),
        line('add_entry', { key: 'Stone', value: '7', dictionary: 'Box.Data.Prices' }),
        set('Alias', '[Box.Data.Prices]'),
        line('add_entry', { key: 'Wood', value: '9', dictionary: 'Box.Data.Prices' }),
        echo('[Box.Data.Prices.Data.Wood] [Alias.Data.Wood] [Box.Data.Prices.Data.Stone]'),
        line('remove_entry', { key: 'Stone', dictionary: 'Box.Data.Prices' }),
        echo('[=Contains([Box.Data.Prices], "Stone")]'),
        line('make_dictionary', { into: 'Extra', keys: 'Glass', values: '12' }),
        line('merge_dictionary', { from: '[Extra]', dictionary: 'Box.Data.Prices' }),
        echo('[Box.Data.Prices.Data.Glass] [Alias.Data.Glass]'),
      ),
    ).toEqual(['9 9 7', 'No', '12 12']);
  });

  it('changes a Dictionary stored in a list under Data, and a persistent Data list', () => {
    expect(
      echoed(
        ...BOX,
        line('make_dictionary', { into: 'One', keys: 'Wood', values: '5' }),
        line('make_dictionary', { into: 'Two', keys: 'Stone', values: '7' }),
        set('Box.Data.Tables', '[One], [Two]'),
        line('add_entry', { key: 'Glass', value: '12', dictionary: 'Box.Data.Tables(0)' }),
        echo('[Box.Data.Tables(0).Data.Glass] [Box.Data.Tables(1).Data.Stone]'),
      ),
    ).toEqual(['12 7']);
    const script = solidScriptDocumentCreate([
      line('input', { name: 'Add', type: 'Button' }),
      line('when_button_pressed', { name: 'Add' }),
      line('if', { condition: 'is_undef([$Persistent.Store])' }),
      line('make_dictionary', { into: '$Persistent.Store' }),
      END,
      line('add_item', { value: '5', list: '$Persistent.Store.Data.History' }),
      END,
      CUBE,
    ]);
    const first = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {});
    expect(first.error).toBeNull();
    expect(first.persistent).toEqual({
      store: { kind: 'dictionary', entries: [{ name: 'History', value: [5] }] },
    });
    const second = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, {}, first.persistent);
    expect(second.error).toBeNull();
    expect(second.persistent).toEqual({
      store: { kind: 'dictionary', entries: [{ name: 'History', value: [5, 5] }] },
    });
  });

  it('stops when the Data value is not a list, the key is missing, or an item is past the end', () => {
    expect(echoed(...BOX, set('Box.Data.Heat', '4'), line('add_item', { value: '1', list: 'Box.Data.Heat' }))).toMatch(
      /\[Box\.Data\.Heat\] is a Number, not a list/,
    );
    expect(echoed(...BOX, line('reverse_list', { list: 'Box.Data.Items' }))).toMatch(
      /there is no list \[Box\.Data\.Items\]; make one with Add Item/,
    );
    expect(echoed(...BOX, line('insert_item', { value: '1', list: 'Box.Data.Items', at: '0' }))).toMatch(
      /there is no list \[Box\.Data\.Items\]/,
    );
    expect(
      echoed(
        ...BOX,
        set('Box.Data.Items', '1, 2'),
        line('insert_item', { value: '9', list: 'Box.Data.Items', at: '5' }),
      ),
    ).toMatch(/Position needs a whole number from 0 to 2/);
    expect(echoed(...BOX, set('Box.Data.Items', '1, 2'), line('remove_item', { target: 'Box.Data.Items(5)' }))).toMatch(
      /Box\.Data\.Items\(5\) is past the end/,
    );
    expect(echoed(...FACES, set('Box.Faces.Data.Kind(9)', '1, 2'))).toMatch(/past the end: there are 6 items/);
  });

  it('stops a read-only script input and a built-in list, and still shares a writable Data list', () => {
    const script = solidScriptDocumentCreate([
      line('input', { name: 'Size', type: 'Vector', default: '1, 2, 3' }),
      line('add_item', { value: '4', list: 'Size' }),
      CUBE,
    ]);
    expect(solidScriptProgramRun(script).error?.message).toContain(
      '"Size" is an input of this script and can only be read',
    );
    expect(echoed(set('S', '[$Box.Size]'), line('add_item', { value: '1', list: 'S' }))).toContain(
      'is the built-in value $Box.Size',
    );
    expect(
      echoed(
        ...BOX,
        line('add_item', { value: '1', list: 'Box.Data.Items' }),
        set('Alias', '[Box.Data.Items]'),
        line('add_item', { value: '2', list: 'Alias' }),
        echo('[Box.Data.Items]'),
      ),
    ).toEqual(['[1, 2]']);
  });
});
