import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFillPaths, type SolidScriptFillRule } from '@/solid_script/language/solid_script_fill_paths.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/**
 * A square loop on the ground, running one way or the other.
 *
 * @param half Half its side.
 * @param reverse True to run the other way.
 * @returns Loop.
 */
function square(half: number, reverse = false): THREE.Vector3[] {
  const loop = [
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(-half, 0, half),
    new THREE.Vector3(half, 0, half),
    new THREE.Vector3(half, 0, -half),
  ];
  return reverse ? loop.reverse() : loop;
}

/**
 * Fills loops and adds up the area of the triangles.
 *
 * @param loops Loops.
 * @param rule Rule.
 * @returns Area filled.
 */
function filled(loops: THREE.Vector3[][], rule: SolidScriptFillRule): number {
  const mesh = solidScriptFillPaths(loops, 'Fill Paths', rule);
  return mesh.faces.reduce((sum, [a = 0, b = 0, c = 0]) => {
    const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!];
    return sum + q.clone().sub(p).cross(r.clone().sub(p)).length() / 2;
  }, 0);
}

describe('Fill Paths Rule', () => {
  it('cuts a hole for a path inside another by Even-Odd, whichever way it runs', () => {
    expect(filled([square(2), square(1)], 'Even-Odd')).toBeCloseTo(12, 9);
    expect(filled([square(2), square(1, true)], 'Even-Odd')).toBeCloseTo(12, 9);
  });

  it('fills a path inside another running the same way by Non-Zero, and cuts one running the other way', () => {
    expect(filled([square(2), square(1)], 'Non-Zero')).toBeCloseTo(16, 9);
    expect(filled([square(2), square(1, true)], 'Non-Zero')).toBeCloseTo(12, 9);
  });

  it('cuts the hole only where the loops round it add up to 0 when filled paths sit inside filled ones', () => {
    const loops = [square(3), square(2), square(1, true), square(0.5, true)];
    expect(filled(loops, 'Non-Zero')).toBeCloseTo(35, 9);
    expect(filled(loops, 'Even-Odd')).toBeCloseTo(23, 9);
  });

  it('stops on an unknown Rule', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([{ command: 'fill_paths', values: { rule: 'Sideways' } }]),
    );
    expect(result.error?.message).toContain('Fill Paths needs Even-Odd or Non-Zero in Rule, not Sideways');
  });
});
