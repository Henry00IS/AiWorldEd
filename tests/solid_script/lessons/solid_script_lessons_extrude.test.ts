import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshLoopCenter, solidScriptMeshLoopNormal } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Runs lines and gives the result.
 *
 * @param lines Lines.
 * @returns Result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/** A 1 m cube wrapped as a mesh, with its top picked. */
const MESH_TOP: SolidScriptLine[] = [
  { command: 'mesh_from_solids' },
  { command: 'cube', values: { anchor: 'Center, Center, Center' } },
  { command: 'end' },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'Facing Up' } },
];

/** A flat 2 by 1 grid of two faces, picked. */
const GRID: SolidScriptLine[] = [
  { command: 'grid_mesh', values: { size: '2, 0, 1', columns: '2', rows: '1' } },
  { command: 'select_objects' },
  { command: 'select_faces', values: { which: 'All' } },
];

/**
 * Gives the first mesh of a result.
 *
 * @param lines Lines.
 * @returns Mesh.
 */
function meshOf(...lines: SolidScriptLine[]) {
  const result = run(...lines);
  if (result.error) throw new Error(result.error.message);
  const leaf = solidScriptGeometryLeaves(result.shapes).find((entry) => entry.kind === 'mesh');
  if (leaf?.kind !== 'mesh') throw new Error('no mesh');
  return leaf;
}

describe('Extrude Face Direction', () => {
  it('pulls a mesh face along Direction instead of its normal', () => {
    const mesh = meshOf(...MESH_TOP, { command: 'extrude_face', values: { distance: '1', direction: '1, 0, 0' } });
    const top = mesh.faces.find((loop) => solidScriptMeshLoopNormal(mesh.points, loop).y > 0.99);
    if (!top) throw new Error('no top');
    const center = solidScriptMeshLoopCenter(mesh.points, top);
    expect(center.x).toBeCloseTo(1, 6);
    expect(center.y).toBeCloseTo(0.5, 6);
  });

  it('stops when Direction points into a solid face', () => {
    const result = run(
      { command: 'cube' },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'Facing Up' } },
      { command: 'extrude_face', values: { distance: '1', direction: '0, -1, 0' } },
    );
    expect(result.error?.message).toContain('Direction must point out of the face');
  });
});

describe('Extrude Face Individual', () => {
  it('pulls touching mesh faces as one region with walls only around the border when No', () => {
    const before = meshOf(...GRID);
    const region = meshOf(...GRID, { command: 'extrude_face', values: { distance: '1', individual: 'No' } });
    const apart = meshOf(...GRID, { command: 'extrude_face', values: { distance: '1' } });
    expect(region.points.length - before.points.length).toBe(6);
    expect(region.faces.length - before.faces.length).toBe(6);
    expect(apart.points.length - before.points.length).toBe(8);
    expect(apart.faces.length - before.faces.length).toBe(8);
    expect(region.points.slice(before.points.length).every((point) => Math.abs(point.y - 1) < 1e-9)).toBe(true);
  });

  it('writes Top and Sides of a region', () => {
    const result = run(
      ...GRID,
      { command: 'extrude_face', values: { distance: '1', individual: 'No', top: 'Top', sides: 'Sides' } },
      { command: 'echo', values: { value: '[=Len([Top])] [=Len([Sides])]' } },
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages.at(-1)).toBe('2 6');
  });
});

describe('Extrude Face inward on a solid', () => {
  it('sinks a Subtractive slab into the solid for a negative Distance', () => {
    const result = run(
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'Facing Up' } },
      { command: 'extrude_face', values: { distance: '-0.25', top: 'Floor' } },
      { command: 'echo', values: { value: '[=Len([Floor])]' } },
    );
    if (result.error) throw new Error(result.error.message);
    const slabs = solidScriptGeometryLeaves(result.shapes).filter(
      (leaf) => leaf.kind === 'solid' && leaf.mode === 'Subtractive',
    );
    expect(slabs).toHaveLength(1);
    const box = new THREE.Box3().setFromPoints(slabs[0]?.points ?? []);
    expect(box.min.y).toBeCloseTo(0.25, 6);
    expect(box.max.y).toBeCloseTo(0.5, 6);
    expect(result.messages.at(-1)).toBe('1');
  });
});
