import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '@/solid/brush/solid_brush_plane_clip.js';
import {
  physicsShatterTestConvexityError,
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './physics_shatter_fixtures.js';

/**
 * Sums the volume of every piece.
 *
 * @param pieces Pieces.
 * @returns Total volume.
 */
function totalVolume(pieces: readonly { volume: number }[]): number {
  return pieces.reduce((sum, piece) => sum + piece.volume, 0);
}

describe('physicsShatterFracture glass mode', () => {
  it('cuts a wall into valid convex pieces that fill it exactly', () => {
    const wall = physicsShatterTestWall(4, 3, 0.3);
    const result = physicsShatterFracture(physicsShatterTestInputs(wall), physicsShatterTestSettings());
    expect(result.pieces.length).toBeGreaterThan(20);
    for (const piece of result.pieces) {
      expect(physicsShatterTestConvexityError(piece.brush)).toBeLessThan(1e-4);
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    }
    expect(totalVolume(result.pieces) + result.droppedVolume).toBeCloseTo(physicsShatterBrushVolume(wall), 6);
    expect(totalVolume(result.pieces) / result.inputVolume).toBeGreaterThan(0.995);
  });

  it('gives the same pieces for the same seed and different ones for another seed', () => {
    const inputs = physicsShatterTestInputs(physicsShatterTestWall(3, 2, 0.25));
    const first = physicsShatterFracture(inputs, physicsShatterTestSettings({ seed: 11 }));
    const again = physicsShatterFracture(inputs, physicsShatterTestSettings({ seed: 11 }));
    const other = physicsShatterFracture(inputs, physicsShatterTestSettings({ seed: 12 }));
    expect(again.pieces.map((piece) => Array.from(piece.hull))).toEqual(
      first.pieces.map((piece) => Array.from(piece.hull)),
    );
    expect(other.pieces.map((piece) => Array.from(piece.hull))).not.toEqual(
      first.pieces.map((piece) => Array.from(piece.hull)),
    );
  });

  it('makes more pieces for a smaller crack size', () => {
    const inputs = physicsShatterTestInputs(physicsShatterTestWall(3, 2, 0.25));
    const coarse = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.8 }));
    const fine = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.35 }));
    expect(fine.pieces.length).toBeGreaterThan(coarse.pieces.length * 2);
  });

  it('gathers smaller pieces around the impact point with Impact Detail', () => {
    const wall = physicsShatterTestWall(4, 4, 0.3);
    const impactPoint = new THREE.Vector3(-1, 1, 0);
    const settings = physicsShatterTestSettings({ impactDetail: 1, impactPoint, impactRadius: 0.8, crackSize: 0.6 });
    const result = physicsShatterFracture(physicsShatterTestInputs(wall), settings);
    const near = result.pieces.filter((piece) => piece.centroid.distanceTo(impactPoint) < 0.8);
    const far = result.pieces.filter((piece) => piece.centroid.distanceTo(impactPoint) > 2.5);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(totalVolume(near) / near.length).toBeLessThan(totalVolume(far) / far.length);
  });

  it('respects Max Pieces and reports the limit', () => {
    const inputs = physicsShatterTestInputs(physicsShatterTestWall(4, 3, 0.3));
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings({ crackSize: 0.1, maxPieces: 40 }));
    expect(result.pieces.length).toBeLessThanOrEqual(40);
    expect(result.limited).toBe(true);
  });

  it('fractures several inputs, including a slanted one, and tags each piece with its source', () => {
    const box = physicsShatterTestWall(2, 2, 0.4);
    const slanted = SolidBrushPlaneClip.clipKeepThreeHalfSpace(
      SolidBrushFactory.createBox(new THREE.Vector3(3, 0, -1), new THREE.Vector3(5, 2, 1)),
      new THREE.Plane(new THREE.Vector3(1, 1, 0.3).normalize(), -5),
      false,
    );
    expect(slanted).not.toBeNull();
    const inputs = physicsShatterTestInputs(box, slanted ?? box);
    const result = physicsShatterFracture(inputs, physicsShatterTestSettings());
    for (const [index, input] of inputs.entries()) {
      const own = result.pieces.filter((piece) => piece.sourceIndex === index);
      expect(own.every((piece) => piece.sourceBrushId === input.sourceBrushId)).toBe(true);
      expect(totalVolume(own)).toBeCloseTo(physicsShatterBrushVolume(input.brush), 3);
    }
    expect(result.pieces.map((piece) => piece.index)).toEqual(result.pieces.map((_, index) => index));
  });

  it('marks faces on input faces as original and new cut faces as cracks', () => {
    const wall = physicsShatterTestWall(3, 2, 0.25);
    const result = physicsShatterFracture(physicsShatterTestInputs(wall), physicsShatterTestSettings());
    for (const piece of result.pieces) {
      expect(piece.faces.length).toBe(piece.brush.faces.length);
      piece.faces.forEach((origin, faceIndex) => {
        const plane = piece.brush.planes[faceIndex];
        const onInput = wall.planes.some((candidate) => plane && candidate.isAlignedWith(plane));
        expect(origin.kind).toBe(onInput ? 'original' : 'crack');
        if (origin.kind === 'original')
          expect(wall.planes[origin.sourceFaceIndex]?.isAlignedWith(plane ?? wall.planes[0]!)).toBe(true);
      });
      expect(piece.faces.some((origin) => origin.kind === 'crack')).toBe(true);
    }
  });

  it('exposes hull vertices as flat triples with their vertex centroid', () => {
    const result = physicsShatterFracture(
      physicsShatterTestInputs(physicsShatterTestWall(2, 2, 0.2)),
      physicsShatterTestSettings(),
    );
    for (const piece of result.pieces) {
      expect(piece.hull.length).toBe(piece.brush.vertices.length * 3);
      const centroid = new THREE.Vector3();
      for (let index = 0; index < piece.hull.length; index += 3)
        centroid.add(new THREE.Vector3().fromArray(piece.hull, index));
      expect(centroid.multiplyScalar(3 / piece.hull.length).distanceTo(piece.centroid)).toBeLessThan(1e-5);
      expect(piece.isBrick).toBe(false);
      expect(piece.seed).toBe(7);
    }
  });

  it('fractures a wall into about 200 pieces well under 100 ms', () => {
    const inputs = physicsShatterTestInputs(physicsShatterTestWall(4, 3, 0.2));
    const settings = physicsShatterTestSettings({ crackSize: 0.2, maxPieces: 200, impactDetail: 0.5 });
    physicsShatterFracture(inputs, settings);
    const started = performance.now();
    const result = physicsShatterFracture(inputs, { ...settings, seed: 8 });
    const elapsed = performance.now() - started;
    expect(result.pieces.length).toBeGreaterThan(180);
    expect(elapsed).toBeLessThan(250);
  });
});

describe('physicsShatterFracture bricks mode', () => {
  it('lays a staggered bond of brick pieces that fill the wall without a mortar gap', () => {
    const wall = physicsShatterTestWall(2, 1, 0.2);
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickLength: 0.4, brickHeight: 0.2 });
    const result = physicsShatterFracture(physicsShatterTestInputs(wall), settings);
    expect(result.pieces.every((piece) => piece.isBrick)).toBe(true);
    expect(totalVolume(result.pieces)).toBeCloseTo(physicsShatterBrushVolume(wall), 6);
    const rowJoints = (row: number): number[] =>
      result.pieces
        .filter((piece) => Math.abs(piece.centroid.y - (row + 0.5) * 0.2) < 1e-6)
        .map((piece) => Math.min(...piece.brush.vertices.map((vertex) => vertex.x)))
        .sort((left, right) => left - right);
    expect(rowJoints(0)).toHaveLength(5);
    expect(rowJoints(1)).toHaveLength(6);
    expect(rowJoints(1)[1]).toBeCloseTo((rowJoints(0)[0] ?? 0) + 0.2, 6);
  });

  it('leaves the mortar gap between bricks', () => {
    const wall = physicsShatterTestWall(2, 1, 0.2);
    const gap = 0.02;
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickLength: 0.4, brickHeight: 0.2, mortarGap: gap });
    const result = physicsShatterFracture(physicsShatterTestInputs(wall), settings);
    const firstRow = result.pieces
      .filter((piece) => piece.centroid.y < 0.2)
      .sort((a, b) => a.centroid.x - b.centroid.x);
    const rightOfFirst = Math.max(...(firstRow[0]?.brush.vertices.map((vertex) => vertex.x) ?? [0]));
    const leftOfSecond = Math.min(...(firstRow[1]?.brush.vertices.map((vertex) => vertex.x) ?? [0]));
    expect(leftOfSecond - rightOfFirst).toBeCloseTo(gap, 6);
    expect(totalVolume(result.pieces)).toBeLessThan(physicsShatterBrushVolume(wall));
  });

  it('runs bricks along the longer horizontal axis and keeps them deterministic with jitter', () => {
    const wall = physicsShatterTestWall(0.2, 1, 3);
    const settings = physicsShatterTestSettings({ mode: 'bricks', brickJitter: 1, seed: 3 });
    const first = physicsShatterFracture(physicsShatterTestInputs(wall), settings);
    const again = physicsShatterFracture(physicsShatterTestInputs(wall), settings);
    expect(again.pieces.map((piece) => Array.from(piece.hull))).toEqual(
      first.pieces.map((piece) => Array.from(piece.hull)),
    );
    for (const piece of first.pieces) {
      const bounds = new THREE.Box3().setFromPoints(piece.brush.vertices);
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.2, 6);
    }
    expect(totalVolume(first.pieces)).toBeCloseTo(physicsShatterBrushVolume(wall), 6);
  });
});
