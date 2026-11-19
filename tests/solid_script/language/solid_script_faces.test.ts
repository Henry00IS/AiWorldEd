import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };
/** A round per picked face, with the face in [Face]. */
const EACH_FACE: SolidScriptLine = { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } };
/** Builds the lines inside standing on the face of the round. */
const PLACE: SolidScriptLine = { command: 'place_on_face', values: { of: '[Face]' } };

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
 * Picks faces.
 *
 * @param which Which.
 * @param more Other fields.
 * @returns Line.
 */
function select(which: string, more: Record<string, string> = {}): SolidScriptLine {
  return { command: 'select_faces', values: { which, ...more } };
}

/**
 * Brushes of a run.
 *
 * @param shapes Shapes.
 * @returns Point lists.
 */
function solids(shapes: readonly SolidScriptShape[]): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  const walk = (list: readonly SolidScriptShape[]): void => {
    for (const shape of list) {
      if (shape.kind === 'solid') out.push(shape.points);
      else if ('children' in shape) walk(shape.children as SolidScriptShape[]);
    }
  };
  walk(shapes);
  return out;
}

/**
 * Lowest and highest Y (height) of points.
 *
 * @param points Points.
 * @returns Rounded range.
 */
function heightRange(points: readonly THREE.Vector3[]): [number, number] {
  const heights = points.map((point) => Math.round(point.y * 1000) / 1000);
  return [Math.min(...heights), Math.max(...heights)];
}

describe('SolidScript faces', () => {
  it('places a shape on every picked face', () => {
    const result = run(
      CUBE,
      SELECT_BRUSHES,
      select('Facing Up'),
      EACH_FACE,
      PLACE,
      { command: 'cube', values: { size: '0.5, 0.1, 0.5', anchor: 'Left, Bottom, Back' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(2);
    expect(heightRange(all[1]!)).toEqual([1, 1.1]);
  });

  it('sits a shape flush on a face and centered on it with Anchor Center, Bottom, Center', () => {
    const placed = (side: string, anchorText: string) => {
      const result = run(
        CUBE,
        SELECT_BRUSHES,
        select(side),
        EACH_FACE,
        PLACE,
        { command: 'cube', values: { size: '0.5, 0.2, 0.5', anchor: anchorText } },
        END,
        END,
      );
      expect(result.error).toBeNull();
      const box = new THREE.Box3().setFromPoints(solids(result.shapes)[1]!);
      const round = (vector: THREE.Vector3) => vector.toArray().map((value) => Math.round(value * 1e4) / 1e4 + 0);
      return { min: round(box.min), max: round(box.max) };
    };
    // On the top: standing on it, its middle over the face middle.
    expect(placed('Facing Up', 'Center, Bottom, Center')).toEqual({ min: [-0.25, 1, -0.25], max: [0.25, 1.2, 0.25] });
    // On the front: flush against it, out along Z, still centered.
    expect(placed('Facing Front', 'Center, Bottom, Center')).toEqual({
      min: [-0.25, -0.25, 1],
      max: [0.25, 0.25, 1.2],
    });
    // Centerd halfway into the face.
    expect(placed('Facing Up', 'Center, Center, Center')).toEqual({ min: [-0.25, 0.9, -0.25], max: [0.25, 1.1, 0.25] });
  });

  it('nests Select Faces: a round picks faces of what it built, and the outer pick comes back after', () => {
    const result = run(
      CUBE,
      SELECT_BRUSHES,
      select('Facing Up'),
      EACH_FACE,
      PLACE,
      { command: 'cube', values: { size: '0.5, 0.5, 0.5', anchor: 'Left, Bottom, Back' } },
      { command: 'select_brushes', values: { which: 'New' } },
      select('All'),
      EACH_FACE,
      { command: 'echo', values: { value: 'inner [Face.Center]' } },
      END,
      END,
      END,
      EACH_FACE,
      { command: 'echo', values: { value: 'outer [Face.Center]' } },
      END,
    );
    expect(result.error).toBeNull();
    const inner = result.messages.filter((message) => message.startsWith('inner'));
    expect(inner).toHaveLength(6);
    expect(inner.some((message) => message.includes(', 1.5, '))).toBe(true);
    expect(inner).not.toContain('inner [0, -1, 0]');
    expect(result.messages.filter((message) => message.startsWith('outer'))).toEqual(['outer [0, 1, 0]']);
  });

  it('builds shapes standing on the face of each round, also in a nested round', () => {
    const result = run(
      CUBE,
      SELECT_BRUSHES,
      select('All'),
      EACH_FACE,
      PLACE,
      { command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Left, Bottom, Back' } },
      { command: 'select_brushes', values: { which: 'New' } },
      select('All'),
      { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
      { command: 'place_on_face', values: { of: '[Face]' } },
      { command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Center, Center, Center' } },
      END,
      END,
      END,
      END,
    );
    expect(result.error).toBeNull();
    const centres = solids(result.shapes).map((points) =>
      points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(points.length)
        .toArray()
        .map((axis) => axis.toFixed(2))
        .join(' '),
    );
    expect(centres).toHaveLength(1 + 6 + 36);
    expect(new Set(centres).size).toBe(1 + 6 + 36);
  });

  it('names shapes and picks faces, corners and edges Of a name, in any case', () => {
    const knob = (x: number): SolidScriptLine => ({
      command: 'transform',
      values: { move: `${x}, 0, 0` },
    });
    const lines: SolidScriptLine[] = [
      { command: 'cube', values: { size: '4, 4, 1', label: 'Base' } },
      knob(5),
      { command: 'cube', values: { size: '1, 1, 1', label: 'Knob' } },
      END,
      knob(-5),
      { command: 'cube', values: { size: '1, 1, 1', label: 'knob' } },
      END,
    ];
    const count = (...more: SolidScriptLine[]): number => {
      const result = run(...lines, SELECT_BRUSHES, ...more, { command: 'echo', values: { value: 'round' } }, END);
      expect(result.error).toBeNull();
      return result.messages.filter((message) => message === 'round').length;
    };
    expect(count(select('All', { of: 'KNOB' }), EACH_FACE)).toBe(12);
    expect(count(select('All', { of: 'Base' }), EACH_FACE)).toBe(6);
    expect(count(select('All'), EACH_FACE)).toBe(18);
    expect(
      count(select('All', { of: 'Knob' }), {
        command: 'for_each',
        values: { variable: 'C', list: '[$Selected.Faces.Vertices]' },
      }),
    ).toBe(16);
    expect(
      count(select('All', { of: 'base' }), {
        command: 'for_each',
        values: { variable: 'E', list: '[$Selected.Faces.Edges]' },
      }),
    ).toBe(12);
    const missing = run(...lines, select('All', { of: 'Handle' }));
    expect(missing.error?.message).toContain('No brush or mesh above is named "Handle"');
    expect(solidScriptDocumentListing(solidScriptDocumentCreate([lines[0]!, select('All', { of: 'Knob' })]))).toEqual([
      "Cube '4, 4, 1' Named Base",
      "Select Faces All Of 'Knob'",
    ]);
  });

  it('puts a trim on every stair step by its tag', () => {
    const result = run(
      { command: 'stairs', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
      SELECT_BRUSHES,
      select('All', { where: '[=HasTag([$Face.Tags], "Step Tread")]' }),
      { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]', key: 'I' } },
      { command: 'echo', values: { value: '[I] [Face.Tag]' } },
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages.length).toBeGreaterThan(1);
    expect(result.messages[0]).toBe('0 Step Tread');
  });

  it('shows the face values inside the loop', () => {
    const result = run(
      CUBE,
      SELECT_BRUSHES,
      select('Facing Up'),
      EACH_FACE,
      { command: 'echo', values: { value: '[Face.Area] [Face.Center] [Face.Normal]' } },
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['4 [0, 1, 0] [0, 1, 0]']);
  });

  it('adds, removes and picks faces in plain words', () => {
    const count = (...picks: SolidScriptLine[]) => {
      const result = run(CUBE, SELECT_BRUSHES, ...picks, EACH_FACE, { command: 'echo', values: { value: 'x' } }, END);
      expect(result.error).toBeNull();
      return result.messages.length;
    };
    expect(count(select('All'))).toBe(6);
    expect(count(select('Facing Up'), select('Facing Down', { how: 'Add' }))).toBe(2);
    expect(count(select('All'), select('All', { where: '[=HasTag([$Face.Tags], "Side")]', how: 'Remove' }))).toBe(2);
    expect(count(select('All', { where: '[=[$Index] < 3]' }))).toBe(3);
    expect(count(select('All', { where: '[=[$Index] == 0 || [$Index] == 2]' }))).toBe(2);
    expect(count(select('All', { where: '[=[$Face.Center.Z] > 0.5]' }))).toBe(1);
    expect(count(select('All', { where: '[=Facing([$Face.Normal], Vector(1, 0, 0))]' }))).toBe(1);
  });

  it('extrudes a brush face as a new brush', () => {
    const result = run(CUBE, SELECT_BRUSHES, select('Facing Up'), {
      command: 'extrude_face',
      values: { distance: '0.5' },
    });
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(2);
    expect(heightRange(all[1]!)).toEqual([1, 1.5]);
  });

  it('insets and deletes faces of a mesh made with Mesh From Brushes', () => {
    const mesh = (extra: SolidScriptLine) =>
      run({ command: 'mesh_brushes' }, CUBE, { command: 'end' }, SELECT_BRUSHES, select('Facing Up'), extra);
    const inset = mesh({ command: 'inset_face', values: { distance: '0.2' } });
    expect(inset.error).toBeNull();
    expect(solidScriptShapeMeshes(inset.shapes)[0]!.faces).toHaveLength(10);
    const deleted = mesh({ command: 'delete_faces' });
    expect(deleted.error).toBeNull();
    expect(solidScriptShapeMeshes(deleted.shapes)[0]!.faces).toHaveLength(5);
  });

  it('bevels the edges of picked brush faces', () => {
    const result = run(CUBE, SELECT_BRUSHES, select('Facing Up'), {
      command: 'bevel_edges',
      values: { distance: '0.2' },
    });
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(1);
    expect(all[0]!.length).toBeGreaterThan(8);
    expect(heightRange(all[0]!)).toEqual([-1, 1]);
  });

  it('loops over the corners and edges of brushes and faces as members', () => {
    const messages = (...lines: SolidScriptLine[]) => {
      const result = run(CUBE, SELECT_BRUSHES, ...lines);
      expect(result.error?.message ?? null).toBeNull();
      return result.messages;
    };
    const each = (list: string): SolidScriptLine => ({ command: 'for_each', values: { variable: 'It', list } });
    const echo = (value: string): SolidScriptLine => ({ command: 'echo', values: { value } });
    expect(messages(each('[$Selected.Brushes.First.Edges]'), echo('[It.Length]'), END)).toHaveLength(12);
    expect(messages(each('[$Selected.Brushes.First.Vertices]'), echo('[It.Position]'), END)).toHaveLength(8);
    expect(messages(select('Facing Up'), each('[$Selected.Faces.Edges]'), echo('[It.Length]'), END)).toEqual([
      '2',
      '2',
      '2',
      '2',
    ]);
    expect(messages(select('All'), each('[$Selected.Faces.Vertices]'), echo('v'), END)).toHaveLength(8);
    expect(messages(select('Facing Up'), echo('[$Selected.Faces.First.Vertices.First.Normal.Length]'))).toEqual(['1']);
  });

  it('walks the edges and corners of whole polygons, never the diagonals that split them into triangles', () => {
    const count = (shape: SolidScriptLine, member: string) => {
      const result = run(shape, SELECT_BRUSHES, select('Facing Up', { into: 'Top' }), {
        command: 'echo',
        values: { value: `[${member}]` },
      });
      expect(result.error?.message ?? null).toBeNull();
      return Number(result.messages[0]);
    };
    expect(count(CUBE, '$Selected.Brushes.First.Edges.Count')).toBe(12);
    expect(count(CUBE, '$Selected.Brushes.First.Vertices.Count')).toBe(8);
    expect(count(CUBE, 'Top.First.Edges.Count')).toBe(4);
    // An eight-sided cylinder: its caps are octagons, not fans of triangles.
    const cylinder: SolidScriptLine = { command: 'cylinder', values: { sides: '8', anchor: 'Center, Center, Center' } };
    expect(count(cylinder, '$Selected.Brushes.First.Edges.Count')).toBe(24);
    expect(count(cylinder, '$Selected.Brushes.First.Vertices.Count')).toBe(16);
    expect(count(cylinder, 'Top.First.Edges.Count')).toBe(8);
  });

  it('scatters points over the picked faces by area, the same for the same seed', () => {
    const scatter = (seed: string) =>
      run(
        CUBE,
        SELECT_BRUSHES,
        select('Facing Up'),
        { command: 'scatter_points', values: { count: '20', seed, into: 'Spots', normals: 'Ways' } },
        { command: 'for_each', values: { variable: 'Spot', list: '[Spots]', key: 'I' } },
        { command: 'echo', values: { value: '[I] [Spot] [Ways([I])]' } },
        END,
      );
    const first = scatter('7');
    expect(first.error).toBeNull();
    expect(first.messages).toHaveLength(20);
    for (const message of first.messages) {
      const [, x, y, z, nx, ny, nz] = message.match(/^\d+ \[(.+), (.+), (.+)\] \[(.+), (.+), (.+)\]/)!.map(Number);
      expect(Math.abs(x!)).toBeLessThanOrEqual(1);
      expect(Math.abs(z!)).toBeLessThanOrEqual(1);
      expect(y).toBe(1);
      expect([nx, ny, nz]).toEqual([0, 1, 0]);
    }
    expect(scatter('7').messages).toEqual(first.messages);
    expect(scatter('8').messages).not.toEqual(first.messages);
  });

  it('puts more scattered points on bigger faces', () => {
    const counts = run(
      { command: 'cube', values: { size: '4, 1, 1', anchor: 'Center, Center, Center' } },
      SELECT_BRUSHES,
      select('All'),
      { command: 'scatter_points', values: { count: '600', seed: '1', into: 'Spots', normals: 'Ways' } },
      { command: 'for_each', values: { variable: 'Way', list: '[Ways]' } },
      { command: 'echo', values: { value: '[=Abs([Way.x])]' } },
      END,
    );
    expect(counts.error).toBeNull();
    const ends = counts.messages.filter((x) => x === '1').length;
    expect(counts.messages.length - ends).toBeGreaterThan(ends * 2.5 * 4 * 0.5);
    expect(run(CUBE, { command: 'scatter_points', values: { count: '3', into: 'P' } }).error?.message).toMatch(
      /Select Faces/,
    );
    expect(
      run(CUBE, SELECT_BRUSHES, select('All'), { command: 'scatter_points', values: { count: '-1', into: 'P' } }).error
        ?.message,
    ).toMatch(/Count/);
  });

  it('aligns the lines inside so their Y (up) points along a direction', () => {
    const tall = { command: 'cube', values: { size: '0.2, 1, 0.2', anchor: 'Left, Bottom, Back' } };
    const sideways = run(tall, { command: 'select_brushes' }, { command: 'align', values: { direction: '1, 0, 0' } });
    expect(sideways.error).toBeNull();
    const points = solids(sideways.shapes)[0]!;
    const xs = points.map((point) => Math.round(point.x * 1000) / 1000);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 1]);
    const down = run(tall, { command: 'select_brushes' }, { command: 'align', values: { direction: '0, -2, 0' } });
    expect(heightRange(solids(down.shapes)[0]!)).toEqual([-1, 0]);
    expect(
      run(tall, { command: 'select_brushes' }, { command: 'align', values: { direction: '0, 0, 0' } }).error?.message,
    ).toMatch(/Direction/);
  });

  it('stops with plain errors', () => {
    expect(run(select('Facing Up')).error?.message).toMatch(/doesn't know which brushes/);
    expect(run(CUBE, select('Facing Up')).error?.message).toMatch(/doesn't know which brushes/);
    expect(run(CUBE, SELECT_BRUSHES, select('Facing Up')).error).toBeNull();
    expect(run(CUBE, SELECT_BRUSHES, select('Sideways')).error?.message).toMatch(/Which must be one of/);
    expect(
      run(CUBE, { command: 'place_on_face' }, { command: 'cube', values: { anchor: 'Center, Center, Center' } }, END)
        .error?.message,
    ).toMatch(/doesn't know which faces/);
    expect(run(CUBE, { command: 'extrude_face' }).error?.message).toMatch(/doesn't know which faces/);
    expect(
      run(CUBE, SELECT_BRUSHES, select('Facing Up', { into: 'Top' }), {
        command: 'bevel_edges',
        values: { of: '[$Selected.Brushes.First.Vertices]' },
      }).error?.message,
    ).toMatch(/Of needs a Brush, Face, Edge or Text, or a list of them, not a Vertex List/);
  });

  it('writes face lines in plain words', () => {
    const listing = solidScriptDocumentListing(
      solidScriptDocumentCreate([
        select('All', { where: '[=HasTag([$Face.Tags], "Step Tread")]' }),
        select('All', { where: '[=Facing([$Face.Normal], Vector(0, 1, 0), 45)]', how: 'Add', into: 'Top' }),
        EACH_FACE,
        { command: 'extrude_face', values: { distance: '0.1', of: '[Face]', top: 'Roof' } },
        END,
      ]),
    );
    expect(listing).toEqual([
      'Select Faces All Where \'[=HasTag([$Face.Tags], "Step Tread")]\'',
      "Select Faces All Where '[=Facing([$Face.Normal], Vector(0, 1, 0), 45)]' (Add) Into [Top]",
      "For Each [Face] In '[$Selected.Faces]'",
      "    Extrude Face By '0.1' Of [Face] Top [Roof]",
      'End For Each',
    ]);
  });
});

describe('SolidScript geometry members', () => {
  it('reads any face, corner or edge of a brush through its members, not through formula functions', () => {
    const result = run(CUBE, SELECT_BRUSHES, {
      command: 'echo',
      values: {
        value:
          '[$Selected.Brushes(0).Faces.Count] [$Selected.Brushes(0).Vertices.Count] [$Selected.Brushes(0).Edges.Count] [$Selected.Brushes(0).Faces(0).Area] [$Selected.Brushes(0).Edges(3).Length] [=Len([$Selected.Brushes(0).Vertices(7).Position])]',
      },
    });
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['6 8 12 4 2 3']);
    expect(run(CUBE, { command: 'echo', values: { value: '[=FaceCount()]' } }).error?.message).toMatch(/FaceCount/);
  });
});
