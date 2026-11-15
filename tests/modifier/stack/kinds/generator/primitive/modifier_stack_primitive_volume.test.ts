import { describe, expect, it } from 'vitest';
import { primitivePieces, primitiveTotalVolume } from './primitive_fixture.js';

/**
 * Expects a measured volume to be within a relative tolerance of a target.
 *
 * @param actual Measured volume.
 * @param expected Analytic volume.
 * @param tolerance Allowed relative difference.
 */
function expectVolume(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(tolerance);
}

/**
 * Returns the measured volume of a generator's pieces, which never overlap.
 *
 * @param kind Generator kind.
 * @param size Box size.
 * @param parameters Parameter overrides.
 * @returns Summed piece volume.
 */
function volume(kind: string, size: [number, number, number], parameters: Record<string, unknown> = {}): number {
  return primitiveTotalVolume(primitivePieces(kind, size, parameters).pieces);
}

describe('primitive generator volumes', () => {
  it('match the round solids they approximate', () => {
    const fine = { sides: 64 };
    expectVolume(volume('cylinder', [2, 3, 2], fine), Math.PI * 3, 0.01);
    expectVolume(volume('cone', [2, 3, 2], fine), Math.PI, 0.01);
    expectVolume(volume('cone', [2, 3, 2], { ...fine, topRadius: 0.5 }), (Math.PI * 3 * (1 + 0.25 + 0.5)) / 3, 0.01);
    expectVolume(volume('sphere', [2, 2, 2], { ...fine, rings: 32 }), (4 / 3) * Math.PI, 0.01);
    expectVolume(volume('sphere', [2, 1, 2], { ...fine, rings: 32, coverage: 'dome' }), (2 / 3) * Math.PI, 0.01);
    expectVolume(volume('capsule', [2, 4, 2], { ...fine, capRings: 16 }), Math.PI * 2 + (4 / 3) * Math.PI, 0.01);
  });

  it('stretch with the box into ovals', () => {
    expectVolume(volume('cylinder', [2, 1, 4], { sides: 64 }), Math.PI * 2, 0.01);
    expectVolume(volume('sphere', [2, 2, 4], { sides: 64, rings: 32 }), (4 / 3) * Math.PI * 2, 0.01);
  });

  it('match a torus and a pipe, also partly swept', () => {
    const torus = 2 * Math.PI * Math.PI * 1.5 * 0.25;
    expectVolume(volume('torus', [4, 1, 4], { ringSides: 64, tubeSides: 32 }), torus, 0.02);
    expectVolume(volume('torus', [4, 1, 4], { ringSides: 64, tubeSides: 32, sweep: 90 }), torus / 4, 0.02);
    const pipe = Math.PI * (1 - 0.75 * 0.75) * 2;
    expectVolume(volume('pipe', [2, 2, 2], { sides: 64 }), pipe, 0.01);
    expectVolume(volume('pipe', [2, 2, 2], { sides: 64, sweep: 180 }), pipe / 2, 0.01);
  });

  it('keeps an oval pipe wall equally thick all the way around', () => {
    const { pieces } = primitivePieces('pipe', [2, 1, 4], { sides: 64, wallThickness: 0.2 });
    for (const piece of pieces) {
      const xs = piece.brush.vertices.map((vertex) => Math.abs(vertex.x));
      const zs = piece.brush.vertices.map((vertex) => Math.abs(vertex.z));
      const outerOnX = Math.max(...xs) > 0.999 && Math.min(...zs) < 0.2;
      if (outerOnX) expect(Math.min(...xs)).toBeCloseTo(0.8, 2);
    }
  });

  it('match flat solids exactly', () => {
    expect(volume('pyramid', [2, 3, 2])).toBeCloseTo(4, 6);
    expect(volume('pyramid', [2, 3, 2], { topSize: 0.5 })).toBeCloseTo((3 * (4 + 1 + 2)) / 3, 6);
    expect(volume('prism', [2, 1, 3])).toBeCloseTo(3, 6);
    expect(volume('prism', [2, 3, 1], { axis: 'y', sides: 4 })).toBeCloseTo(6, 6);
    expect(volume('hollowBox', [4, 3, 4], { wallThickness: 0.5 })).toBeCloseTo(48 - 3 * 3 * 2, 6);
    expect(volume('hollowBox', [4, 3, 4], { wallThickness: 0.5, openTop: true })).toBeCloseTo(48 - 3 * 3 * 2.5, 6);
    expect(volume('hollowBox', [1, 1, 1], { wallThickness: 2 })).toBeCloseTo(1, 6);
  });

  it('builds curved stairs from equal steps that never overlap, also as a spiral', () => {
    const steps = 8;
    const ring = (sweep: number) => (Math.PI * (1 - 0.25 * 0.25) * sweep) / 360 / steps;
    const filled = { steps, innerRadius: 0.25, stepDetail: 16, sides: 64 };
    const flight = (ring(180) * (8 * 9)) / 2 / steps;
    expectVolume(volume('curvedStairs', [2, 8, 2], { ...filled, sweep: 180 }), flight * 8, 0.01);
    const spiral = volume('curvedStairs', [2, 8, 2], { ...filled, sweep: 720 });
    const perTurn = steps / 2;
    const expected = Array.from({ length: steps }, (_, index) => ring(720) * Math.min(index + 1, perTurn)).reduce(
      (sum, value) => sum + value,
      0,
    );
    expectVolume(spiral, expected, 0.01);
    const floating = volume('curvedStairs', [2, 8, 2], {
      ...filled,
      sweep: 180,
      fillToFloor: false,
      stepThickness: 0.5,
    });
    expectVolume(floating, ring(180) * 0.5 * steps, 0.01);
  });
});
