/** Binary units, each 1024 times the one before. */
const BYTES_FORMAT_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

/**
 * Formats a byte count in binary units (base 1024): B, KiB, MiB, GiB, TiB.
 * Whole bytes show no decimals; larger units show one (two below 10). A value
 * that would round up to 1024 of a unit is shown in the next unit.
 *
 * @param bytes Byte count.
 * @returns Text such as "512 B", "1.50 KiB", "12.3 MiB" or "2.00 GiB".
 */
export function bytesFormatBinary(bytes: number): string {
  if (!Number.isFinite(bytes)) return '–';
  const sign = bytes < 0 ? '-' : '';
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTES_FORMAT_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${sign}${Math.round(value)} B`;
  if (Number(value.toFixed(value < 10 ? 2 : 1)) >= 1024 && unit < BYTES_FORMAT_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${sign}${value.toFixed(value < 10 ? 2 : 1)} ${BYTES_FORMAT_UNITS[unit]}`;
}
