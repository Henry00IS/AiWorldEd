/** Little-endian cursor over the bytes of a binary FBX file. */
export class FbxImportBinaryReader {
  private readonly view: DataView;
  private readonly textDecoder = new TextDecoder();
  private position = 0;

  /**
   * Creates a reader.
   *
   * @param bytes File bytes.
   */
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  /**
   * Returns the read position.
   *
   * @returns Byte offset.
   */
  offset(): number {
    return this.position;
  }

  /**
   * Moves the read position.
   *
   * @param offset Byte offset.
   */
  seek(offset: number): void {
    if (!(offset >= 0 && offset <= this.bytes.byteLength)) throw new Error('FBX file is truncated or damaged');
    this.position = offset;
  }

  /**
   * Returns the number of bytes in the file.
   *
   * @returns Byte length.
   */
  length(): number {
    return this.bytes.byteLength;
  }

  /**
   * Reads an unsigned 8-bit integer.
   *
   * @returns Value.
   */
  uint8(): number {
    this.fitCheck(1);
    return this.view.getUint8(this.position++);
  }

  /**
   * Reads a signed 16-bit integer.
   *
   * @returns Value.
   */
  int16(): number {
    return this.advance(2, this.view.getInt16(this.fitted(2), true));
  }

  /**
   * Reads a signed 32-bit integer.
   *
   * @returns Value.
   */
  int32(): number {
    return this.advance(4, this.view.getInt32(this.fitted(4), true));
  }

  /**
   * Reads an unsigned 32-bit integer.
   *
   * @returns Value.
   */
  uint32(): number {
    return this.advance(4, this.view.getUint32(this.fitted(4), true));
  }

  /**
   * Reads an unsigned 64-bit integer as a number (offsets and counts).
   *
   * @returns Value.
   */
  uint64(): number {
    return Number(this.advance(8, this.view.getBigUint64(this.fitted(8), true)));
  }

  /**
   * Reads a signed 64-bit integer exactly.
   *
   * @returns Value.
   */
  int64(): bigint {
    return this.advance(8, this.view.getBigInt64(this.fitted(8), true));
  }

  /**
   * Reads a 32-bit float.
   *
   * @returns Value.
   */
  float32(): number {
    return this.advance(4, this.view.getFloat32(this.fitted(4), true));
  }

  /**
   * Reads a 64-bit float.
   *
   * @returns Value.
   */
  float64(): number {
    return this.advance(8, this.view.getFloat64(this.fitted(8), true));
  }

  /**
   * Reads raw bytes (a view into the file, not a copy).
   *
   * @param length Byte count.
   * @returns Bytes.
   */
  raw(length: number): Uint8Array {
    const start = this.fitted(length);
    this.position += length;
    return this.bytes.subarray(start, start + length);
  }

  /**
   * Reads UTF-8 text.
   *
   * @param length Byte count.
   * @returns Text.
   */
  text(length: number): string {
    return this.textDecoder.decode(this.raw(length));
  }

  /**
   * Checks that a read fits and returns the read position.
   *
   * @param length Byte count about to be read.
   * @returns Read position.
   */
  private fitted(length: number): number {
    this.fitCheck(length);
    return this.position;
  }

  /**
   * Moves past a value that was read.
   *
   * @param length Byte count read.
   * @param value Value read.
   * @returns The value.
   */
  private advance<T>(length: number, value: T): T {
    this.position += length;
    return value;
  }

  /**
   * Rejects reads past the end of the file.
   *
   * @param length Byte count about to be read.
   */
  private fitCheck(length: number): void {
    const end = this.position + length;
    if (length < 0 || end > this.bytes.byteLength || !Number.isFinite(end)) {
      throw new Error('FBX file is truncated or damaged');
    }
  }
}
