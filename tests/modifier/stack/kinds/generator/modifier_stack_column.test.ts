import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC } from '@/curve/model/curve_preset_architecture.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Builds a column and returns its brushes.
 *
 * @param parameters Column parameters.
 * @param scale Volume size.
 * @returns Generated brushes.
 */
function column(parameters: Record<string, unknown>, scale = 1): SolidBrushInstance[] {
  return stackFixture([{ kind: 'column', parameters }], scale)
    .compile()
    .instances.slice(1);
}

/**
 * Returns sorted, rounded vertex keys of brushes for shape comparison.
 *
 * @param brushes Brushes.
 * @returns Keys per brush.
 */
function shapes(brushes: readonly SolidBrushInstance[]): string[][] {
  return brushes.map((brush) =>
    brush.brush.vertices
      .map((vertex) =>
        vertex
          .toArray()
          .map((value) => value.toFixed(5))
          .join(','),
      )
      .sort(),
  );
}

/**
 * Encodes a straight-segment profile.
 *
 * @param points Profile points.
 * @returns Encoded curve.
 */
function profile(points: readonly (readonly [number, number])[]): string {
  return curveEncode(curveFromPolyline(points));
}

describe('column profile', () => {
  it('starts new columns on the classic profile, also used when the profile is empty', () => {
    const kind = modifierStackKindFind('column');
    expect(kind?.createParameters()['profile']).toBe(curveEncode(curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC)));
    const classic = column({ profile: curveEncode(curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC)) });
    const empty = column({ profile: '' });
    expect(classic).toHaveLength(3);
    expect(shapes(classic)).toEqual(shapes(empty));
  });

  it('merges concave runs into convex brushes and splits where the slope rises', () => {
    const pieces = column({
      profile: profile([
        [0, 0.5],
        [0.25, 0.4],
        [0.5, 0.3],
        [0.75, 0.2],
        [1, 0.7],
      ]),
    });
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      expectStackConvex(piece);
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    }
  });

  it('makes square pillars, pyramids, and nothing for vertical steps or axis pieces', () => {
    const pillar = column({
      sides: '4',
      profile: profile([
        [0, 1],
        [1, 1],
      ]),
    });
    expect(pillar).toHaveLength(1);
    expect(pillar[0]?.brush.faces).toHaveLength(6);
    const pyramid = column({
      sides: '4',
      profile: profile([
        [0, 1],
        [1, 0],
      ]),
    });
    expect(pyramid[0]?.brush.vertices).toHaveLength(5);
    const stepped = column({
      profile: profile([
        [0, 0],
        [0.5, 0],
        [0.5, 1],
        [1, 1],
      ]),
    });
    expect(stepped).toHaveLength(1);
    const ground = new THREE.Box3().setFromPoints(stepped[0]?.brush.vertices ?? []);
    expect(ground.max.y - ground.min.y).toBeCloseTo(0.5, 5);
  });

  it('wraps the side texture around the column', () => {
    const [piece] = column({
      sides: '8',
      profile: profile([
        [0, 1],
        [1, 1],
      ]),
    });
    if (!piece) throw new Error('Expected a piece');
    const sides = piece.brush.planes
      .map((plane, index) => ({ plane, index }))
      .filter(({ plane }) => Math.abs(plane.normal.y) < 0.5);
    const offsets = sides.map(({ index }) => piece.getFaceSurface(index).uv.u.w);
    expect(new Set(offsets.map((value) => value.toFixed(4))).size).toBeGreaterThan(1);
  });

  it('rebuilds when only the profile changes', () => {
    const fixture = stackFixture(
      [
        {
          kind: 'column',
          parameters: {
            profile: profile([
              [0, 1],
              [1, 1],
            ]),
          },
        },
      ],
      1,
    );
    expect(fixture.compile().instances.slice(1)).toHaveLength(1);
    let stack = ModifierVolume.read(fixture.volume);
    const step = stack.modifiers[0]?.id ?? '';
    stack = modifierStackParameterSet(
      stack,
      step,
      'profile',
      profile([
        [0, 1],
        [0.5, 1],
        [0.5, 0.5],
        [1, 0.5],
      ]),
    );
    ModifierVolume.write(fixture.volume, stack);
    expect(fixture.compile().instances.slice(1)).toHaveLength(2);
  });

  it('shows the classic profile for an empty profile in the inspector', () => {
    const fixture = stackFixture([{ kind: 'column', parameters: { profile: '' } }], 1);
    const kind = modifierStackKindFind('column');
    const fallback = kind?.curveFallback('profile', kind.normalizeParameters({}), fixture.volume) ?? '';
    expect(fallback).toBe(curveEncode(curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC)));
  });
});
