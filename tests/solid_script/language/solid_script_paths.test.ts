import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

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
 * Echoes formulas.
 *
 * @param values Echo values.
 * @returns Messages, or the error.
 */
function echo(lines: SolidScriptLine[], ...values: string[]): string[] | string {
  const result = run(...lines, ...values.map((value) => ({ command: 'echo', values: { value } })), { command: 'cube' });
  return result.error ? result.error.message : result.messages;
}

/**
 * Corner points of every solid a run built.
 *
 * @param result Run result.
 * @returns Points per solid.
 */
function solids(result: ReturnType<typeof run>): THREE.Vector3[][] {
  expect(result.error).toBeNull();
  return result.shapes
    .flatMap(solidScriptShapeLeavesPositive)
    .flatMap((leaf) => (leaf.kind === 'solid' ? [leaf.points] : []));
}

/**
 * A Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return { command: 'variable', values: { name, value } };
}

/**
 * Lines that make a list of points, one item each.
 *
 * @param name List name.
 * @param points Points as field text.
 * @returns Lines.
 */
function points(name: string, ...items: string[]): SolidScriptLine[] {
  return [{ command: 'clear_variable', values: { name } }, ...items.map((item) => set(`${name}()`, item))];
}

/** An L-shaped path: 2 m along X, then 2 m along Y. */
const L_PATH = points('path', '0, 0, 0', '2, 0, 0', '2, 2, 0');

/** A square loop, 4 m a side. */
const LOOP = points('path', '0, 0, 0', '4, 0, 0', '4, 4, 0', '0, 4, 0');

/**
 * Rounded keys of points.
 *
 * @param points Points.
 * @returns Sorted keys.
 */
function keys(points: readonly THREE.Vector3[]): string[] {
  return [
    ...new Set(
      points.map((point) =>
        point
          .toArray()
          .map((value) => value.toFixed(3))
          .join(','),
      ),
    ),
  ].sort();
}

/**
 * Volume a closed mesh encloses, positive when its faces face outwards.
 *
 * @param mesh Mesh.
 * @returns Signed volume.
 */
function volume(mesh: SolidScriptShapeMesh): number {
  let total = 0;
  for (const face of mesh.faces)
    for (let corner = 1; corner + 1 < face.length; corner++) {
      const [a, b, c] = [face[0]!, face[corner]!, face[corner + 1]!].map((index) => mesh.points[index]!);
      total += a!.dot(new THREE.Vector3().crossVectors(b!, c!)) / 6;
    }
  return total;
}

describe('SolidScript paths', () => {
  it('measures a path and spaces points evenly along it, keeping its ends', () => {
    expect(echo(points('p', '0, 0, 0', '3, 0, 0', '3, 4, 0'), '[=path_length([p])]')).toEqual(['7']);
    expect(echo(L_PATH, '[=resample([path], 5)]')).toEqual(['[[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]]']);
    expect(echo(points('p', '0, 0', '4, 0'), '[=resample([p], 3)]')).toEqual(['[[0, 0], [2, 0], [4, 0]]']);
    expect(echo(points('p', '0, 0, 0'), '[=resample([p], 3)]')).toMatch(
      /Resample\(points, count\) needs at least 2 points/,
    );
  });

  it('sweeps a round profile along a path into one solid per stretch, joined on mitred ends', () => {
    const pieces = solids(
      run(...L_PATH, { command: 'curve_to_mesh', values: { path: '[path]', radius: '0.5', sides: '4' } }),
    );
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) expect(keys(piece)).toHaveLength(8);
    const shared = keys(pieces[0]!).filter((key) => keys(pieces[1]!).includes(key));
    expect(shared).toHaveLength(4);
    // The joint ring lies on the mitre plane through the bend: x + y = 2.
    for (const key of shared) {
      const [x, y] = key.split(',').map(Number);
      expect(x! + y!).toBeCloseTo(2, 3);
    }
  });

  it('sweeps a listed outline as a profile, and builds one closed mesh with outward faces', () => {
    const result = run(...L_PATH, {
      command: 'curve_to_mesh',
      values: { path: '[path]', profile: '[0, 0, 0], [0.4, 0, 0], [0.4, 0.2, 0], [0, 0.2, 0]', mesh: 'true' },
    });
    expect(result.error).toBeNull();
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    if (!mesh) throw new Error('Expected a mesh');
    expect(mesh.points).toHaveLength(12);
    expect(mesh.faces).toHaveLength(4 * 2 + 2);
    // Outward faces enclose a positive volume: the profile's area times the path's length, about.
    expect(volume(mesh)).toBeGreaterThan(0.08 * 3.5);
    expect(volume(mesh)).toBeLessThan(0.08 * 4.5);
  });

  it('closes a looped path without caps', () => {
    const result = run(...LOOP, {
      command: 'curve_to_mesh',
      values: { path: '[path]', radius: '0.25', sides: '6', closed: 'true', mesh: 'true' },
    });
    const [mesh] = solidScriptShapeMeshes(result.shapes);
    expect(mesh?.points).toHaveLength(24);
    expect(mesh?.faces).toHaveLength(24);
    expect(
      solids(
        run(...LOOP, {
          command: 'curve_to_mesh',
          values: { path: '[path]', closed: 'true' },
        }),
      ),
    ).toHaveLength(4);
  });

  it('says plainly when the path is too short', () => {
    const result = run(...points('path', '0, 0, 0'), {
      command: 'curve_to_mesh',
      values: { path: '[path]' },
    });
    expect(result.error?.message).toMatch(/Path needs at least 2 different points/);
  });

  it('welds mesh corners closer than a distance into one', () => {
    const cubes = (distance: string) =>
      run(
        { command: 'mesh_brushes' },
        { command: 'cube', values: { size: '1, 1, 1' } },
        { command: 'translate', values: { v: '1.0005, 0, 0' } },
        { command: 'cube', values: { size: '1, 1, 1' } },
        END,
        END,
        { command: 'select_brushes' },
        { command: 'merge_by_distance', values: { distance } },
      );
    const [merged] = solidScriptShapeMeshes(cubes('0.001').shapes);
    expect(merged?.points).toHaveLength(12);
    expect(merged?.faces).toHaveLength(12);
    const [apart] = solidScriptShapeMeshes(cubes('0.0001').shapes);
    expect(apart?.points).toHaveLength(16);
  });
});
