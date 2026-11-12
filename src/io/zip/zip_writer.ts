import { Zip, ZipDeflate, ZipPassThrough } from 'three/addons/libs/fflate.module.js';

/** Receives the bytes of a zip as they are produced, in order. */
export type ZipWriterSink = (chunk: Uint8Array) => Promise<void>;

/** Characters of a text encoded per piece by {@link ZipWriter.addText}. */
const ZIP_WRITER_TEXT_PIECE = 1 << 20;

/** Bytes of a blob read per piece by {@link ZipWriter.addBlob}. */
const ZIP_WRITER_BLOB_PIECE = 1 << 20;

/**
 * Writes a zip one entry after another straight into a sink (fflate's streaming
 * Zip, bundled with Three.js): only the piece being written is held in memory,
 * so files larger than memory stream through. Texts are deflated; blobs are
 * stored as they are (images are compressed already) and read piece by piece.
 */
export class ZipWriter {
  private readonly zip: Zip;
  private readonly pending: Uint8Array[] = [];
  private failure: Error | null = null;

  /**
   * Creates a writer.
   *
   * @param sink Receives the zip bytes.
   */
  constructor(private readonly sink: ZipWriterSink) {
    this.zip = new Zip((error, chunk) => {
      if (error !== null) this.failure = error;
      else this.pending.push(chunk);
    });
  }

  /**
   * Adds a deflated text entry (UTF-8).
   *
   * @param name Entry name.
   * @param text Text.
   */
  async addText(name: string, text: string): Promise<void> {
    const entry = new ZipDeflate(name, { level: 6 });
    this.zip.add(entry);
    const encoder = new TextEncoder();
    for (let start = 0; start < text.length;) {
      const end = zipWriterTextPieceEnd(text, start);
      entry.push(encoder.encode(text.slice(start, end)), end >= text.length);
      await this.drain();
      start = end;
    }
    if (text.length === 0) entry.push(new Uint8Array(0), true);
    await this.drain();
  }

  /**
   * Adds a stored entry, reading the blob piece by piece.
   *
   * @param name Entry name.
   * @param blob Contents.
   */
  async addBlob(name: string, blob: Blob): Promise<void> {
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    for (let start = 0; start < blob.size; start += ZIP_WRITER_BLOB_PIECE) {
      entry.push(new Uint8Array(await blob.slice(start, start + ZIP_WRITER_BLOB_PIECE).arrayBuffer()));
      await this.drain();
    }
    entry.push(new Uint8Array(0), true);
    await this.drain();
  }

  /** Writes the central directory: the zip is complete afterwards. */
  async close(): Promise<void> {
    this.zip.end();
    await this.drain();
  }

  /** Hands the produced bytes to the sink, in order. */
  private async drain(): Promise<void> {
    if (this.failure !== null) throw this.failure;
    for (let chunk = this.pending.shift(); chunk !== undefined; chunk = this.pending.shift()) await this.sink(chunk);
  }
}

/**
 * Returns where the text piece starting at an index ends, never between the two
 * halves of a surrogate pair.
 *
 * @param text Text.
 * @param start Piece start.
 * @returns Piece end (exclusive).
 */
function zipWriterTextPieceEnd(text: string, start: number): number {
  const end = Math.min(text.length, start + ZIP_WRITER_TEXT_PIECE);
  const last = text.charCodeAt(end - 1);
  return end < text.length && last >= 0xd800 && last <= 0xdbff ? end + 1 : end;
}
