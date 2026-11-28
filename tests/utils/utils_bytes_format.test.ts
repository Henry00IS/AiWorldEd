import { describe, expect, it } from 'vitest';
import { bytesFormatBinary } from '@/utils/utils_bytes_format.js';

describe('bytesFormatBinary', () => {
  it('uses binary units with base 1024', () => {
    expect(bytesFormatBinary(0)).toBe('0 B');
    expect(bytesFormatBinary(1023)).toBe('1023 B');
    expect(bytesFormatBinary(1024)).toBe('1.00 KiB');
    expect(bytesFormatBinary(1536)).toBe('1.50 KiB');
    expect(bytesFormatBinary(12.34 * 1024 * 1024)).toBe('12.3 MiB');
    expect(bytesFormatBinary(2 * 1024 ** 3)).toBe('2.00 GiB');
    expect(bytesFormatBinary(5 * 1024 ** 4)).toBe('5.00 TiB');
    expect(bytesFormatBinary(3 * 1024 ** 5)).toBe('3072.0 TiB');
  });

  it('moves to the next unit instead of showing 1024.0', () => {
    expect(bytesFormatBinary(1024 * 1024 - 1)).toBe('1.00 MiB');
  });

  it('handles negative and non-finite values', () => {
    expect(bytesFormatBinary(-2048)).toBe('-2.00 KiB');
    expect(bytesFormatBinary(Number.NaN)).toBe('–');
  });
});
