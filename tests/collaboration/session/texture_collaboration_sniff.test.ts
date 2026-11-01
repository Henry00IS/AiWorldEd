import { describe, expect, it } from 'vitest';
import {
  TEXTURE_COLLABORATION_DIMENSION_MAXIMUM,
  textureCollaborationSniff,
} from '@/collaboration/session/texture_collaboration_sniff.js';
import { pngHeaderCreate } from './texture_collaboration_fixture.js';

/**
 * Builds a JPEG start with an APP0 segment followed by a baseline frame header.
 *
 * @param width Image width.
 * @param height Image height.
 * @returns Header bytes.
 */
function jpegHeaderCreate(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(4 + 16 + 11);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08], 20);
  view.setUint16(25, height);
  view.setUint16(27, width);
  return bytes;
}

/**
 * Encodes ASCII text.
 *
 * @param text Text.
 * @returns Bytes.
 */
function asciiBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('textureCollaborationSniff', () => {
  it('detects raster images from their bytes and ignores claimed types', () => {
    expect(textureCollaborationSniff(pngHeaderCreate(64, 32))).toEqual({ mime: 'image/png', width: 64, height: 32 });
    expect(textureCollaborationSniff(jpegHeaderCreate(640, 480))).toEqual({
      mime: 'image/jpeg',
      width: 640,
      height: 480,
    });
    const gif = new Uint8Array([...asciiBytes('GIF89a'), 16, 0, 8, 0, 0, 0, 0]);
    expect(textureCollaborationSniff(gif)?.mime).toBe('image/gif');
  });

  it('rejects HTML, SVG, scripts, truncated and unknown files', () => {
    const hostile = ['<html><script>alert(1)</script>', '<svg onload="alert(1)"/>', 'alert(1)', ''];
    for (const text of hostile) expect(textureCollaborationSniff(asciiBytes(text))).toBeNull();
    expect(textureCollaborationSniff(pngHeaderCreate(64, 32).subarray(0, 20))).toBeNull();
    expect(textureCollaborationSniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBeNull();
  });

  it('rejects images larger than the dimension maximum or empty', () => {
    const limit = TEXTURE_COLLABORATION_DIMENSION_MAXIMUM;
    expect(textureCollaborationSniff(pngHeaderCreate(limit, limit))).not.toBeNull();
    expect(textureCollaborationSniff(pngHeaderCreate(limit + 1, 4))).toBeNull();
    expect(textureCollaborationSniff(jpegHeaderCreate(4, 60000))).toBeNull();
    expect(textureCollaborationSniff(pngHeaderCreate(0, 4))).toBeNull();
  });
});
