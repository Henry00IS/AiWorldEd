import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';

/**
 * Builds three cubes along X, randomizes them and gives each one's center and
 * size.
 *
 * @param values Randomize values.
 * @returns Center and size of each cube, in X order.
 */
function randomized(values: Record<string, string>): { center: THREE.Vector3; size: THREE.Vector3 }[] {
  const cubes: SolidScriptLine[] = [0, 1, 2].flatMap((index): SolidScriptLine[] => [
    { command: 'cube', values: { size: '1', anchor: 'Center, Center, Center', label: `C${index}` } },
    { command: 'move_by', values: { by: `${index * 3}, 0, 0`, of: `C${index}` } },
  ]);
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([...cubes, { command: 'select_objects' }, { command: 'randomize', values }]),
  );
  if (result.error) throw new Error(result.error.message);
  return solidScriptGeometryLeaves(result.shapes)
    .map((leaf) => {
      const box = new THREE.Box3().setFromPoints(leaf.points);
      return { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    })
    .sort((a, b) => a.center.x - b.center.x);
}

describe('Randomize', () => {
  it('scales each object about its own center by its own factor in the range', () => {
    const cubes = randomized({ turn: '0, 0, 0', scale: '0.5, 2' });
    expect(cubes).toHaveLength(3);
    cubes.forEach((cube, index) => {
      expect(cube.center.x).toBeCloseTo(index * 3, 6);
      expect(cube.size.x).toBeGreaterThanOrEqual(0.5);
      expect(cube.size.x).toBeLessThanOrEqual(2);
      expect(cube.size.y).toBeCloseTo(cube.size.x, 6);
    });
    expect(new Set(cubes.map((cube) => cube.size.x.toFixed(4))).size).toBe(3);
  });

  it('gives the same change for the same Seed and another for another Seed', () => {
    const sizes = (seed: string) => randomized({ turn: '0, 0, 0', scale: '0.5, 2', seed }).map((cube) => cube.size.x);
    expect(sizes('0')).toEqual(sizes('0'));
    expect(sizes('1')).not.toEqual(sizes('0'));
  });

  it('moves each object at most Move either way', () => {
    randomized({ move: '0.5, 0, 0', turn: '0, 0, 0', scale: '1' }).forEach((cube, index) => {
      expect(Math.abs(cube.center.x - index * 3)).toBeLessThanOrEqual(0.5);
      expect(cube.center.y).toBeCloseTo(0, 6);
      expect(cube.size.x).toBeCloseTo(1, 6);
    });
  });

  it('stops on a Scale of 0 or below', () => {
    expect(() => randomized({ scale: '0, 1' })).toThrow(/Scale needs factors above 0/);
  });
});
