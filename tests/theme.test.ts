import { describe, it, expect } from 'vitest';
import { Theme } from '../src/theme.js';

describe('Theme', () => {
  it('should freeze theme tokens against mutation', () => {
    expect(Object.isFrozen(Theme)).toBe(true);
    expect(() => {
      (Theme as { selectionColor: number }).selectionColor = 0x000000;
    }).toThrow();
  });

  it('should expose the orange selection accent used by the editor', () => {
    expect(Theme.selectionColor).toBe(0xe86a17);
  });

  it('should expose a yellow clip marker color distinct from selection orange', () => {
    expect(Theme.clipMarkerColor).toBe(0xffdd22);
    expect(Theme.clipMarkerColor).not.toBe(Theme.selectionColor);
  });
});


