import { describe, it, expect } from 'vitest';
import { easeOutCubic } from '../../src/utils/easing.js';

describe('easeOutCubic', () => {
  it('should return 0 when input is 0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('should return 1 when input is 1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('should return a value between 0 and 1 for inputs in range', () => {
    const result = easeOutCubic(0.5);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('should produce smooth deceleration curve', () => {
    const t0 = easeOutCubic(0);
    const t1 = easeOutCubic(0.25);
    const t2 = easeOutCubic(0.5);
    const t3 = easeOutCubic(0.75);
    const t4 = easeOutCubic(1);
    const step1 = t1 - t0;
    const step2 = t2 - t1;
    const step3 = t3 - t2;
    const step4 = t4 - t3;
    expect(step1).toBeGreaterThan(step2);
    expect(step2).toBeGreaterThan(step3);
    expect(step3).toBeGreaterThan(step4);
  });

  it('should be monotonically increasing', () => {
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const t = i / 100;
      const value = easeOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
