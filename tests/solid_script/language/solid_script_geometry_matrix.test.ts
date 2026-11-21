import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptBodyBox } from '@/solid_script/language/solid_script_body.js';
import { solidScriptGeometryLeafMatrix } from '@/solid_script/language/solid_script_geometry_matrix.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

/**
 * A box solid of the given size, centred on the origin.
 *
 * @param size Width, height and depth.
 * @returns Solid.
 */
function box(size: number): SolidScriptShapeSolid {
  const half = new THREE.Vector3(size / 2, size / 2, size / 2);
  return { kind: 'solid', label: 'Box', ...solidScriptBodyBox(half.clone().negate(), half) };
}

/**
 * Applies a matrix to every corner of a solid, leaving its faces as they are.
 *
 * @param solid Solid.
 * @param matrix Transform.
 * @returns A new solid.
 */
function moved(solid: SolidScriptShapeSolid, matrix: THREE.Matrix4): SolidScriptShapeSolid {
  return { ...solid, points: solid.points.map((point) => point.clone().applyMatrix4(matrix)) };
}

describe('SolidScript leaf transforms', () => {
  it('reads a move, a turn and a stretch from matching corners', () => {
    const solid = box(2);
    const shift = new THREE.Matrix4().makeTranslation(0, 2, 0);
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const stretch = new THREE.Matrix4().makeScale(2, 1, 1);
    expect(solidScriptGeometryLeafMatrix(solid, moved(solid, shift))?.equals(shift)).toBe(true);
    const readTurn = solidScriptGeometryLeafMatrix(solid, moved(solid, turn));
    expect(readTurn).toBeTruthy();
    const point = new THREE.Vector3(1, 0, 0);
    expect(point.clone().applyMatrix4(readTurn!).distanceTo(point.clone().applyMatrix4(turn))).toBeLessThan(1e-6);
    expect(solidScriptGeometryLeafMatrix(solid, moved(solid, stretch))?.equals(stretch)).toBe(true);
    const flat: SolidScriptShapeSolid = { ...solid, faces: solid.faces.slice(0, 5) };
    expect(solidScriptGeometryLeafMatrix(solid, flat)).toBeNull();
    expect(solidScriptGeometryLeafMatrix(solid, solid)?.equals(new THREE.Matrix4())).toBe(true);
  });
});
