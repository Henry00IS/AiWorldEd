/** SHA-256 round constants. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

/**
 * Hashes bytes with SHA-256 (Web Crypto where available, otherwise a plain
 * implementation, so insecure contexts get the same full digest).
 *
 * @param bytes Bytes.
 * @returns 64 lowercase hex digits.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return sha256HexSync(bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', new Uint8Array(bytes)));
  return sha256HexOf(digest);
}

/**
 * Hashes bytes with SHA-256 without Web Crypto.
 *
 * @param bytes Bytes.
 * @returns 64 lowercase hex digits.
 */
export function sha256HexSync(bytes: Uint8Array): string {
  const length = bytes.byteLength;
  const padded = new Uint8Array((((length + 9 + 63) >> 6) << 6) >>> 0);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(padded.length - 4, (length << 3) >>> 0, false);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) sha256Block(view, offset, words, hash);
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  hash.forEach((value, index) => outView.setUint32(index * 4, value, false));
  return sha256HexOf(out);
}

/**
 * Mixes one 64-byte block into the hash state.
 *
 * @param view Padded message.
 * @param offset Block start.
 * @param words Scratch message schedule.
 * @param hash State, updated in place.
 */
function sha256Block(view: DataView, offset: number, words: Uint32Array, hash: Uint32Array): void {
  for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false);
  for (let index = 16; index < 64; index++) {
    const w15 = words[index - 15]!;
    const w2 = words[index - 2]!;
    const s0 = sha256Rotate(w15, 7) ^ sha256Rotate(w15, 18) ^ (w15 >>> 3);
    const s1 = sha256Rotate(w2, 17) ^ sha256Rotate(w2, 19) ^ (w2 >>> 10);
    words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = [hash[0]!, hash[1]!, hash[2]!, hash[3]!, hash[4]!, hash[5]!, hash[6]!, hash[7]!];
  for (let index = 0; index < 64; index++) {
    const s1 = sha256Rotate(e, 6) ^ sha256Rotate(e, 11) ^ sha256Rotate(e, 25);
    const choice = (e & f) ^ (~e & g);
    const t1 = (h + s1 + choice + SHA256_K[index]! + words[index]!) >>> 0;
    const s0 = sha256Rotate(a, 2) ^ sha256Rotate(a, 13) ^ sha256Rotate(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + majority) >>> 0;
    [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
  }
  [a, b, c, d, e, f, g, h].forEach((value, index) => (hash[index] = (hash[index]! + value) >>> 0));
}

/**
 * Rotates a 32-bit word right.
 *
 * @param value Word.
 * @param bits Bits.
 * @returns Rotated word.
 */
function sha256Rotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Formats digest bytes as hex.
 *
 * @param digest Digest bytes.
 * @returns Lowercase hex.
 */
function sha256HexOf(digest: Uint8Array): string {
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}
