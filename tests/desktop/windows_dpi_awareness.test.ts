import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enableWindowsPerMonitorDpiAwareness } from '@/desktop/windows_dpi_awareness.js';

describe('Windows DPI awareness bootstrap', () => {
  it('exports a no-op-safe enable function for non-Windows hosts', async () => {
    await expect(enableWindowsPerMonitorDpiAwareness()).resolves.toBeUndefined();
  });

  it('enables per-monitor DPI awareness before the Electrobun window is created', () => {
    const bunEntry = readFileSync(resolve(process.cwd(), 'src/desktop/bun/index.ts'), 'utf8');
    expect(bunEntry).toContain('await enableWindowsPerMonitorDpiAwareness()');
    expect(bunEntry.indexOf('await enableWindowsPerMonitorDpiAwareness()')).toBeLessThan(
      bunEntry.indexOf("await import('electrobun/main')"),
    );
  });
});
