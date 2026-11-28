import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import {
  solidScriptGeometryLeaves,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * Finds an official example by id.
 *
 * @param id Example id.
 * @returns Example.
 */
function exampleOf(id: string) {
  const example = SOLID_SCRIPT_EXAMPLES.find((entry) => entry.id === id);
  if (!example) throw new Error(`missing example ${id}`);
  return example;
}

/**
 * Runs an official example and returns its world leaves.
 *
 * @param id Example id.
 * @param box Generator box size, or the 1, 1, 1 stand-in when omitted.
 * @returns Leaves.
 */
function runExample(id: string, box?: readonly [number, number, number]): SolidScriptGeometryLeaf[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(exampleOf(id).lines), box ? { box } : {});
  expect(result.error?.message ?? null).toBeNull();
  return solidScriptGeometryLeaves(result.shapes);
}

/**
 * Axis-aligned bounds of every point in the leaves.
 *
 * @param leaves Leaves.
 * @returns Bounds.
 */
function leavesBounds(leaves: readonly SolidScriptGeometryLeaf[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const leaf of leaves) for (const point of leaf.points) box.expandByPoint(point);
  return box;
}

describe('SolidScript Baseboard example', () => {
  it('has no Follows name and writes the moulding profile as 2D points', () => {
    const wall = exampleOf('baseboard').lines.find(
      (line) => line.command === 'input' && line.values?.['name'] === 'Wall',
    );
    expect(wall?.values?.['follows'] ?? '').toBe('');
    const sweep = exampleOf('baseboard').lines.find((line) => line.command === 'sweep_along_path');
    expect(sweep?.values?.['profile']).toBe(
      '[0, 0], [[Thickness], 0], [[Thickness], [=[Height] * 0.8]], [[=[Thickness] / 2], [Height]], [0, [Height]]',
    );
  });

  it('keeps the flat back on the wall and points the moulding into the room', () => {
    const bounds = leavesBounds(runExample('baseboard'));
    expect(bounds.min.x).toBeGreaterThan(-2.001);
    expect(bounds.max.x).toBeLessThan(2.001);
    expect(bounds.min.z).toBeGreaterThan(-1.501);
    expect(bounds.max.z).toBeLessThan(1.501);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(3.9);
    expect(bounds.max.x - 2).toBeLessThan(0.001);
    expect(-2 - bounds.min.x).toBeLessThan(0.001);
    expect(bounds.max.y).toBeCloseTo(0.12, 5);
  });

  it('builds the same solid from the 2D profile as from the same points with a Z of 0', () => {
    const two = exampleOf('baseboard').lines;
    const three = two.map((line) =>
      line.command === 'sweep_along_path'
        ? {
            ...line,
            values: {
              ...line.values,
              profile:
                '[0, 0, 0], [[Thickness], 0, 0], [[Thickness], [=[Height] * 0.8], 0], [[=[Thickness] / 2], [Height], 0], [0, [Height], 0]',
            },
          }
        : line,
    );
    const left = solidScriptProgramRun(solidScriptDocumentCreate(two));
    const right = solidScriptProgramRun(solidScriptDocumentCreate(three));
    expect(left.error).toBeNull();
    expect(right.error).toBeNull();
    expect(solidScriptGeometryLeaves(left.shapes).map((leaf) => leaf.points.map((point) => point.toArray()))).toEqual(
      solidScriptGeometryLeaves(right.shapes).map((leaf) => leaf.points.map((point) => point.toArray())),
    );
  });

  it('points the Curve Baseboard moulding into the room as well', () => {
    const bounds = leavesBounds(runExample('curveBaseboard'));
    expect(bounds.min.x).toBeGreaterThan(-1.501);
    expect(bounds.max.x).toBeLessThan(1.501);
    expect(bounds.min.z).toBeGreaterThan(-1.001);
    expect(bounds.max.z).toBeLessThan(1.001);
  });
});

describe('SolidScript examples fill the generator box', () => {
  it('sizes the doorway wall, the tapered box and the irregular rock to the box', () => {
    const box: [number, number, number] = [4, 2, 6];
    const wall = leavesBounds(runExample('doorway', box));
    expect(wall.min.x).toBeCloseTo(-2, 5);
    expect(wall.max.x).toBeCloseTo(2, 5);
    expect(wall.min.y).toBeCloseTo(-1, 5);
    expect(wall.max.y).toBeCloseTo(1, 5);
    expect(wall.min.z).toBeLessThanOrEqual(-3);
    expect(wall.max.z).toBeGreaterThanOrEqual(3);

    const tapered = leavesBounds(runExample('taperedBox', box));
    expect(tapered.min.x).toBeCloseTo(-2, 5);
    expect(tapered.max.x).toBeCloseTo(2, 5);
    expect(tapered.min.y).toBeCloseTo(-1, 5);
    expect(tapered.max.y).toBeCloseTo(1, 5);
    expect(tapered.min.z).toBeCloseTo(-3, 5);
    expect(tapered.max.z).toBeCloseTo(3, 5);

    const rock = leavesBounds(runExample('irregularRock', box));
    expect(rock.min.x).toBeGreaterThanOrEqual(-2.001);
    expect(rock.max.x).toBeLessThanOrEqual(2.001);
    expect(rock.min.y).toBeGreaterThanOrEqual(-1.001);
    expect(rock.max.y).toBeLessThanOrEqual(1.001);
    expect(rock.min.z).toBeGreaterThanOrEqual(-3.001);
    expect(rock.max.z).toBeLessThanOrEqual(3.001);
    expect(rock.max.x - rock.min.x).toBeGreaterThan(1);
  });

  it('grows a second doorway when the generator box is larger', () => {
    const small = leavesBounds(runExample('doorway', [2, 2, 2]));
    const large = leavesBounds(runExample('doorway', [8, 8, 8]));
    expect(large.max.x - large.min.x).toBeCloseTo((small.max.x - small.min.x) * 4, 5);
    expect(large.max.y - large.min.y).toBeCloseTo((small.max.y - small.min.y) * 4, 5);
  });
});
