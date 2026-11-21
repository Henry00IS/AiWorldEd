import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const CUBE = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center' });
const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines and returns what they printed.
 *
 * @param lines Lines.
 * @returns Messages; the first item is the error when the run stops.
 */
function printed(lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript cached edge and vertex members', () => {
  it('updates Edge.Center, Vertex.Position and Face.Center after Move By', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_edges', { into: 'Edges' }),
        line('select_vertices', { into: 'Corners' }),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('variable', { name: 'EdgeAt', value: '[Edges.First.Center]' }),
        line('variable', { name: 'CornerAt', value: '[Corners.First.Position]' }),
        line('variable', { name: 'FaceAt', value: '[Top.First.Center]' }),
        line('variable', { name: 'Length', value: '[Edges.First.Length]' }),
        line('move_by', { by: '0, 2, 0' }),
        line('echo', {
          value:
            '[=[Edges.First.Center] - [EdgeAt]] [=[Corners.First.Position] - [CornerAt]] [=[Top.First.Center] - [FaceAt]] [Top.First.Width] [=[Edges.First.Length] - [Length]]',
        }),
      ]),
    ).toEqual(['[0, 2, 0] [0, 2, 0] [0, 2, 0] 2 0']);
  });

  it('keeps those members after Rotate To and Scale By', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_faces', { which: 'Facing Up', into: 'Top' }),
        line('select_edges', { of: '[Top]', into: 'Rim' }),
        line('rotate_to', { to: '0, 90, 0' }),
        line('echo', { value: '[Top.First.Center] [Rim.First.Length] [Top.First.Width]' }),
        line('scale_by', { by: '2, 2, 2' }),
        line('echo', { value: '[Top.First.Center] [Rim.First.Length] [Top.First.Width]' }),
      ]),
    ).toEqual(['[0, 1, 0] 2 2', '[0, 2, 0] 4 4']);
  });

  it('reads a fresh Edge.Center after each Move By inside For Each', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_edges', { into: 'Edges' }),
        line('for_each', { variable: 'Edge', list: '[Edges]', key: 'I' }),
        line('echo', { value: '[Edges.Center] [Edge.Length]' }),
        line('move_by', { by: '0, 1, 0' }),
        END,
      ]),
    ).toEqual(Array.from({ length: 12 }, (_, index) => `[0, ${index}, 0] 2`));
  });

  it('keeps each mesh’s edges on that mesh when several meshes are read', () => {
    expect(
      printed([
        CUBE,
        line('select_brushes'),
        line('select_edges', { into: 'First' }),
        line('transform', { move: '10, 0, 0' }),
        CUBE,
        END,
        line('select_brushes', { which: 'Between' }),
        line('select_edges', { into: 'Second' }),
        line('echo', { value: '[First.Count] [Second.Count] [First.Center] [Second.Center]' }),
      ]),
    ).toEqual(['12 12 [0, 0, 0] [10, 0, 0]']);
  });

  it('treats colinear Subdivide pieces as one edge whose Length is the whole line', () => {
    expect(
      printed([
        line('mesh_brushes'),
        CUBE,
        END,
        line('select_brushes'),
        line('subdivide', { levels: '1', smooth: 'No' }),
        line('select_edges', { which: 'All', into: 'Edges' }),
        line('echo', { value: '[Edges.Count] [=Max([Edges.Lengths])]' }),
      ]),
    ).toEqual(['24 2']);
  });

  it('still finds a moved edge after Subdivide joins its pieces', () => {
    expect(
      printed([
        line('mesh_brushes'),
        CUBE,
        END,
        line('select_brushes'),
        line('select_edges', { into: 'Edges' }),
        line('variable', { name: 'Length', value: '[Edges.First.Length]' }),
        line('move_by', { by: '0, 3, 0' }),
        line('subdivide', { levels: '1', smooth: 'No' }),
        line('echo', { value: '[Edges.Count] [=[Edges.First.Length] - [Length]] [=[Edges.Center] - Vector(0, 0, 0)]' }),
      ]),
    ).toEqual(['12 0 [0, 3, 0]']);
  });

  it('picks no edges or corners from a mesh with no faces', () => {
    expect(
      printed([
        line('mesh_brushes'),
        CUBE,
        END,
        line('select_brushes'),
        line('select_faces', { which: 'All' }),
        line('delete_faces'),
        line('select_edges', { into: 'Edges' }),
        line('select_vertices', { into: 'Corners' }),
        line('echo', { value: '[Edges.Count] [Corners.Count]' }),
      ]),
    ).toEqual(['0 0']);
  });
});
