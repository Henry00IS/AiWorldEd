import { describe, it, expect } from 'vitest';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelIsCap } from '@/modifier/bevel/modifier_bevel_cap_options.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { bevelOptionsFixture, bevelOptionsVerifyConvex } from './modifier_bevel_options_fixture.js';

/**
 * Trim edits must be coherent chart transforms, not independent per-face
 * adjustments.
 */
describe('bevel trim and corner controls', () => {
  for (const segments of [1, 4, 16, 32])
    it(`anchors and reverses the entire ${segments}-segment trim`, () => {
      const fixture = bevelOptionsFixture({}, segments);
      fixture.derived.layout = 'trim';
      const before = fixture.derived.faces.map((_, index) =>
        modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index),
      );
      fixture.derived.options = modifierBevelOptionsNormalize({ trimSeam: 0.25, trimDirection: 'reverse' });
      fixture.derived.faces.forEach((record, index) => {
        const after = modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index);
        const previous = before[index];
        if (!record.chamferEdge || !previous) return;
        expect(after.uv.u.toArray()).toEqual(previous.uv.u.clone().multiplyScalar(-1).toArray());
        expect(after.uv.v.w).toBeCloseTo(previous.uv.v.w - 0.25, 8);
      });
      for (const trimOrigin of ['center', 'end'] as const) verifyTrimOrigin(fixture, trimOrigin);
    });
  for (const segments of [2, 4, 16])
    for (const profile of [0.25, 0.375, 0.5])
      it(`makes convex planar patches at segments ${segments}, profile ${profile}`, () => {
        const fixture = bevelOptionsFixture(
          { corner: 'patch', profile, capProjection: 'axis', capTextureId: 'caps-photo' },
          segments,
          true,
        );
        bevelOptionsVerifyConvex(fixture.derived);
        if (profile > 0.25) {
          const simple = bevelOptionsFixture({ corner: 'simple', profile }, segments, true);
          const patches = (derived: typeof fixture.derived) =>
            derived.localBrush.planes.filter((plane) => plane.normal.toArray().every((value) => Math.abs(value) > 1e-4))
              .length;
          expect(patches(fixture.derived)).toBeGreaterThan(patches(simple.derived));
        }
        const caps = fixture.derived.faces
          .map((_, index) => index)
          .filter((index) => modifierBevelIsCap(fixture.derived, index));
        if (profile > 0.25) expect(caps.length).toBeGreaterThan(0);
        fixture.derived.textureId = 'warning-stripes';
        fixture.derived.faces.forEach((record, index) => {
          const surface = modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index);
          expect(surface.textureId).toBe(
            record.chamferEdge ? (caps.includes(index) ? 'caps-photo' : 'warning-stripes') : 'random-photo',
          );
          expect([...surface.uv.u.toArray(), ...surface.uv.v.toArray()].every(Number.isFinite)).toBe(true);
          if (caps.includes(index)) verifyCapProjection(fixture, index, surface.uv.u.toArray(), surface.uv.v.toArray());
        });
      });
});

/**
 * Tests edge-relative origins from actual girder coordinates.
 *
 * @param fixture Derived trim fixture.
 * @param origin Requested origin.
 */
function verifyTrimOrigin(fixture: ReturnType<typeof bevelOptionsFixture>, origin: 'center' | 'end'): void {
  fixture.derived.options = modifierBevelOptionsNormalize({ trimOrigin: origin });
  const index = fixture.derived.faces.findIndex((record) => Boolean(record.chamferEdge));
  const girder = fixture.derived.girders[fixture.derived.girderOfFace[index] ?? -1];
  if (!girder) throw new Error('Expected a strip chart');
  const uv = modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index).uv;
  const middle = girder.start.clone().lerp(girder.end, 0.5);
  if (origin === 'center') expect(uv.project(middle).u).toBeCloseTo(0, 8);
  else {
    const opposite =
      girder.start.distanceToSquared(girder.origin) > girder.end.distanceToSquared(girder.origin)
        ? girder.start
        : girder.end;
    expect(uv.project(opposite).u).toBeCloseTo(0, 8);
    expect(Math.abs(uv.project(girder.origin).u)).toBeCloseTo(girder.edgeMeters, 8);
  }
}

/**
 * Compares cap-only Axis against ordinary Axis with no cap override.
 *
 * @param fixture Derived patch fixture.
 * @param index Cap face.
 * @param u Actual U.
 * @param v Actual V.
 */
function verifyCapProjection(
  fixture: ReturnType<typeof bevelOptionsFixture>,
  index: number,
  u: number[],
  v: number[],
): void {
  const derived = { ...fixture.derived, layout: 'axis' as const, options: modifierBevelOptionsNormalize() };
  const expected = modifierBevelResolveDerivedSurface(fixture.instance, derived, index);
  expect(u).toEqual(expected.uv.u.toArray());
  expect(v).toEqual(expected.uv.v.toArray());
}
