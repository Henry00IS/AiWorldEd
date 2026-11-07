import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  modifierStackStairsClipAbove,
  modifierStackStairsSlabProfile,
} from '@/modifier/stack/kinds/generator/modifier_stack_stairs_slab.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

const flight = { steps: 4, rise: 0.25, run: 0.5, length: 2 };

describe('sloped slab stairs', () => {
  it('is the default under-steps fill', () => {
    expect(modifierStackKindFind('stairs')?.normalizeParameters({})['fill']).toBe('slab');
  });

  it('keeps the first step on the floor and lifts later undersides along the pitch', () => {
    const first = modifierStackStairsSlabProfile(0, flight, 0.1, 0);
    expect(Math.min(...first.map((point) => point.y))).toBe(0);
    const third = modifierStackStairsSlabProfile(2, flight, 0.1, 0);
    const lowest = Math.min(...third.map((point) => point.y));
    expect(lowest).toBeGreaterThan(0.3);
    expect(Math.max(...third.map((point) => point.y))).toBeCloseTo(0.75);
  });

  it('keeps the top landing underside flat', () => {
    const landing = modifierStackStairsSlabProfile(1, { steps: 2, rise: 0.5, run: 0.5, length: 3 }, 0.1, 0);
    const bottom = landing.filter((point) => point.y < 0.9);
    expect(new Set(bottom.map((point) => point.y.toFixed(6))).size).toBe(1);
  });

  it('clips a square under a diagonal into a triangle', () => {
    const square = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)];
    expect(modifierStackStairsClipAbove(square, (x) => x)).toHaveLength(3);
  });

  it('builds convex steps for every climb direction', () => {
    for (const direction of ['+x', '-x', '+z', '-z']) {
      const fixture = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 5, direction } }], 4);
      const steps = fixture.compile().instances.slice(1);
      expect(steps).toHaveLength(5);
      steps.forEach(expectStackConvex);
    }
  });
});
