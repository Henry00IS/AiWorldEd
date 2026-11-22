import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Runs a 1 m cube mesh, picked, then the given lines, and gives the mesh.
 *
 * @param lines Lines after the cube.
 * @returns Mesh, or the error.
 */
function bevelled(...lines: SolidScriptLine[]): SolidScriptShapeMesh | string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([
      { command: 'mesh_from_solids', values: { label: 'M' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      { command: 'end' },
      { command: 'select_objects' },
      ...lines,
    ]),
  );
  if (result.error) return result.error.message;
  const [leaf] = solidScriptGeometryLeaves(result.shapes);
  if (leaf?.kind !== 'mesh') return 'no mesh';
  return leaf;
}

/**
 * Volume a closed mesh holds.
 *
 * @param mesh Mesh.
 * @returns Cubic metres.
 */
function volume(mesh: SolidScriptShapeMesh): number {
  let total = 0;
  for (const loop of mesh.faces) {
    const first = mesh.points[loop[0] ?? 0] ?? new THREE.Vector3();
    for (let index = 1; index + 1 < loop.length; index++) {
      const b = mesh.points[loop[index] ?? 0] ?? new THREE.Vector3();
      const c = mesh.points[loop[index + 1] ?? 0] ?? new THREE.Vector3();
      total += first.dot(b.clone().cross(c)) / 6;
    }
  }
  return total;
}

/**
 * Whether every edge of a mesh runs both ways once, so it is closed.
 *
 * @param mesh Mesh.
 * @returns True when closed.
 */
function closed(mesh: SolidScriptShapeMesh): boolean {
  const key = (index: number) => {
    const point = mesh.points[index] ?? new THREE.Vector3();
    return point
      .toArray()
      .map((value) => Math.round(value * 1e5))
      .join(',');
  };
  const runs = new Map<string, number>();
  for (const loop of mesh.faces)
    loop.forEach((corner, spot) => {
      const edge = `${key(corner)}>${key(loop[(spot + 1) % loop.length] ?? 0)}`;
      runs.set(edge, (runs.get(edge) ?? 0) + 1);
    });
  return [...runs.entries()].every(([edge, count]) => {
    const [a, b] = edge.split('>');
    return count === 1 && runs.get(`${b}>${a}`) === 1;
  });
}

describe('Bevel Edges on meshes', () => {
  it('cuts one edge into a strip, closed, taking off the corner prism', () => {
    const mesh = bevelled(
      { command: 'select_edges', values: { where: '[=[$Edge.Center.Y] > 0.4 && [$Edge.Center.X] > 0.4]' } },
      { command: 'bevel_edges', values: { distance: '0.1' } },
    );
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(7);
    expect(closed(mesh)).toBe(true);
    expect(volume(mesh)).toBeCloseTo(1 - 0.005, 5);
  });

  it('bevels every edge of a cube into 6 faces, 12 strips and 8 corners', () => {
    const mesh = bevelled({ command: 'bevel_edges', values: { distance: '0.1', of: '[$Selected.Objects]' } });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(26);
    expect(closed(mesh)).toBe(true);
  });

  it('names the new faces in Into and tags them Bevel', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'mesh_from_solids', values: { label: 'M' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'select_objects' },
        { command: 'bevel_edges', values: { distance: '0.1', of: '[$Selected.Objects]', into: 'Cuts' } },
        { command: 'echo', values: { value: '[Cuts.Count]' } },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['20']);
  });

  it('stops when Distance is too long for the edges', () => {
    expect(bevelled({ command: 'bevel_edges', values: { distance: '0.6', of: '[$Selected.Objects]' } })).toContain(
      'too long',
    );
  });
});

describe('Bevel Vertices', () => {
  it('cuts every corner of a cube off with a triangle', () => {
    const mesh = bevelled({ command: 'bevel_vertices', values: { distance: '0.2', of: '[$Selected.Objects]' } });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(14);
    expect(closed(mesh)).toBe(true);
    expect(volume(mesh)).toBeCloseTo(1 - (8 * 0.2 ** 3) / 6, 5);
  });

  it('keeps the corners that fail Where', () => {
    const mesh = bevelled({
      command: 'bevel_vertices',
      values: { distance: '0.2', of: '[$Selected.Objects]', where: '[=[$Vertex.Position.Y] > 0]' },
    });
    if (typeof mesh === 'string') throw new Error(mesh);
    expect(mesh.faces).toHaveLength(10);
    expect(closed(mesh)).toBe(true);
  });

  it('stops on a solid, with the Mesh From Solids hint', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube' },
        { command: 'select_objects' },
        { command: 'bevel_vertices', values: { of: '[$Selected.Objects]' } },
      ]),
    );
    expect(result.error?.message).toContain('Mesh From Solids');
  });
});

describe('Bevel Edges per edge', () => {
  it('gives each edge its own Distance', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { anchor: 'Center, Center, Center' } },
        { command: 'select_objects' },
        { command: 'select_edges', values: { where: '[=[$Edge.Center.Y] > 0.4 && Abs([$Edge.Center.Z]) < 0.1]' } },
        { command: 'bevel_edges', values: { distance: '[=[$Edge.Center.X] > 0 ? 0.2 : 0.1]' } },
      ]),
    );
    expect(result.error).toBeNull();
    const [leaf] = solidScriptGeometryLeaves(result.shapes);
    if (leaf?.kind !== 'solid') throw new Error('Expected a solid');
    const top = leaf.points.filter((point) => point.y > 0.499);
    expect(Math.max(...top.map((point) => point.x))).toBeCloseTo(0.3, 5);
    expect(Math.min(...top.map((point) => point.x))).toBeCloseTo(-0.4, 5);
  });
});

describe('Bevel Edges on open borders', () => {
  it('skips edges on an open border with a warning and bevels the rest', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'grid_mesh', values: { size: '2, 0, 2', columns: '2', rows: '2' } },
        { command: 'select_objects' },
        { command: 'bevel_edges', values: { distance: '0.1', of: '[$Selected.Objects]' } },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.warnings.map((warning) => warning.line)).toContain(3);
    expect(result.warnings.find((warning) => warning.line === 3)?.text).toContain('open border');
    const [leaf] = solidScriptGeometryLeaves(result.shapes);
    if (leaf?.kind !== 'mesh') throw new Error('Expected a mesh');
    expect(leaf.faces.length).toBeGreaterThan(4);
  });

  it('only warns when every picked edge is on an open border', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'grid_mesh', values: { size: '2, 0, 2' } },
        { command: 'select_objects' },
        { command: 'select_edges', values: { where: '[=Abs([$Edge.Center.X]) > 0.99]' } },
        { command: 'bevel_edges', values: { distance: '0.1' } },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.warnings.find((warning) => warning.line === 4)?.text).toContain('open border');
  });
});
