import { describe, expect, it } from 'vitest';
import {
  compareUpdateVersions,
  isNewerUpdateVersion
} from '../../src/updater/update_version.js';

describe('update version comparison', () => {
  it('compares tagged releases without treating the leading v as significant', () => {
    expect(compareUpdateVersions('v1.4.0', '1.3.9')).toBeGreaterThan(0);
    expect(compareUpdateVersions('1.4.0', 'v1.4.0')).toBe(0);
  });

  it('recognizes a newer stable release and rejects equal or older releases', () => {
    expect(isNewerUpdateVersion('1.2.0', 'v1.3.0')).toBe(true);
    expect(isNewerUpdateVersion('1.3.0', 'v1.3.0')).toBe(false);
    expect(isNewerUpdateVersion('1.4.0', 'v1.3.0')).toBe(false);
  });

  it('orders a stable release after its prerelease', () => {
    expect(compareUpdateVersions('1.3.0-beta.1', '1.3.0')).toBeLessThan(0);
  });
});

