import { describe, it } from 'vitest';
import { segmentFixture, segmentLayouts, verifySegmentLayout } from './modifier_bevel_uv_segments_fixture.js';

/** Segment-count boundaries include a flat chamfer and odd/even round profiles. */
const segmentCounts = [1, 2, 3, 4, 8, 16, 32];

describe('bevel projection segment matrix', () => {
  for (const segments of segmentCounts) {
    for (const distance of [0.02, 0.1, 0.25]) {
      for (const coverage of ['edge', 'partial', 'whole', 'posed']) {
        for (const owner of ['single', 'split'] as const) {
          it(`${segments} segments, ${distance} distance, ${coverage}, ${owner}`, () => {
            const fixture = segmentFixture(
              segments,
              distance,
              coverage === 'posed' ? 'whole' : coverage,
              owner,
              coverage === 'posed',
            );
            for (const layout of segmentLayouts) {
              for (const space of ['local', 'world'] as const) {
                fixture.derived.placement.uvSpace = space;
                for (const texture of ['', 'warning-stripes']) verifySegmentLayout(fixture, layout, texture);
              }
            }
          }, 30000);
        }
      }
    }
  }
});
