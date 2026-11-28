import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = {
  command: 'cube',
  values: { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Crate' },
};

/**
 * One part of an object a copy must not share, with how to give it a value on
 * the original, how to change it on the copy, and how to read it.
 */
interface Part {
  name: string;
  edit: SolidScriptLine[];
  read: string;
  before: string;
  copied: string;
}

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
 * Runs lines and returns what Echo wrote, or the error.
 *
 * @param lines Lines.
 * @returns Messages or the error.
 */
function run(lines: SolidScriptLine[]): string[] | string {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? `line ${result.error.line}: ${result.error.message}` : result.messages;
}

/**
 * Makes a solid with a texture around it and picks it as Box.
 *
 * @returns Lines.
 */
function solidBox(): SolidScriptLine[] {
  return [
    line('texture', { texture: 'brick' }),
    CUBE,
    END,
    line('select_objects'),
    set('Box', '[$Selected.Objects(0)]'),
  ];
}

/**
 * Makes a mesh and picks it as Box.
 *
 * @returns Lines.
 */
function meshBox(): SolidScriptLine[] {
  return [line('mesh_from_solids'), CUBE, END, line('select_objects'), set('Box', '[$Selected.Objects(0)]')];
}

/**
 * Writes the Data, tag, texture, UV and Mode a part check starts from.
 *
 * @returns Lines.
 */
function dressed(): SolidScriptLine[] {
  return [
    line('make_dictionary', { into: 'Info', keys: 'Wood, Sizes', values: '5, [=List(1, 2)]' }),
    set('Box.Data.Info', '[Info]'),
    set('Box.Data.Items', '1, 2'),
    set('Box.Faces.Data.Items', '1, 2'),
    set('Box.Edges.Data.Items', '1, 2'),
    set('Box.Vertices.Data.Items', '1, 2'),
    set('Box.Faces(0).FaceCorners.Data.Items', '1, 2'),
    line('tag_faces', { tag: 'Roof', of: '[Box.Faces]' }),
    line('texture_faces', { texture: 'stone', of: '[Box.Faces(1)]' }),
    set('Box.Faces(0).UVs', '[0, 0], [1, 0], [1, 1], [0, 1]'),
    set('Box.Modes', 'Subtractive'),
  ];
}

/**
 * Parts of a solid a copy must not share, with every kind of Data and every
 * value held on the geometry.
 *
 * @returns Parts.
 */
function solidParts(): Part[] {
  const item = (what: string, owner: string): Part => ({
    name: `${what} Data list`,
    edit: [set('Held', `[Spare${owner}.Data.Items]`), line('add_item', { value: '9', list: 'Held' })],
    read: `[Box${owner}.Data.Items]`,
    before: '[1, 2]',
    copied: '[1, 2, 9]',
  });
  return [
    item('object', ''),
    item('face', '.Faces(0)'),
    item('edge', '.Edges(0)'),
    item('corner', '.Vertices(0)'),
    item('face corner', '.Faces(0).FaceCorners(0)'),
    {
      name: 'object Data Dictionary and the list inside it',
      edit: [
        set('Held', '[Spare.Data.Info]'),
        line('add_entry', { key: 'Wood', value: '9', dictionary: 'Held' }),
        set('Sizes', '[Spare.Data.Info.Data.Sizes]'),
        line('add_item', { value: '9', list: 'Sizes' }),
      ],
      read: '[Box.Data.Info.Data.Wood] [Box.Data.Info.Data.Sizes]',
      before: '5 [1, 2]',
      copied: '9 [1, 2, 9]',
    },
    {
      name: 'face tags',
      edit: [line('tag_faces', { tag: 'Mine', of: '[Spare.Faces(0)]' })],
      read: '[Box.Faces(0).Tags]',
      before: '[Bottom, Roof]',
      copied: '[Bottom, Roof, Mine]',
    },
    {
      name: 'face textures',
      edit: [line('texture_faces', { texture: 'grass', of: '[Spare.Faces]' })],
      read: '[Box.Faces(0).Texture] [Box.Faces(1).Texture]',
      before: 'brick stone',
      copied: 'grass grass',
    },
    {
      name: 'face UVs',
      edit: [set('Spare.Faces(0).UVs', '[0, 0], [2, 0], [2, 2], [0, 2]')],
      read: '[Box.Faces(0).UVs]',
      before: '[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]',
      copied: '[[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]',
    },
    {
      name: 'Mode',
      edit: [set('Spare.Modes', 'Intersecting')],
      read: '[Box.Mode]',
      before: 'Subtractive',
      copied: 'Intersecting',
    },
    {
      name: 'corner positions',
      edit: [line('move_by', { by: '5, 0, 0', of: '[Spare]' })],
      read: '[=Round([Box.Center.X])]',
      before: '0',
      copied: '5',
    },
  ];
}

/**
 * Runs a part check and returns the original and the copy after the edit.
 *
 * @param box Lines that make Box.
 * @param part Part.
 * @returns Messages or the error.
 */
function partRun(box: SolidScriptLine[], part: Part): string[] | string {
  const read = line('echo', { value: part.read });
  const spare = read.values!['value']!.replaceAll('Box.', 'Spare.');
  return run([
    ...box,
    ...dressed(),
    line('echo', { value: part.read }),
    line('copy', { value: '[Box]', into: 'Spare' }),
    ...part.edit,
    line('echo', { value: part.read }),
    line('echo', { value: spare }),
  ]);
}

describe('Copy gives an object that shares nothing with the original', () => {
  it('starts with the same Data, tags, textures, UVs and Mode as the original', () => {
    const same = [
      '[Box.Name]',
      '[Box.Mode]',
      '[Box.Data.Items]',
      '[Box.Data.Info.Data.Wood]',
      '[Box.Faces(0).Data.Items]',
      '[Box.Edges(0).Data.Items]',
      '[Box.Vertices(0).Data.Items]',
      '[Box.Faces(0).FaceCorners(0).Data.Items]',
      '[Box.Faces.Tags]',
      '[Box.Faces(1).Texture]',
      '[Box.Faces(0).UVs]',
    ].join(' | ');
    const result = run([
      ...solidBox(),
      ...dressed(),
      line('copy', { value: '[Box]', into: 'Spare' }),
      line('echo', { value: same }),
      line('echo', { value: same.replaceAll('Box.', 'Spare.') }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(result[1]);
    expect(result[0]).toContain('Crate | Subtractive | [1, 2] | 5 | [1, 2] | [1, 2] | [1, 2] | [1, 2]');
  });

  for (const part of solidParts())
    it(`leaves the original untouched when the copy's ${part.name} is changed`, () => {
      const result = partRun(solidBox(), part);
      expect(result).toHaveLength(3);
      const [first, original, copy] = result as string[];
      expect(first).toBe(part.before);
      expect(original).toBe(part.before);
      expect(copy).toBe(part.copied);
    });

  it('leaves a mesh untouched when its copy changes Data, UVs, corners and face corner UVs', () => {
    const result = run([
      ...meshBox(),
      set('Box.Data.Items', '1, 2'),
      set('Box.Faces.Data.Items', '1, 2'),
      set('Box.Faces(0).FaceCorners.Data.Items', '1, 2'),
      line('copy', { value: '[Box]', into: 'Spare' }),
      set('Corner', '[Spare.Faces(0).FaceCorners(0)]'),
      set('A', '[Spare.Data.Items]'),
      set('B', '[Spare.Faces(0).Data.Items]'),
      set('C', '[Corner.Data.Items]'),
      line('add_item', { value: '9', list: 'A' }),
      line('add_item', { value: '9', list: 'B' }),
      line('add_item', { value: '9', list: 'C' }),
      set('Corner.UV', '0.25, 0.75, 0'),
      line('move_by', { by: '0, 4, 0', of: '[Spare]' }),
      line('echo', {
        value:
          '[Box.Data.Items] [Box.Faces(0).Data.Items] [Box.Faces(0).FaceCorners(0).Data.Items] [=Round([Box.Center.Y])]',
      }),
      line('echo', {
        value:
          '[Spare.Data.Items] [Spare.Faces(0).Data.Items] [Spare.Faces(0).FaceCorners(0).Data.Items] [=Round([Spare.Center.Y])]',
      }),
      line('echo', { value: '[Box.Faces(0).FaceCorners(0).UV] [Spare.Faces(0).FaceCorners(0).UV]' }),
    ]);
    expect(result).toEqual([
      '[1, 2] [1, 2] [1, 2] 0',
      '[1, 2, 9] [1, 2, 9] [1, 2, 9] 4',
      expect.stringMatching(/^\[.*\] \[0\.25, 0\.75, 0\]$/),
    ]);
  });

  it('points Data that holds the object itself at the copy', () => {
    const result = run([
      ...solidBox(),
      set('Box.Data.Self', '[Box]'),
      line('copy', { value: '[Box]', into: 'Spare' }),
      set('Spare.Data.Mark', 'copy'),
      line('echo', { value: '[Box.Data.Self.Data.Mark]|[Spare.Data.Self.Data.Mark]' }),
    ]);
    expect(result).toEqual(['|copy']);
  });

  it('places a copy with Output where the original was built, inside the same block too', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        line('transform', { move: '10, 0, 0' }),
        CUBE,
        line('select_objects'),
        set('Box', '[$Selected.Objects(0)]'),
        line('copy', { value: '[Box]', into: 'Spare' }),
        line('output', { of: '[Spare]' }),
        END,
      ]),
    );
    expect(result.error?.message ?? null).toBeNull();
    const centers = result.shapes
      .flatMap(solidScriptShapeLeavesPositive)
      .filter((leaf) => leaf.kind === 'solid')
      .map((leaf) => leaf.points.reduce((sum, point) => sum + point.x, 0) / leaf.points.length);
    expect(centers.map(Math.round)).toEqual([10, 10]);
  });
});
