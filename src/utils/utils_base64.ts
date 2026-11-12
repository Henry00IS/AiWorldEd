/**
 * Encodes bytes as base64 in chunks (no call-stack limits for big payloads).
 *
 * @param bytes Bytes to encode.
 * @returns Base64 text.
 */
export function base64BytesEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/**
 * Decodes base64 text into bytes.
 *
 * @param base64 Base64 text.
 * @returns Decoded bytes.
 */
export function base64BytesDecode(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
