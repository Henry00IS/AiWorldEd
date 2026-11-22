import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Runs one Icosphere Mesh line and gives the mesh it built.
 *
 * @param values Icosphere Mesh values.
 * @returns Mesh, or the error text.
 */
function icosphere(values: Record<string, string>) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([{ command: 'icosphere_mesh', values }]));
  if (result.error) return result.error.message;
  const leaf = solidScriptGeometryLeaves(result.shapes).find((entry) => entry.kind === 'mesh');
  if (leaf?.kind !== 'mesh') throw new Error('no mesh');
  return leaf;
}

describe('Icosphere Mesh', () => {
  it('builds a mesh of triangles with every corner Radius from the origin', () => {
    const mesh = icosphere({ radius: '2', subdivisions: '2' });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.points).toHaveLength(42);
    expect(mesh.faces).toHaveLength(80);
    for (const point of mesh.points) expect(point.length()).toBeCloseTo(2, 9);
  });

  it('starts at Radius 1 and Subdivisions 1, an icosahedron of 20 faces', () => {
    const mesh = icosphere({});
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(20);
    expect(mesh.points[0]?.length()).toBeCloseTo(1, 9);
  });

  it('stops on Subdivisions outside 1 to 7', () => {
    expect(icosphere({ subdivisions: '8' })).toContain('Subdivisions');
    expect(icosphere({ subdivisions: '0' })).toContain('Subdivisions');
  });
});
