import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

const END: SolidScriptLine = { command: 'end' };

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
 * Returns the rounded bounds of every solid corner, as min x, y, z then max.
 *
 * @param shapes Shapes.
 * @returns Bounds.
 */
function bounds(shapes: readonly SolidScriptShape[]): number[] {
  const points = shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : []));
  const box = new THREE.Box3().setFromPoints(points);
  return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 100) / 100 + 0);
}

/**
 * Counts solid leaves.
 *
 * @param shapes Shapes.
 * @returns Count.
 */
function solids(shapes: readonly SolidScriptShape[]): number {
  return shapes.flatMap(solidScriptShapeLeavesPositive).filter((leaf) => leaf.kind === 'solid').length;
}

describe('SolidScript Resize, Matrix, Minkowski and Rotate Extrude', () => {
  it('resizes shapes to an exact size, keeping axes of 0 or their proportions', () => {
    const plain = run(
      { command: 'resize', values: { size: '4, 2, 1' } },
      { command: 'sphere', values: { anchor: 'Center, Center, Center' } },
      END,
    );
    expect(plain.error).toBeNull();
    expect(bounds(plain.shapes)).toEqual([-2, -1, -0.5, 2, 1, 0.5]);
    const kept = run(
      { command: 'resize', values: { size: '4, 0, 0', keep: 'true' } },
      { command: 'cube', values: { size: '2, 1, 1', anchor: 'Center, Center, Center' } },
      END,
    );
    expect(bounds(kept.shapes)).toEqual([-2, -1, -1, 2, 1, 1]);
  });

  it('applies a matrix with a shear and refuses one that squashes shapes flat', () => {
    const leaned = run(
      { command: 'matrix', values: { row1: '1, 0, 1, 0' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      END,
    );
    expect(leaned.error).toBeNull();
    expect(bounds(leaned.shapes)).toEqual([-1, -0.5, -0.5, 1, 0.5, 0.5]);
    const flat = run(
      { command: 'matrix', values: { row3: '0, 0, 0, 0' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      END,
    );
    expect(flat.error?.message).toMatch(/squashes shapes flat/);
  });

  it('grows a cube by a sphere into a rounded box', () => {
    const result = run(
      { command: 'minkowski' },
      { command: 'cube', values: { size: '2, 2, 1', anchor: 'Center, Center, Center' } },
      { command: 'sphere', values: { r: '0.2', anchor: 'Center, Center, Center' } },
      END,
    );
    expect(result.error).toBeNull();
    expect(solids(result.shapes)).toBe(1);
    expect(bounds(result.shapes)).toEqual([-1.2, -1.2, -0.7, 1.2, 1.2, 0.7]);
  });

  it('spins a flat outline around Y into one brush per side, and starts with a ring that builds at once', () => {
    const result = run(
      { command: 'rotate_extrude', values: { sides: '8' } },
      { command: 'translate', values: { v: '2, 0, 0' } },
      { command: 'square', values: { size: '0.5, 1' } },
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(solids(result.shapes)).toBe(8);
    expect(bounds(result.shapes)).toEqual([-2.25, -0.5, -2.25, 2.25, 0.5, 2.25]);
    const half = run(
      { command: 'rotate_extrude', values: { sides: '8', angle: '180' } },
      { command: 'translate', values: { v: '2, 0, 0' } },
      { command: 'square', values: { size: '0.5, 1' } },
      END,
      END,
    );
    expect(solids(half.shapes)).toBe(4);
    const crossing = run({ command: 'rotate_extrude' }, { command: 'square' }, END);
    expect(crossing.error?.message).toMatch(/must lie at X 0 or more/);
  });

  it('leaves a part early with Return and carries on after Output', () => {
    const result = run(
      { command: 'part', values: { name: 'steps' } },
      { command: 'echo', values: { value: 'before' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
      { command: 'return' },
      { command: 'echo', values: { value: 'skipped' } },
      END,
      { command: 'output', values: { of: '[steps]' } },
      { command: 'echo', values: { value: 'after' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['before', 'after']);
    expect(
      run({ command: 'return' }, { command: 'cube', values: { anchor: 'Center, Center, Center' } }).error?.message,
    ).toMatch(/only works inside one of them/);
  });

  it('looks up blended table values and makes repeatable random numbers', () => {
    const result = run(
      { command: 'variable', values: { name: 'table', value: '[=$[$[0, 0$], $[10, 100$]$]]' } },
      { command: 'echo', values: { value: '[=lookup(2.5, [table])] [=lookup(-1, [table])] [=lookup(20, [table])]' } },
      { command: 'echo', values: { value: '[=rands(0, 1, 2, 7) == rands(0, 1, 2, 7)] [=len(rands(0, 1, 3))]' } },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['25 0 100', 'Yes 3']);
  });
});
