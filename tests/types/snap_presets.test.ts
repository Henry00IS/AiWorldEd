import { describe, it, expect } from 'vitest';
import { SNAP_PRESETS, cycleSnapInterval } from '../../src/types/snap_presets.js';

describe('SNAP_PRESETS', () => {
  it('should contain exactly 12 presets', () => {
    expect(SNAP_PRESETS.length).toBe(12);
  });

  it('should be sorted in ascending order', () => {
    for (let i = 1; i < SNAP_PRESETS.length; i++) {
      expect(SNAP_PRESETS[i]).toBeGreaterThan(SNAP_PRESETS[i - 1]);
    }
  });

  it('should start with 1/32', () => {
    expect(SNAP_PRESETS[0]).toBe(0.03125);
  });

  it('should end with 64', () => {
    expect(SNAP_PRESETS[SNAP_PRESETS.length - 1]).toBe(64.0);
  });

  it('should contain only power-of-two values', () => {
    const expected = [
      0.03125,
      0.0625,
      0.125,
      0.25,
      0.5,
      1.0,
      2.0,
      4.0,
      8.0,
      16.0,
      32.0,
      64.0
    ];
    expect(SNAP_PRESETS).toEqual(expected);
  });

  it('should double each step relative to the previous preset', () => {
    for (let i = 1; i < SNAP_PRESETS.length; i++) {
      expect(SNAP_PRESETS[i] / SNAP_PRESETS[i - 1]).toBeCloseTo(2, 10);
    }
  });
});

describe('cycleSnapInterval forward', () => {
  it('should advance from 1.0 to 2.0', () => {
    expect(cycleSnapInterval(1.0, 1)).toBe(2.0);
  });

  it('should advance from 0.03125 to 0.0625', () => {
    expect(cycleSnapInterval(0.03125, 1)).toBe(0.0625);
  });

  it('should advance from 0.25 to 0.5', () => {
    expect(cycleSnapInterval(0.25, 1)).toBe(0.5);
  });

  it('should advance from 16.0 to 32.0', () => {
    expect(cycleSnapInterval(16.0, 1)).toBe(32.0);
  });
});

describe('cycleSnapInterval backward', () => {
  it('should go back from 1.0 to 0.5', () => {
    expect(cycleSnapInterval(1.0, -1)).toBe(0.5);
  });

  it('should go back from 0.0625 to 0.03125', () => {
    expect(cycleSnapInterval(0.0625, -1)).toBe(0.03125);
  });

  it('should go back from 0.25 to 0.125', () => {
    expect(cycleSnapInterval(0.25, -1)).toBe(0.125);
  });

  it('should go back from 16.0 to 8.0', () => {
    expect(cycleSnapInterval(16.0, -1)).toBe(8.0);
  });
});

describe('cycleSnapInterval wrapping', () => {
  it('should wrap from last preset to first on forward cycle', () => {
    expect(cycleSnapInterval(64.0, 1)).toBe(0.03125);
  });

  it('should wrap from first preset to last on backward cycle', () => {
    expect(cycleSnapInterval(0.03125, -1)).toBe(64.0);
  });
});

describe('cycleSnapInterval multi-step', () => {
  it('should skip 3 presets forward from 1.0', () => {
    expect(cycleSnapInterval(1.0, 3)).toBe(8.0);
  });

  it('should skip 3 presets backward from 1.0', () => {
    expect(cycleSnapInterval(1.0, -3)).toBe(0.125);
  });

  it('should handle large positive steps with wrapping', () => {
    const result = cycleSnapInterval(1.0, 20);
    expect(SNAP_PRESETS).toContain(result);
  });

  it('should handle large negative steps with wrapping', () => {
    const result = cycleSnapInterval(1.0, -20);
    expect(SNAP_PRESETS).toContain(result);
  });

  it('should return the same value when step equals preset count', () => {
    expect(cycleSnapInterval(1.0, SNAP_PRESETS.length)).toBe(1.0);
  });
});

describe('cycleSnapInterval non-preset input', () => {
  it('should treat unknown value as index 0', () => {
    const result = cycleSnapInterval(99.0, 1);
    expect(result).toBe(SNAP_PRESETS[1]);
  });
});
