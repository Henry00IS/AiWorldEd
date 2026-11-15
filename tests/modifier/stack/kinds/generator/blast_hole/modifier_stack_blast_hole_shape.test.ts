import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  blastHoleShape,
  type BlastHoleOutlineSettings,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_outline.js';
import {
  BLAST_HOLE_MIN_ANGLE,
  BLAST_HOLE_MIN_EDGE,
  BLAST_HOLE_MIN_THICKNESS,
  blastHolePolygonArea,
  blastHolePolygonContains,
  blastHolePolygonMinAngle,
  blastHolePolygonMinEdge,
  blastHolePolygonWidth,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_quality.js';
import { blastHoleBricks } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_bricks.js';

/** Default outline settings for a seed. */
function settings(seed: number, patch: Partial<BlastHoleOutlineSettings> = {}): BlastHoleOutlineSettings {
  return { seed, spikes: 9, spikeLength: 0.45, roughness: 0.5, detail: 1, ...patch };
}

/** Outline shapes swept by the bound tests: plain, extreme and tiny. */
const SWEEP: { patch: Partial<BlastHoleOutlineSettings>; half: [number, number] }[] = [
  { patch: {}, half: [1.5, 1.5] },
  { patch: { spikes: 24, spikeLength: 0.85, roughness: 1, detail: 3 }, half: [1.5, 1.5] },
  { patch: { spikes: 3, spikeLength: 0, roughness: 0 }, half: [1, 2] },
  { patch: { spikes: 24, spikeLength: 0.85, roughness: 1, detail: 3 }, half: [0.08, 0.08] },
  { patch: { spikes: 16, roughness: 1, detail: 2 }, half: [3, 0.3] },
];

describe('blast hole outline', () => {
  it('is the same for the same seed and differs between seeds', () => {
    const a = blastHoleShape(settings(7), 1.5, 1.5);
    const b = blastHoleShape(settings(7), 1.5, 1.5);
    const c = blastHoleShape(settings(8), 1.5, 1.5);
    expect(a).toEqual(b);
    expect(a?.outline).not.toEqual(c?.outline);
  });

  it('tiles the outline exactly with convex parts that do not overlap', () => {
    for (let seed = 0; seed < 40; seed++) {
      const shape = blastHoleShape(settings(seed, { detail: 2 }), 1.5, 1.2);
      if (!shape) throw new Error(`seed ${seed} gave no shape`);
      const total = shape.parts.reduce((sum, part) => sum + blastHolePolygonArea(part), 0);
      expect(total).toBeCloseTo(blastHolePolygonArea(shape.outline), 9);
      const outlineKeys = new Set(shape.outline.map((p) => `${p.x},${p.y}`));
      for (const part of shape.parts) {
        expect(blastHolePolygonArea(part)).toBeGreaterThan(0);
        for (const p of part) if (p.length() > 1e-12) expect(outlineKeys.has(`${p.x},${p.y}`)).toBe(true);
      }
      for (let i = 0; i < 400; i++) {
        const point = new THREE.Vector2(
          (((i % 20) + 0.37) / 20) * 3 - 1.5,
          ((Math.floor(i / 20) + 0.61) / 20) * 2.4 - 1.2,
        );
        const owners = shape.parts.filter((part) => blastHolePolygonContains(part, point)).length;
        expect(owners).toBe(blastHolePolygonContains(shape.outline, point) ? 1 : 0);
      }
    }
  });

  it('never makes a part thinner than 2 cm, an edge under 5 mm or a needle corner', () => {
    for (const { patch, half } of SWEEP) {
      for (let seed = 0; seed < 200; seed++) {
        const shape = blastHoleShape(settings(seed, patch), half[0], half[1]);
        if (!shape) throw new Error(`seed ${seed} gave no shape`);
        for (const part of shape.parts) {
          expect(blastHolePolygonWidth(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_THICKNESS - 1e-9);
          expect(blastHolePolygonMinEdge(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_EDGE - 1e-9);
          expect(blastHolePolygonMinAngle(part)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_ANGLE - 1e-9);
        }
      }
    }
  });
});

describe('blast hole bricks', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1.5, -1.5, -0.25), new THREE.Vector3(1.5, 1.5, 0.25));

  it('removes whole bricks on the running bond grid, some only at the front', () => {
    const shape = blastHoleShape(settings(3), 1.5, 1.5)!;
    const bricks = blastHoleBricks(shape.outline, box, {
      seed: 3,
      brickLength: 0.4,
      brickHeight: 0.2,
      bond: 'running',
      jut: 0.5,
    });
    expect(bricks.length).toBeGreaterThan(10);
    for (const brick of bricks) {
      const row = Math.round((brick.min.y - box.min.y) / 0.2);
      expect(brick.min.y - box.min.y).toBeCloseTo(row * 0.2, 9);
      const shift = row % 2 === 1 ? 0.2 : 0;
      const joint = (brick.min.x - box.min.x - shift) / 0.4;
      if (brick.min.x > box.min.x + 1e-9) expect(joint).toBeCloseTo(Math.round(joint), 9);
      expect(brick.max.z).toBeCloseTo(box.max.z, 12);
    }
    expect(bricks.some((brick) => brick.min.z > box.min.z + 1e-6)).toBe(true);
    expect(bricks.some((brick) => brick.min.z === box.min.z)).toBe(true);
  });

  it('keeps every brick at least 2 cm in every direction across seeds and sizes', () => {
    for (const [length, height] of [
      [0.4, 0.2],
      [0.23, 0.07],
      [0.05, 0.05],
      [1.3, 0.41],
    ] as const) {
      for (let seed = 0; seed < 60; seed++) {
        const shape = blastHoleShape(settings(seed, { roughness: 1 }), 1.5, 1.5)!;
        for (const brick of blastHoleBricks(shape.outline, box, {
          seed,
          brickLength: length,
          brickHeight: height,
          bond: 'third',
          jut: 1,
        })) {
          const size = brick.max.clone().sub(brick.min);
          expect(Math.min(size.x, size.y, size.z)).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_THICKNESS - 1e-9);
        }
      }
    }
  });
});
