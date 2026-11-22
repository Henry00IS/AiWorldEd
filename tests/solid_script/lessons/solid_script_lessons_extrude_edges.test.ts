import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('Extrude Edges', () => {
  it('raises a strip of faces from the border of a grid, sharing corners', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '2' } },
        { command: 'select_objects' },
        { command: 'extrude_edges', values: { where: '[$Edge.IsBoundary]', distance: '0.5', direction: '0, 1, 0' } },
        { command: 'echo', values: { value: '[$Selected.Faces.Count]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages).toEqual(['8']);
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    expect(mesh?.faces).toHaveLength(12);
    expect(mesh?.points).toHaveLength(9 + 8);
    expect(Math.max(...(mesh?.points ?? []).map((point) => point.y))).toBeCloseTo(0.5, 9);
  });

  it('stops on a solid', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([{ command: 'cube' }, { command: 'select_objects' }, { command: 'extrude_edges' }]),
    );
    expect(result.error?.message).toContain('Mesh From Solids');
  });
});
