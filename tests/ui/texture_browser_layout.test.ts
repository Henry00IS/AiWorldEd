import { describe, it, expect } from 'vitest';
import {
  TEXTURE_BROWSER_MIN_THUMB_PX,
  TEXTURE_BROWSER_TILE_GAP_PX
} from '../../src/ui/texture_browser_layout.js';
import { TEXTURE_BROWSER_MIN_TRACK_PX } from '../../src/ui/texture_browser_styles.js';

describe('texture_browser_layout constants', () => {
  it('should keep min thumb and track sizes aligned for CSS auto-fill', () => {
    expect(TEXTURE_BROWSER_MIN_THUMB_PX).toBe(96);
    expect(TEXTURE_BROWSER_MIN_TRACK_PX).toBe(TEXTURE_BROWSER_MIN_THUMB_PX);
    expect(TEXTURE_BROWSER_TILE_GAP_PX).toBe(8);
  });
});
