import { describe, expect, it } from 'vitest';
import { timeRelativeText } from '@/utils/utils_time_relative.js';

describe('timeRelativeText', () => {
  const now = Date.UTC(2026, 10, 11, 12, 0, 0);
  const minute = 60_000;

  it('words moments under a minute ago, and future moments, as just now', () => {
    expect(timeRelativeText(now - 59_000, now)).toBe('just now');
    expect(timeRelativeText(now + 5 * minute, now)).toBe('just now');
  });

  it('counts whole minutes, hours and days', () => {
    expect(timeRelativeText(now - 5 * minute, now)).toBe('5 min ago');
    expect(timeRelativeText(now - 59 * minute, now)).toBe('59 min ago');
    expect(timeRelativeText(now - 3 * 60 * minute, now)).toBe('3 h ago');
    expect(timeRelativeText(now - 30 * 60 * minute, now)).toBe('yesterday');
    expect(timeRelativeText(now - 4 * 24 * 60 * minute, now)).toBe('4 days ago');
  });
});
