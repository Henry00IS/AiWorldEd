import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptGeometryFaces, solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/** Corners of a box of a size, centered on the origin. */
function box(size: number): [number, number, number][] {
  const corners: [number, number, number][] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x * size, y * size, z * size]);
  return corners.map(([x, y, z]) => [x / 2, y / 2, z / 2]);
}

/** A modifier receiving one 2 m cube. */
const USE: SolidScriptUseFacts = { usage: 'Modifier', solids: [box(2)], faces: 6 };

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const CUBE = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' });

/** Runs lines, as a modifier when given what it receives. */
function run(lines: SolidScriptLine[], use?: SolidScriptUseFacts) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines), use ? { use } : {});
}

/** Messages a run printed, one per Print line. */
function printed(lines: SolidScriptLine[], use?: SolidScriptUseFacts): string[] {
  const result = run(lines, use);
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/**
 * Every face of the brushes a run built, as rounded centres and normals,
 * sorted.
 */
function faceKeys(shapes: readonly SolidScriptShape[]): string[] {
  const round = (value: number): number => Math.round(value * 1e4) / 1e4 + 0;
  return solidScriptGeometryFaces(solidScriptGeometryLeaves(shapes))
    .map((face) => [...face.center.toArray(), ...face.normal.toArray()].map(round).join(','))
    .sort();
}

describe('SolidScript values', () => {
  it('reads members with a dot: list counts, vectors, text and faces', () => {
    expect(
      printed([
        line('variable', { name: 'Heights', value: '1, 2, 4' }),
        line('echo', { value: '[Heights.Count] [Heights.First] [Heights.Last] [Heights(1)]' }),
        line('variable', { name: 'Title', value: 'Old Stone Bridge' }),
        line('echo', { value: '[Title.Words.Count] [Title.Length]' }),
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('echo', { value: '[Top.Count] [Top.First.Area] [Top(0).Normal] [Top.First.Parent.Faces.Count]' }),
      ]),
    ).toEqual(['3 1 4 2', '3 16', '1 4 [0, 1, 0] 6']);
  });

  it('keeps system values behind $, so a variable named Input never clashes', () => {
    expect(
      printed(
        [
          line('variable', { name: 'Input', value: '5' }),
          line('input_brushes'),
          line('echo', { value: '[Input] [$Input.Brushes.Count] [$Selected.Brushes.Count] [$Selected.Faces.Count]' }),
        ],
        USE,
      ),
    ).toEqual(['5 1 0 0']);
    expect(run([line('echo', { value: '[$Nope]' })], USE).error?.message).toMatch(/Nope/);
  });

  it('stores user values under .Data per element, on lists and with keys from variables', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'All', into: 'Sides' }),
        line('variable', { name: 'Sides.Data.Height', value: '2' }),
        line('variable', { name: 'Key', value: 'Mood' }),
        line('variable', { name: 'Sides(0).Data.[Key]', value: 'calm' }),
        line('echo', { value: '[Sides(0).Data.Height] [Sides(0).Data.[Key]] [Sides(1).Data.Mood]|' }),
        line('echo', { value: '[Sides.Data.Height]' }),
      ]),
    ).toEqual(['2 calm |', '[2, 2, 2, 2, 2, 2]']);
  });

  it('runs For Each over any list, with an optional Key', () => {
    expect(
      printed([
        line('for_each', { variable: 'N', list: '10, 20', key: 'I' }),
        line('echo', { value: '[I]:[N]' }),
        END,
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('variable', { name: 'Top(0).Data.Height', value: '3' }),
        line('variable', { name: 'Top(0).Data.Color', value: 'red' }),
        line('for_each', { variable: 'V', list: '[Top(0).Data]', key: 'K' }),
        line('echo', { value: '[K]=[V]' }),
        END,
        line('for_each', { variable: 'Edge', list: '[Top(0).Edges]' }),
        line('echo', { value: '[Edge.Length]' }),
        END,
      ]),
    ).toEqual(['0:10', '1:20', 'Height=3', 'Color=red', '2', '2', '2', '2']);
  });

  it('leaves [$Selected] as the last round left it, and Into keeps the earlier pick', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'All', into: 'AllFaces' }),
        line('for_each', { variable: 'B', list: '[$Selected.Brushes]' }),
        line('select_faces', { which: 'Facing Up', of: '[B]' }),
        line('echo', { value: 'in [$Selected.Faces.Count]' }),
        END,
        line('echo', { value: 'after [$Selected.Faces.Count] saved [AllFaces.Count]' }),
      ]),
    ).toEqual(['in 1', 'after 1 saved 6']);
  });

  it('A: slabs off every face, each bevelled, the cube untouched', () => {
    const result = run([
      CUBE,
      line('select_brushes'),
      line('select_faces', { which: 'All' }),
      line('for_each', { variable: 'Face', list: '[$Selected.Faces]' }),
      line('extrude_face', { of: '[Face]', distance: '0.2', lift: '1', into: 'Slab' }),
      line('bevel_edges', { of: '[Slab]', distance: '0.05' }),
      line('output', { of: '[Slab]' }),
      END,
    ]);
    expect(result.error?.message ?? null).toBeNull();
    const leaves = solidScriptGeometryLeaves(result.shapes);
    expect(leaves).toHaveLength(7);
    const counts = leaves.map((leaf) => solidScriptGeometryFaces([leaf]).length).sort((a, b) => a - b);
    expect(counts).toEqual([6, 18, 18, 18, 18, 18, 18]);
  });

  it('B and C: bevelling all edges at once equals bevelling face by face', () => {
    const all = run(
      [
        line('input_brushes'),
        line('select_brushes'),
        line('select_faces', { which: 'All' }),
        line('bevel_edges', { distance: '0.1' }),
      ],
      USE,
    );
    const each = run(
      [
        line('input_brushes'),
        line('select_brushes'),
        line('select_faces', { which: 'All' }),
        line('for_each', { variable: 'Face', list: '[$Selected.Faces]' }),
        line('bevel_edges', { of: '[Face]', distance: '0.1' }),
        END,
      ],
      USE,
    );
    expect(all.error?.message ?? null).toBeNull();
    expect(each.error?.message ?? null).toBeNull();
    expect(faceKeys(all.shapes)).toHaveLength(18);
    expect(faceKeys(each.shapes)).toEqual(faceKeys(all.shapes));
  });

  it('follows a face through an inset: the face is all its pieces, outputs are exact', () => {
    expect(
      printed([
        line('mesh_brushes'),
        CUBE,
        line('end'),
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('variable', { name: 'Top.Data.Kind', value: 'roof' }),
        line('select_brushes'),
        line('inset_face', { distance: '0.5', inner: 'Inner', ring: 'Ring' }),
        line('echo', { value: '[Top(0).Area] [Inner.Count] [Ring.Count] [Inner(0).Area] [Inner(0).Tag]' }),
        line('select_faces', { which: 'Facing Up', of: '[Top]' }),
        line('echo', { value: '[$Selected.Faces.Count] [$Selected.Faces.Data.Kind]' }),
      ]),
    ).toEqual(['4 1 4 1 Inner', '5 [roof, roof, roof, roof, roof]']);
  });

  it('extrudes a face into a slab with Top and Sides outputs', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up' }),
        line('select_brushes'),
        line('extrude_face', { distance: '0.5', into: 'Slabs', top: 'Roof', sides: 'Walls' }),
        line('echo', { value: '[Slabs.Count] [Roof.Count] [Walls.Count] [Roof(0).Center] [$Selected.Faces.Count]' }),
      ]),
    ).toEqual(['1 1 4 [0, 1.5, 0] 1']);
  });

  it('stops a line using a face that was cut away', () => {
    const result = run([
      line('mesh_brushes'),
      CUBE,
      line('end'),
      line('select_brushes'),
      line('select_faces', { which: 'Facing Up', into: 'Top' }),
      line('variable', { name: 'Face', value: '[Top(0)]' }),
      line('select_brushes'),
      line('delete_faces'),
      line('echo', { value: '[Face.Area]' }),
    ]);
    expect(result.error?.message).toMatch(/cut away/);
  });

  it('keeps a face of a mesh when Extrude Face moves it, with its Data', () => {
    expect(
      printed([
        line('mesh_brushes'),
        CUBE,
        END,
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('variable', { name: 'Top.Data.Mark', value: 'roof' }),
        line('extrude_face', { distance: '1', of: '[Top]', top: 'Roof' }),
        line('echo', { value: '[Top.Count] [Top.First.Center] [Top.First.Data.Mark] [Roof.First.Data.Mark]' }),
      ]),
    ).toEqual(['1 [0, 2, 0] roof roof']);
  });
});
