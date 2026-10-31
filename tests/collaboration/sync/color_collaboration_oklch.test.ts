import { describe, expect, it } from 'vitest';
import {
  colorCollaborationInGamut,
  colorCollaborationOklch,
  colorCollaborationOklchLinear,
  colorCollaborationPack,
} from '@/collaboration/sync/color_collaboration_oklch.js';

/** OKLCH to sRGB conversion and gamut mapping. */
describe('color_collaboration_oklch', () => {
  it('maps achromatic lightness to gray and the ends to black and white', () => {
    expect(colorCollaborationOklch(0, 0, 0)).toBe(0x000000);
    expect(colorCollaborationOklch(1, 0, 0)).toBe(0xffffff);
    const gray = colorCollaborationOklch(0.6, 0, 123);
    expect(gray >> 16).toBe(gray & 255);
  });

  it('matches known OKLCH references', () => {
    expect(colorCollaborationOklch(0.627955, 0.257683, 29.234)).toBe(0xff0000);
    expect(colorCollaborationOklch(0.452014, 0.313214, 264.052)).toBe(0x0000ff);
  });

  it('lowers chroma until out-of-gamut colors fit', () => {
    expect(colorCollaborationInGamut(colorCollaborationOklchLinear(0.84, 0.3, 264))).toBe(false);
    const mapped = colorCollaborationOklch(0.84, 0.3, 264);
    expect(mapped).toBeGreaterThan(0);
    expect((mapped & 255) > mapped >> 16).toBe(true);
  });

  it('packs and clamps linear channels', () => {
    expect(colorCollaborationPack([1, 0, 2])).toBe(0xff00ff);
    expect(colorCollaborationPack([-1, 0.5, 0])).toBe(0x00bc00);
  });
});
