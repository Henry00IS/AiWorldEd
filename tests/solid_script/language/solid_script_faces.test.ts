import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };
const CUBE: SolidScriptLine = { command: 'cube', values: { size: '2, 2, 2', center: 'true' } };

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
 * Lowest and highest Z of points.
 *
 * @param points Points.
 * @returns Rounded range.
 */
function zRange(points: readonly THREE.Vector3[]): [number, number] {
  const zs = points.map((point) => Math.round(point.z * 1000) / 1000);
  return [Math.min(...zs), Math.max(...zs)];
}

describe('SolidScript faces', () => {
  it('places a shape on every picked face', () => {
    const result = run(
      CUBE,
      select('Facing Up'),
      { command: 'for_each_selected_face' },
      { command: 'place_on_face' },
      { command: 'cube', values: { size: '0.5, 0.5, 0.1', center: 'false' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    const all = solids(result.shapes);
    expect(all).toHaveLength(2);
    expect(zRange(all[1]!)).toEqual([1, 1.1]);
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
    expect(result.messages).toEqual(['4 [0, 0, 1] [0, 0, 1]']);
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
    expect(zRange(all[1]!)).toEqual([1, 1.5]);
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
    expect(zRange(all[0]!)).toEqual([-1, 1]);
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
      expect(Math.abs(y!)).toBeLessThanOrEqual(1);
      expect(z).toBe(1);
      expect([nx, ny, nz]).toEqual([0, 0, 1]);
    }
    expect(scatter('7').messages).toEqual(first.messages);
    expect(scatter('8').messages).not.toEqual(first.messages);
  });

  it('puts more scattered points on bigger faces', () => {
    const counts = run(
      { command: 'cube', values: { size: '4, 1, 1', center: 'true' } },
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
      "Select Faces  Tagged 'Step Tread'",
      "Select Faces  Facing Up within '45'° (Add)",
      'For Each Selected Face',
      "    Extrude Face  by '0.1'",
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
