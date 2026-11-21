import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const SOURCE: SolidScriptLine[] = [
  line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' }),
  line('select_objects'),
  line('select_faces', { which: 'All' }),
];
const CHILD = line('cube', { size: '0.2, 0.8, 0.2', anchor: 'Center, Bottom, Center' });

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
 * Messages a successful run printed.
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
 * Rounded corners of every solid a run built, in a stable order.
 *
 * @param shapes Shapes.
 * @returns Points, rounded.
 */
function corners(shapes: readonly SolidScriptShape[]): number[][] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []))
    .map((point) => point.toArray().map((value) => Math.round(value * 1000) / 1000 + 0));
  return [...points].sort((a, b) => a.join(' ').localeCompare(b.join(' ')));
}

describe('SolidScript Points From Faces, Edges and Vertices', () => {
  it('writes a point at each face, edge and vertex of a cube', () => {
    expect(
      printed(
        ...SOURCE,
        line('points_from_faces', { into: 'Faces', normals: 'FaceDirs' }),
        line('points_from_edges', { into: 'Edges', normals: 'EdgeDirs' }),
        line('points_from_vertices', { into: 'Corners', normals: 'CornerDirs' }),
        line('echo', {
          value: '[=[Faces.Count]] [=[Edges.Count]] [=[Corners.Count]] [=[FaceDirs.Count]]',
        }),
      ),
    ).toEqual(['6 12 8 6']);
  });

  it('matches Place On Face with Points From Faces then Place At Points Align To Normal', () => {
    const shortcut = run(...SOURCE, line('place_on_face', { lift: '0.1' }), CHILD, END);
    const longForm = run(
      ...SOURCE,
      line('points_from_faces', { into: 'Spots', normals: 'Dirs' }),
      line('place_at_points', {
        at: '[Spots]',
        directions: '[Dirs]',
        lift: '0.1',
        align: 'Yes',
      }),
      CHILD,
      END,
    );
    expect(shortcut.error?.message ?? null).toBeNull();
    expect(longForm.error?.message ?? null).toBeNull();
    expect(corners(longForm.shapes)).toEqual(corners(shortcut.shapes));
  });

  it('turns and scales each Place At Points copy from $Index', () => {
    expect(
      printed(
        line('place_at_points', {
          at: '[0, 0, 0], [4, 0, 0]',
          scale: '[=1 + [$Index]], 1, 1',
          into: 'Copies',
        }),
        line('cube', { size: '1, 1, 1', anchor: 'Center, Center, Center' }),
        END,
        line('echo', { value: '[=[Copies.Count]] [Copies.First.Size.x] [Copies.Last.Size.x]' }),
      ),
    ).toEqual(['2 1 2']);
    expect(
      printed(
        line('place_at_points', { at: '0, 0, 0', rotation: '0, 0, 90', into: 'Copy' }),
        line('cube', { size: '0.2, 0.8, 0.2', anchor: 'Center, Center, Center' }),
        END,
        line('echo', { value: '[Copy.First.Size.x] [Copy.First.Size.y]' }),
      ),
    ).toEqual(['0.8 0.2']);
  });

  it('skips faces where two brushes in Of meet back to back, in Points From Faces and Place On Face', () => {
    const pair: SolidScriptLine[] = [
      line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Pair' }),
      line('transform', { move: '2, 0, 0' }),
      line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Pair' }),
      END,
    ];
    expect(
      printed(
        ...pair,
        line('points_from_faces', { of: 'Pair', into: 'Spots' }),
        line('echo', { value: '[=[Spots.Count]]' }),
        line('place_on_face', { of: 'Pair', into: 'Posts' }),
        CHILD,
        END,
        line('echo', { value: '[=[Posts.Count]]' }),
      ),
    ).toEqual(['10', '10']);
  });
});
