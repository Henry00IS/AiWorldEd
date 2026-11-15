import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import type { PhysicsShatterInput } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import {
  physicsShatterTestExpectSound,
  physicsShatterTestSettings,
  physicsShatterTestWorst,
} from './physics_shatter_fixtures.js';

/**
 * Builds a box input.
 *
 * @param id Source brush id.
 * @param min Lower corner.
 * @param max Upper corner.
 * @returns Input.
 */
function neighbourBox(id: string, min: [number, number, number], max: [number, number, number]): PhysicsShatterInput {
  return {
    sourceBrushId: id,
    brush: SolidBrushFactory.createBox(new THREE.Vector3(...min), new THREE.Vector3(...max)),
  };
}

/**
 * Lays a staggered course of brick-sized inputs, like a Blast Hole bricks fill:
 * every brick touches its neighbours along whole faces or parts of them.
 *
 * @returns Brick inputs.
 */
function neighbourBrickFill(): PhysicsShatterInput[] {
  const inputs: PhysicsShatterInput[] = [];
  for (let row = 0; row < 6; row++) {
    const offset = row % 2 === 0 ? 0 : 0.2;
    for (let brick = 0; brick < 7; brick++) {
      const x = -1.4 + offset + brick * 0.4;
      inputs.push(neighbourBox(`b${row}-${brick}`, [x, row * 0.2, -0.1], [x + 0.4, (row + 1) * 0.2, 0.1]));
    }
  }
  return inputs;
}

describe('physics shatter inputs that only touch', () => {
  it('leave a brick fill of whole brick inputs as one piece per brick', () => {
    const inputs = neighbourBrickFill();
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickLength: 0.4, brickHeight: 0.2 });
    const result = physicsShatterFracture(inputs, settings);
    expect(result.pieces.length).toBe(inputs.length);
    expect(physicsShatterTestWorst(result.pieces).thickness).toBeGreaterThanOrEqual(0.2 - 1e-9);
    physicsShatterTestExpectSound(result, 0.2);
  });

  it('do not cut each other in glass mode either', () => {
    const inputs = [neighbourBox('a', [-1, 0, -0.1], [0, 1, 0.1]), neighbourBox('b', [0, 0.3, -0.1], [1, 1.3, 0.1])];
    const settings = physicsShatterTestSettings({ crackSize: 5 });
    const result = physicsShatterFracture(inputs, settings);
    expect(result.pieces.length).toBe(2);
    expect(result.carvedVolume).toBeCloseTo(0, 9);
  });

  it('still carve where they really overlap', () => {
    const inputs = [neighbourBox('a', [-1, 0, -0.1], [0.2, 1, 0.1]), neighbourBox('b', [0, 0, -0.1], [1, 1, 0.1])];
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 5 }));
    expect(result.carvedVolume).toBeCloseTo(0.2 * 1 * 0.2, 9);
  });
});

describe('physics shatter brick runs', () => {
  it('run along the wall, never through its depth, for parts narrower than the wall is deep', () => {
    const inputs: PhysicsShatterInput[] = [];
    for (let part = 0; part < 8; part++)
      inputs.push(neighbourBox(`p${part}`, [-1.2 + part * 0.3, 0, -0.25], [-0.9 + part * 0.3, 1.2, 0.25]));
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickLength: 0.4, brickHeight: 0.2, seed: 2 });
    const result = physicsShatterFracture(inputs, settings);
    for (const piece of result.pieces) {
      const zs = piece.brush.vertices.map((vertex) => vertex.z);
      expect(Math.min(...zs)).toBeCloseTo(-0.25, 9);
      expect(Math.max(...zs)).toBeCloseTo(0.25, 9);
    }
    const total = inputs.reduce((sum, input) => sum + physicsShatterBrushVolume(input.brush), 0);
    expect(result.pieces.reduce((sum, piece) => sum + piece.volume, 0)).toBeCloseTo(total, 9);
  });

  it('still follow the longer side of a lone brush', () => {
    const side = [neighbourBox('side', [-0.1, 0, -2], [0.1, 1, 2])];
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickLength: 0.4, brickHeight: 0.2 });
    for (const piece of physicsShatterFracture(side, settings).pieces) {
      const xs = piece.brush.vertices.map((vertex) => vertex.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 9);
    }
  });
});
