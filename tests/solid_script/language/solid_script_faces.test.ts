import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2' } };

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
      select('Facing Up'),
      { command: 'for_each_selected_face' },
      { command: 'place_on_face' },
      { command: 'cube', values: { size: '0.5, 0.1, 0.5', anchor: 'Left, Bottom, Back' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(2);
    expect(heightRange(all[1]!)).toEqual([1, 1.1]);
  });

  it('sits a shape flush on a face and centred on it with Anchor Center, Bottom, Center', () => {
    const placed = (side: string, anchorText: string) => {
      const result = run(
        CUBE,
        select(side),
        { command: 'for_each_selected_face' },
        { command: 'place_on_face' },
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
    // On the front: flush against it, out along Z, still centred.
    expect(placed('Facing Front', 'Center, Bottom, Center')).toEqual({
      min: [-0.25, -0.25, 1],
      max: [0.25, 0.25, 1.2],
    });
    // Centred halfway into the face.
    expect(placed('Facing Up', 'Center, Center, Center')).toEqual({ min: [-0.25, 0.9, -0.25], max: [0.25, 1.1, 0.25] });
  });

  it('nests Select Faces: a round picks faces of what it built, and the outer pick comes back after', () => {
    const result = run(
      CUBE,
      select('Facing Up'),
      { command: 'for_each_selected_face' },
      { command: 'place_on_face' },
      { command: 'cube', values: { size: '0.5, 0.5, 0.5', anchor: 'Left, Bottom, Back' } },
      select('All'),
      { command: 'for_each_selected_face' },
      { command: 'echo', values: { value: 'inner [Face.Center]' } },
      END,
      END,
      END,
      { command: 'for_each_selected_face' },
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

  it('builds the shapes of a For Each Selected Face round standing on its face, also in a nested round', () => {
    const result = run(
      CUBE,
      select('All'),
      { command: 'for_each_selected_face' },
      { command: 'place_on_face' },
      { command: 'cube', values: { size: '0.2, 0.2, 0.2', anchor: 'Left, Bottom, Back' } },
      select('All'),
      { command: 'for_each_selected_face' },
      { command: 'cube', values: { size: '0.2, 0.2, 0.2' } },
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
      command: 'translate',
      values: { v: `${x}, 0, 0` },
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
      const result = run(...lines, ...more, { command: 'echo', values: { value: 'round' } }, END);
      expect(result.error).toBeNull();
      return result.messages.filter((message) => message === 'round').length;
    };
    expect(count(select('All', { of: 'KNOB' }), { command: 'for_each_selected_face' })).toBe(12);
    expect(count(select('All', { of: 'Base' }), { command: 'for_each_selected_face' })).toBe(6);
    expect(count(select('All'), { command: 'for_each_selected_face' })).toBe(18);
    expect(count({ command: 'for_each_vertex', values: { of: 'Knob' } })).toBe(16);
    expect(count({ command: 'for_each_edge', values: { of: 'base' } })).toBe(12);
    const missing = run(...lines, select('All', { of: 'Handle' }));
    expect(missing.error?.message).toContain('No shape above is named "Handle"');
    expect(solidScriptDocumentListing(solidScriptDocumentCreate([lines[0]!, select('All', { of: 'Knob' })]))).toEqual([
      "Cube '4, 4, 1' Named Base",
      'Select Faces All Of Knob',
    ]);
  });

  it('puts a trim on every stair step by its tag', () => {
    const result = run(
      { command: 'stairs', values: { size: '2, 2, 2' } },
      select('Tagged', { detail: 'Step Tread' }),
      { command: 'for_each_selected_face' },
      { command: 'echo', values: { value: '[Face.Index] [Face.Tag]' } },
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages.length).toBeGreaterThan(1);
    expect(result.messages[0]).toBe('0 Step Tread');
  });

  it('shows the face values inside the loop', () => {
    const result = run(
      CUBE,
      select('Facing Up'),
      { command: 'for_each_selected_face' },
      { command: 'echo', values: { value: '[Face.Area] [Face.Center] [Face.Normal]' } },
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['4 [0, 1, 0] [0, 1, 0]']);
  });

  it('adds, removes and picks faces in plain words', () => {
    const count = (...picks: SolidScriptLine[]) => {
      const result = run(
        CUBE,
        ...picks,
        { command: 'for_each_selected_face' },
        { command: 'echo', values: { value: 'x' } },
        END,
      );
      expect(result.error).toBeNull();
      return result.messages.length;
    };
    expect(count(select('All'))).toBe(6);
    expect(count(select('Facing Up'), select('Facing Down', { how: 'Add' }))).toBe(2);
    expect(count(select('All'), select('Tagged', { detail: 'Side', how: 'Remove' }))).toBe(2);
    expect(count(select('Biggest', { detail: '3' }))).toBe(3);
    expect(count(select('Number', { detail: '0, 2' }))).toBe(2);
    expect(count(select('Where', { detail: '[=[Face.Center(2)] > 0.5]' }))).toBe(1);
    expect(count(select('Facing', { detail: '1, 0, 0' }))).toBe(1);
  });

  it('extrudes a brush face as a new brush', () => {
    const result = run(CUBE, select('Facing Up'), { command: 'extrude_face', values: { distance: '0.5' } });
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(2);
    expect(heightRange(all[1]!)).toEqual([1, 1.5]);
  });

  it('insets and deletes faces by turning the brush into a mesh', () => {
    const inset = run(CUBE, select('Facing Up'), { command: 'inset_face', values: { distance: '0.2' } });
    expect(inset.error).toBeNull();
    expect(solidScriptShapeMeshes(inset.shapes)[0]!.faces).toHaveLength(10);
    const deleted = run(CUBE, select('Facing Up'), { command: 'delete_faces' });
    expect(deleted.error).toBeNull();
    expect(solidScriptShapeMeshes(deleted.shapes)[0]!.faces).toHaveLength(5);
  });

  it('bevels the edges of picked brush faces', () => {
    const result = run(CUBE, select('Facing Up'), { command: 'bevel_edges', values: { distance: '0.2' } });
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(1);
    expect(all[0]!.length).toBeGreaterThan(8);
    expect(heightRange(all[0]!)).toEqual([-1, 1]);
  });

  it('loops over corners and edges', () => {
    const vertices = run(
      CUBE,
      { command: 'for_each_vertex' },
      { command: 'echo', values: { value: '[Vertex.Index]' } },
      END,
    );
    expect(vertices.error).toBeNull();
    expect(vertices.messages).toHaveLength(8);
    const edges = run(CUBE, { command: 'for_each_edge' }, { command: 'echo', values: { value: '[Edge.Length]' } }, END);
    expect(edges.error).toBeNull();
    expect(edges.messages).toEqual(Array.from({ length: 12 }, () => '2'));
  });

  it('loops over the corners and edges of the shapes, the picked faces or the face of the round', () => {
    const echo = (value: string): SolidScriptLine => ({ command: 'echo', values: { value } });
    const vertex = (where: string): SolidScriptLine => ({ command: 'for_each_vertex', values: { in: where } });
    const edge = (where: string): SolidScriptLine => ({ command: 'for_each_edge', values: { in: where } });
    const messages = (...lines: SolidScriptLine[]) => {
      const result = run(CUBE, ...lines);
      expect(result.error).toBeNull();
      return result.messages;
    };
    const round = (line: SolidScriptLine, value: string) =>
      messages(select('Facing Up'), { command: 'for_each_selected_face' }, line, echo(value), END, END);
    const corners = round(vertex('Current Face'), '[Vertex.Index] [Vertex.Normal]');
    expect(corners.map((message) => message.split(' ')[0])).toEqual(['0', '1', '2', '3']);
    expect(new Set(corners.map((message) => message.split(' ').slice(1).join(' '))).size).toBe(1);
    expect(round(edge('Current Face'), '[Edge.Length]')).toEqual(['2', '2', '2', '2']);
    // Shared corners and edges of the picked faces count once.
    expect(messages(select('Facing Up'), vertex('Selected Faces'), echo('v'), END)).toHaveLength(4);
    expect(messages(select('All'), vertex('Selected Faces'), echo('v'), END)).toHaveLength(8);
    expect(messages(select('All'), edge('Selected Faces'), echo('e'), END)).toHaveLength(12);
    // Shapes stays the default: a pick above does not change it.
    expect(messages(select('Facing Up'), { command: 'for_each_vertex' }, echo('v'), END)).toHaveLength(8);
    expect(run(CUBE, vertex('Current Face'), END).error?.message).toContain('inside For Each Selected Face');
    expect(run(CUBE, edge('Selected Faces'), END).error?.message).toContain('Select Faces');
    expect(
      solidScriptDocumentListing(solidScriptDocumentCreate([vertex('Current Face'), END, edge('Shapes'), END])),
    ).toEqual(['For Each Vertex In Current Face', 'End For Each', 'For Each Edge', 'End For Each']);
  });

  it('walks the edges and corners of whole polygons, never the diagonals that split them into triangles', () => {
    const echo: SolidScriptLine = { command: 'echo', values: { value: 'x' } };
    const count = (shape: SolidScriptLine, ...lines: SolidScriptLine[]) => {
      const result = run(shape, ...lines);
      expect(result.error).toBeNull();
      return result.messages.length;
    };
    const top = (shape: SolidScriptLine) =>
      count(
        shape,
        select('Facing Up'),
        { command: 'for_each_selected_face' },
        { command: 'for_each_edge', values: { in: 'Current Face' } },
        echo,
        END,
        END,
      );
    expect(count(CUBE, { command: 'for_each_edge' }, echo, END)).toBe(12);
    expect(count(CUBE, { command: 'for_each_vertex' }, echo, END)).toBe(8);
    expect(top(CUBE)).toBe(4);
    // An eight-sided cylinder: its caps are octagons, not fans of triangles.
    const cylinder: SolidScriptLine = { command: 'cylinder', values: { sides: '8' } };
    expect(count(cylinder, { command: 'for_each_edge' }, echo, END)).toBe(24);
    expect(count(cylinder, { command: 'for_each_vertex' }, echo, END)).toBe(16);
    expect(top(cylinder)).toBe(8);
  });

  it('scatters points over the picked faces by area, the same for the same seed', () => {
    const scatter = (seed: string) =>
      run(
        CUBE,
        select('Facing Up'),
        { command: 'for_each_scattered_point', values: { count: '20', seed } },
        { command: 'echo', values: { value: '[Point.Index] [Point.Position] [Point.Normal] [Face.Tag]' } },
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
      { command: 'cube', values: { size: '4, 1, 1' } },
      select('All'),
      { command: 'for_each_scattered_point', values: { count: '600', seed: '1' } },
      { command: 'echo', values: { value: '[Face.Area]' } },
      END,
    );
    expect(counts.error).toBeNull();
    const big = counts.messages.filter((area) => area === '4').length;
    const small = counts.messages.filter((area) => area === '1').length;
    expect(big).toBeGreaterThan(small * 2.5);
    expect(run(CUBE, { command: 'for_each_scattered_point', values: { count: '3' } }, END).error?.message).toMatch(
      /Select Faces/,
    );
    expect(
      run(CUBE, select('All'), { command: 'for_each_scattered_point', values: { count: '-1' } }, END).error?.message,
    ).toMatch(/Count/);
  });

  it('aligns the lines inside so their Y (up) points along a direction', () => {
    const tall = { command: 'cube', values: { size: '0.2, 1, 0.2', anchor: 'Left, Bottom, Back' } };
    const sideways = run({ command: 'align', values: { direction: '1, 0, 0' } }, tall, END);
    expect(sideways.error).toBeNull();
    const points = solids(sideways.shapes)[0]!;
    const xs = points.map((point) => Math.round(point.x * 1000) / 1000);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 1]);
    const down = run({ command: 'align', values: { direction: '0, -2, 0' } }, tall, END);
    expect(heightRange(solids(down.shapes)[0]!)).toEqual([-1, 0]);
    expect(run({ command: 'align', values: { direction: '0, 0, 0' } }, tall, END).error?.message).toMatch(/Direction/);
  });

  it('stops with plain errors', () => {
    expect(run(select('Facing Up')).error?.message).toMatch(/add a shape such as Cube first/);
    expect(run(CUBE, select('Sideways')).error?.message).toMatch(/Which must be one of/);
    expect(run(CUBE, { command: 'place_on_face' }, { command: 'cube' }, END).error?.message).toMatch(
      /only works inside For Each Selected Face/,
    );
    expect(run(CUBE, { command: 'extrude_face' }).error?.message).toMatch(/add a Select Faces line/);
  });

  it('writes face lines in plain words', () => {
    const listing = solidScriptDocumentListing(
      solidScriptDocumentCreate([
        select('Tagged', { detail: 'Step Tread' }),
        select('Facing Up', { within: '45', how: 'Add' }),
        { command: 'for_each_selected_face' },
        { command: 'extrude_face', values: { distance: '0.1' } },
        END,
      ]),
    );
    expect(listing).toEqual([
      "Select Faces Tagged 'Step Tread'",
      "Select Faces Facing Up within '45'° (Add)",
      'For Each Selected Face',
      "    Extrude Face by '0.1'",
      'End For Each',
    ]);
  });
});

describe('SolidScript geometry lookups', () => {
  it('reads any face, corner or edge of the shapes above in a formula', () => {
    const result = run(CUBE, {
      command: 'echo',
      values: {
        value:
          '[=face_count()] [=vertex_count()] [=edge_count()] [=face_area(0)] [=edge_length(3)] [=len(vertex_position(7))]',
      },
    });
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['6 8 12 4 2 3']);
    expect(run(CUBE, { command: 'echo', values: { value: '[=face_area(9)]' } }).error?.message).toMatch(
      /there is no face 9; the shapes above have 6/,
    );
  });
});
