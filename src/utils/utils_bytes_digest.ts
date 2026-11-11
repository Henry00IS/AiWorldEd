/**
 * Hashes file bytes to a short content tag (SHA-256 prefix, or FNV-1a where Web
 * Crypto is unavailable).
 *
 * @param bytes File bytes.
 * @returns Hex tag.
 */
export async function bytesDigest(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return bytesDigestFnv(new Uint8Array(bytes));
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...digest.subarray(0, 12)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes bytes with 32-bit FNV-1a, prefixed with the length.
 *
 * @param bytes Bytes.
 * @returns Hex tag.
 */
function bytesDigestFnv(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of bytes) hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  return `${bytes.byteLength.toString(16)}-${hash.toString(16)}`;
}
