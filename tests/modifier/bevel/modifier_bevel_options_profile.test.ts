import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { modifierBevelProfileSamples } from '@/modifier/bevel/modifier_bevel_round_planes.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { bevelOptionsFixture, bevelOptionsVerifyConvex } from './modifier_bevel_options_fixture.js';
import { segmentLayouts, verifySegmentLayout } from './modifier_bevel_uv_segments_fixture.js';

/**
 * New shape controls must preserve a closed convex solid and segment-stable
 * texture charts.
 */
describe('convex bevel profiles', () => {
  for (const profile of [0.25, 0.375, 0.5])
    for (const segments of [1, 2, 8, 32])
      for (const posed of [false, true])
        for (const owner of ['single', 'split'] as const) {
          it(`keeps profile ${profile}, segments ${segments}, posed ${posed}, owner ${owner} convex with all projections`, () => {
            const fixture = bevelOptionsFixture({ profile }, segments, posed, posed, owner);
            bevelOptionsVerifyConvex(fixture.derived);
            for (const layout of segmentLayouts)
              for (const texture of ['', 'warning-stripes']) verifySegmentLayout(fixture, layout, texture);
          }, 30000);
        }
  it('clamps shapes to the convex chamfer-to-round interval', () => {
    expect(modifierBevelOptionsNormalize({ profile: -1 }).profile).toBe(0.25);
    expect(modifierBevelOptionsNormalize({ profile: 1 }).profile).toBe(0.5);
    expect(modifierBevelOptionsNormalize({ profile: NaN }).profile).toBe(0.5);
  });
  it('interpolates between a straight chord and a circular arc with unchanged contacts', () => {
    const normalA = new Vector3(1, 0, 0),
      normalB = new Vector3(0, 1, 0),
      origin = new Vector3();
    const flat = modifierBevelProfileSamples(origin, normalA, normalB, 0.1, 8, 0.25);
    const round = modifierBevelProfileSamples(origin, normalA, normalB, 0.1, 8, 0.5);
    const blended = modifierBevelProfileSamples(origin, normalA, normalB, 0.1, 8, 0.375);
    flat.forEach((point, index) =>
      expect(blended[index]?.distanceTo(point.clone().lerp(round[index] ?? point, 0.5))).toBeLessThan(1e-10),
    );
    expect(flat[0]?.equals(round[0] ?? origin)).toBe(true);
    expect(flat[8]?.equals(round[8] ?? origin)).toBe(true);
  });
});
