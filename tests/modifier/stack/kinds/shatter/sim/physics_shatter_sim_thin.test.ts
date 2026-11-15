import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import {
  physicsShatterSimMinThickness,
  physicsShatterSimThickness,
  physicsShatterSimWarnThin,
  type PhysicsShatterThinPiece,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_thin.js';

/**
 * Builds an axis-aligned box piece with only the planes and hull the check
 * reads.
 *
 * @param x Width.
 * @param y Height.
 * @param z Depth.
 * @returns Box piece.
 */
function boxPiece(x: number, y: number, z: number): PhysicsShatterThinPiece {
  const normals = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const hull: number[] = [];
  for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) hull.push(corner & 1 ? x : 0, corner & 2 ? y : 0, corner & 4 ? z : 0);
  return {
    brush: { planes: normals.map((normal) => ({ normal })) } as unknown as SolidBrush,
    hull: new Float32Array(hull),
  };
}

describe('physics shatter thin piece warning', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses 2 cm or a tenth of the crack size, whichever is larger', () => {
    expect(physicsShatterSimMinThickness(0.1)).toBeCloseTo(0.02);
    expect(physicsShatterSimMinThickness(0.5)).toBeCloseTo(0.05);
  });

  it('measures the smallest width across the face normals', () => {
    expect(physicsShatterSimThickness(boxPiece(1, 0.03, 2))).toBeCloseTo(0.03);
  });

  it('warns once with the count and the thinnest piece, leaving pieces alone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pieces = [boxPiece(1, 1, 1), boxPiece(1, 0.01, 1), boxPiece(0.03, 1, 1)];
    const found = physicsShatterSimWarnThin(pieces, 0.5);
    expect(found.count).toBe(2);
    expect(found.smallest).toBeCloseTo(0.01);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('2 piece(s)');
    expect(pieces).toHaveLength(3);
  });

  it('stays quiet when every piece is thick enough', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(physicsShatterSimWarnThin([boxPiece(1, 1, 1)], 0.5).count).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
