import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');
const BOX = line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', label: 'Box' });

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
 * Rounded bounds of every solid and mesh corner, as min x, y, z then max.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function bounds(shapes: readonly SolidScriptShape[]): number[] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' || leaf.kind === 'mesh' ? leaf.points : []));
  const box = new THREE.Box3().setFromPoints(points);
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 1000) / 1000 + 0);
}

describe('SolidScript Set Positions', () => {
  it('moves the picked corners of a solid by a formula read once per corner', () => {
    const result = run(
      BOX,
      line('select_vertices', { which: 'All', of: 'Box', where: '[=[$Vertex.Position.Y] > 0]' }),
      line('set_positions', { to: '[=[$Vertex.Position] + Vector(0, 1, 0)]' }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([-1, -1, -1, 1, 2, 1]);
  });

  it('keeps only the corners Where passes, and gives [$Index] and the short [$X], [$Y], [$Z]', () => {
    const result = run(
      BOX,
      line('set_positions', {
        of: 'Box',
        where: '[=[$Y] > 0]',
        to: '[=Vector([$X] * 2, [$Y] + [$Index] * 0, [$Z] * 2)]',
      }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([-2, -1, -2, 2, 1, 2]);
  });

  it('moves mesh points freely', () => {
    const result = run(
      line('mesh_from_solids', { label: 'Lump' }),
      BOX,
      END,
      line('set_positions', { of: 'Lump', where: '[=[$X] > 0]', to: '[=[$Vertex.Position] + Vector(3, 0, 0)]' }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([-1, -1, -1, 4, 1, 1]);
  });

  it('dents a solid without stopping, and stops when nothing is picked', () => {
    const dent = run(BOX, line('set_positions', { of: 'Box', where: '[=[$Index] == 0]', to: '[=Vector(0, 0, 0)]' }));
    expect(dent.error).toBeNull();
    expect(dent.warnings.map((warning) => warning.text).join()).toMatch(/1 solid is not convex/);
    expect(run(BOX, line('set_positions', { to: '[=[$Vertex.Position]]' })).error?.message).toMatch(/Set Positions/);
  });

  it('adds Offset after To, per corner', () => {
    const result = run(
      BOX,
      line('set_positions', { of: 'Box', where: '[=[$Y] > 0]', offset: '[=Vector(0, 1 + [$Index] * 0, 0)]' }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([-1, -1, -1, 1, 2, 1]);
    expect(run(BOX, line('set_positions', { of: 'Box', offset: '1, 2, 3, 4' })).error?.message).toMatch(
      /Offset needs a vector/,
    );
  });

  it('reads every position before moving any, so later corners see the shape before the line', () => {
    const result = run(
      line('cube', { size: '2, 2, 2', anchor: 'Center, Center, Center', into: 'Held' }),
      line('set_positions', { of: '[Held]', where: '[=[$Y] > 0]', offset: '[=Vector(0, [Held.Max.Y], 0)]' }),
      line('output', { of: '[Held]' }),
    );
    expect(result.error?.message).toBeUndefined();
    expect(bounds(result.shapes)).toEqual([-1, -1, -1, 1, 2, 1]);
  });
});
