import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Centers of the faces a script picked, in a stable order.
 *
 * @param lines Lines that pick faces.
 * @returns Centers as text.
 */
function centers(...lines: SolidScriptLine[]): string[] {
  const result = run(
    CUBE,
    SELECT_BRUSHES,
    ...lines,
    { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
    { command: 'echo', values: { value: '[Face.Center]' } },
    END,
  );
  expect(result.error).toBeNull();
  return [...result.messages].sort();
}

describe('SolidScript condition helpers', () => {
  it('Facing, InBox, Near, EveryNth and HasTag work in Where and in If', () => {
    expect(
      centers({
        command: 'select_faces',
        values: { which: 'All', where: '[=Facing([$Face.Normal], Vector(0, 1, 0))]' },
      }),
    ).toEqual(['[0, 1, 0]']);
    expect(
      centers({
        command: 'select_faces',
        values: { which: 'All', where: '[=InBox([$Face.Center], Vector(0, 1, 0), 0.2)]' },
      }),
    ).toEqual(['[0, 1, 0]']);
    expect(
      centers({
        command: 'select_faces',
        values: { which: 'All', where: '[=Near([$Face.Center], Vector(0, 1, 0), 0.01)]' },
      }),
    ).toEqual(['[0, 1, 0]']);
    const nth = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'All', where: '[=EveryNth([$Index], 2)]' } },
      { command: 'echo', values: { value: '[$Selected.Faces.Count]' } },
    );
    expect(nth.error).toBeNull();
    expect(nth.messages).toEqual(['3']);
    expect(
      centers({ command: 'select_faces', values: { which: 'All', where: '[=HasTag([$Face.Tags], "Top")]' } }),
    ).toEqual(['[0, 1, 0]']);
    const branch = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'Facing Up', into: 'Top' } },
      { command: 'if', values: { condition: 'Facing([Top.First.Normal], Vector(0, 1, 0))' } },
      { command: 'echo', values: { value: 'up' } },
      END,
    );
    expect(branch.error).toBeNull();
    expect(branch.messages).toEqual(['up']);
  });

  it('keeps every official Select Faces preset equal to a written-out Where', () => {
    const presets: ReadonlyArray<[string, string]> = [
      ['All', ''],
      ['Facing Up', '[=Facing([$Face.Normal], Vector(0, 1, 0))]'],
      ['Facing Down', '[=Facing([$Face.Normal], Vector(0, -1, 0))]'],
      ['Facing Left', '[=Facing([$Face.Normal], Vector(-1, 0, 0))]'],
      ['Facing Right', '[=Facing([$Face.Normal], Vector(1, 0, 0))]'],
      ['Facing Front', '[=Facing([$Face.Normal], Vector(0, 0, 1))]'],
      ['Facing Back', '[=Facing([$Face.Normal], Vector(0, 0, -1))]'],
      ['Top', '[=HasTag([$Face.Tags], "Top")]'],
      ['Bottom', '[=HasTag([$Face.Tags], "Bottom")]'],
    ];
    for (const [which, where] of presets) {
      expect(centers({ command: 'select_faces', values: { which } }), which).toEqual(
        centers({ command: 'select_faces', values: { which: 'All', where } }),
      );
    }
  });

  it('puts one Where on every Select, and still honours Which Between and How', () => {
    const faces = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'All', where: '[=[$Face.Center.Y] > 0]', into: 'Top' } },
      { command: 'echo', values: { value: '[$Selected.Faces.Count] [Top.Count]' } },
    );
    expect(faces.error).toBeNull();
    expect(faces.messages).toEqual(['1 1']);
    const edges = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_edges', values: { which: 'All', where: '[=[$Edge.Center.Y] > 0]' } },
      { command: 'echo', values: { value: '[$Selected.Edges.Count]' } },
    );
    expect(edges.error).toBeNull();
    expect(edges.messages).toEqual(['4']);
    const vertices = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_vertices', values: { which: 'All', where: '[=[$Vertex.Position.Y] > 0]', into: 'Up' } },
      { command: 'echo', values: { value: '[Up.Count]' } },
    );
    expect(vertices.error).toBeNull();
    expect(vertices.messages).toEqual(['4']);
    const brushes = run(
      CUBE,
      { command: 'cube', values: { size: '1, 1, 1', name: 'Small' } },
      { command: 'select_brushes', values: { which: 'All', where: '[=[$Brush.Size.X] < 1.5]', into: 'Small' } },
      { command: 'echo', values: { value: '[Small.Count] [Small.First.Size.X]' } },
    );
    expect(brushes.error).toBeNull();
    expect(brushes.messages).toEqual(['1 1']);
    const fresh = run(
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'All', into: 'First' } },
      CUBE,
      SELECT_BRUSHES,
      { command: 'select_faces', values: { which: 'Between', into: 'Later' } },
      { command: 'echo', values: { value: '[First.Count] [Later.Count]' } },
    );
    expect(fresh.error).toBeNull();
    expect(fresh.messages).toEqual(['6 6']);
    expect(
      centers(
        { command: 'select_faces', values: { which: 'Facing Up' } },
        { command: 'select_faces', values: { which: 'Facing Down', how: 'Add' } },
      ),
    ).toEqual(['[0, -1, 0]', '[0, 1, 0]']);
  });
});
