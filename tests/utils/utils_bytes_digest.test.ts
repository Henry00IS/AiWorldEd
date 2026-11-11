import { describe, expect, it } from 'vitest';
import { bytesDigest } from '@/utils/utils_bytes_digest.js';

describe('bytesDigest', () => {
  it('tags different content differently and equal content equally', async () => {
    const a = await bytesDigest(new Uint8Array([1, 2, 3]).buffer);
    const b = await bytesDigest(new Uint8Array([1, 2, 4]).buffer);
    expect(a).not.toBe(b);
    expect(await bytesDigest(new Uint8Array([1, 2, 3]).buffer)).toBe(a);
  });
});
