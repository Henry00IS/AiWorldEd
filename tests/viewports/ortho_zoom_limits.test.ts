import { describe, it, expect } from 'vitest';
import {
  MIN_ORTHO_HALF_EXTENT,
  MAX_ORTHO_HALF_EXTENT,
  clampOrthoZoomFactor,
  clampOrthoHalfExtent
} from '../../src/viewports/ortho_zoom_limits.js';

describe('ortho_zoom_limits', () => {
  it('should allow zoom factors that stay inside the safe range', () => {
    expect(clampOrthoZoomFactor(5, 1.1)).toBeCloseTo(1.1);
    expect(clampOrthoZoomFactor(5, 0.9)).toBeCloseTo(0.9);
  });

  it('should stop zoom-out at the maximum half-extent', () => {
    const nearMax = MAX_ORTHO_HALF_EXTENT / 1.05;
    const factor = clampOrthoZoomFactor(nearMax, 1.1);
    expect(nearMax * factor).toBeCloseTo(MAX_ORTHO_HALF_EXTENT);
    expect(factor).toBeLessThan(1.1);
  });

  it('should stop zoom-in at the minimum half-extent', () => {
    const nearMin = MIN_ORTHO_HALF_EXTENT * 1.05;
    const factor = clampOrthoZoomFactor(nearMin, 0.9);
    expect(nearMin * factor).toBeCloseTo(MIN_ORTHO_HALF_EXTENT);
    expect(factor).toBeGreaterThan(0.9);
  });

  it('should no-op when already at max zoom-out', () => {
    const factor = clampOrthoZoomFactor(MAX_ORTHO_HALF_EXTENT, 1.1);
    expect(factor).toBeCloseTo(1);
  });

  it('should no-op when already at max zoom-in', () => {
    const factor = clampOrthoZoomFactor(MIN_ORTHO_HALF_EXTENT, 0.9);
    expect(factor).toBeCloseTo(1);
  });

  it('should reject non-finite or non-positive inputs', () => {
    expect(clampOrthoZoomFactor(NaN, 1.1)).toBe(1);
    expect(clampOrthoZoomFactor(5, 0)).toBe(1);
    expect(clampOrthoZoomFactor(5, -2)).toBe(1);
    expect(clampOrthoZoomFactor(0, 1.1)).toBe(1);
  });

  it('should clamp half-extent values into the allowed band', () => {
    expect(clampOrthoHalfExtent(1e12)).toBe(MAX_ORTHO_HALF_EXTENT);
    expect(clampOrthoHalfExtent(1e-9)).toBe(MIN_ORTHO_HALF_EXTENT);
    expect(clampOrthoHalfExtent(12)).toBe(12);
    expect(clampOrthoHalfExtent(NaN)).toBe(MIN_ORTHO_HALF_EXTENT);
  });

  it('should allow very far but finite zoom-out before the hard cap', () => {
    const largeButSafe = 10_000;
    expect(clampOrthoZoomFactor(largeButSafe, 1.1)).toBeCloseTo(1.1);
    expect(largeButSafe * 1.1).toBeLessThan(MAX_ORTHO_HALF_EXTENT);
  });
});
