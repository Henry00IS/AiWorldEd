/**
 * Copies bytes into a new ArrayBuffer of the current realm, so loaders that
 * check `instanceof ArrayBuffer` accept buffers from other realms (tests,
 * workers, file readers).
 *
 * @param source Source buffer or typed array view.
 * @returns Fresh ArrayBuffer containing the same bytes.
 */
export function arrayBufferCopyToRealm(source: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const bytes =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
