import { describe, expect, it } from 'vitest';
import { segmentFixture, segmentLayouts, verifySegmentLayout } from './modifier_bevel_uv_segments_fixture.js';
import type { ModifierBevelUvFlow } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { boxAndVolume } from './modifier_bevel_uv_layout_fixture.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';

/**
 * Parent preferences include directional, area, border, and closest-face
 * policies.
 */
const flows: ModifierBevelUvFlow[] = [
  'winding',
  'winding-reversed',
  'largest',
  'smallest',
  'majority',
  'nearest',
  'aligned',
  'positive-x',
  'negative-x',
  'positive-y',
  'negative-y',
  'positive-z',
  'negative-z',
];

describe('bevel projection parent-flow matrix', () => {
  for (const segments of [1, 2, 4, 16, 32]) {
    for (const flow of flows) {
      for (const owner of ['single', 'split'] as const) {
        it(`${segments} segments, ${flow}, ${owner}`, () => {
          const fixture = segmentFixture(segments, 0.1, 'partial', owner, false, flow);
          for (const layout of segmentLayouts) {
            for (const texture of ['', 'warning-stripes']) verifySegmentLayout(fixture, layout, texture);
          }
        });
      }
    }
  }
});

describe('bevel angle threshold', () => {
  for (const angle of [0, 45, 89]) {
    it(`preserves every projection below the box edge angle (${angle} degrees)`, () => {
      const fixture = segmentFixture(8, 0.1, 'edge', 'single', false, 'winding', angle);
      for (const layout of segmentLayouts) verifySegmentLayout(fixture, layout, 'warning-stripes');
    });
  }
  for (const angle of [90, 120, 180]) {
    it(`keeps box edges square at or above their angle (${angle} degrees)`, () => {
      const { instance, volume } = boxAndVolume();
      ModifierVolumeBevel.writeAngleDegrees(volume, angle);
      expect(modifierBevelDeriveBrush(instance, [volume])).toBeNull();
    });
  }
});
