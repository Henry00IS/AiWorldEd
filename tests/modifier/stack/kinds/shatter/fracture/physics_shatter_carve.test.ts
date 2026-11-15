import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterTestSettings } from './physics_shatter_fixtures.js';

/**
 * Builds a box input.
 *
 * @param id Brush id.
 * @param min Lower corner.
 * @param max Upper corner.
 * @param operation CSG operation.
 * @returns Fracture input.
 */
function carveInput(id: string, min: THREE.Vector3Tuple, max: THREE.Vector3Tuple, operation = SolidOperation.Additive) {
  const brush = SolidBrushFactory.createBox(new THREE.Vector3(...min), new THREE.Vector3(...max));
  return { sourceBrushId: id, brush, operation };
}

/**
 * Sums the piece volumes of a fracture.
 *
 * @param result Fracture result.
 * @param result.pieces Pieces.
 * @returns Kept volume.
 */
function carveKept(result: { pieces: readonly { volume: number }[] }): number {
  return result.pieces.reduce((sum, piece) => sum + piece.volume, 0);
}

describe('physics shatter carving', () => {
  it('gives the shared volume of two overlapping brushes to the later one only', () => {
    const inputs = [carveInput('a', [0, 0, 0], [2, 1, 1]), carveInput('b', [1, 0, 0], [3, 1, 1])];
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.5 }));
    expect(carveKept(result) + result.droppedVolume).toBeCloseTo(3, 5);
    expect(result.carvedVolume).toBeCloseTo(1, 5);
    const first = result.pieces.filter((piece) => piece.sourceIndex === 0);
    expect(first.every((piece) => piece.brush.vertices.every((vertex) => vertex.x <= 1 + 1e-6))).toBe(true);
  });

  it('leaves a subtractive brush as a hole whose walls keep its faces', () => {
    const inputs = [
      carveInput('wall', [0, 0, 0], [4, 3, 0.25]),
      carveInput('door', [1.5, -0.1, -0.1], [2.5, 2, 0.35], SolidOperation.Subtractive),
    ];
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.4 }));
    expect(result.carvingInputs).toBe(1);
    expect(result.pieces.every((piece) => piece.sourceIndex === 0)).toBe(true);
    expect(carveKept(result) + result.droppedVolume).toBeCloseTo(3 - 0.5, 5);
    const walls = result.pieces.flatMap((piece) => piece.faces).filter((face) => face.sourceInputIndex === 1);
    expect(walls.length).toBeGreaterThan(0);
  });

  it('makes no pieces from subtractive or intersecting brushes alone', () => {
    const inputs = [
      carveInput('s', [0, 0, 0], [1, 1, 1], SolidOperation.Subtractive),
      carveInput('i', [2, 0, 0], [3, 1, 1], SolidOperation.Intersecting),
    ];
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings());
    expect(result.pieces).toEqual([]);
    expect(result.carvingInputs).toBe(2);
  });

  it('cuts the same fragments with the same keys every time', () => {
    const inputs = [
      carveInput('a', [0, 0, 0], [2, 1, 1]),
      carveInput('h', [0.5, 0.2, -1], [1.2, 0.7, 2], SolidOperation.Subtractive),
    ];
    const settings = physicsShatterTestSettings({ crackSize: 0.3 });
    const once = physicsShatterFracture(inputs, settings).pieces.map((piece) => [piece.key, Array.from(piece.hull)]);
    expect(physicsShatterFracture(inputs, settings).pieces.map((piece) => [piece.key, Array.from(piece.hull)])).toEqual(
      once,
    );
    expect(new Set(once.map(([key]) => key)).size).toBe(once.length);
  });
});
