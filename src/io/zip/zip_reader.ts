import { inflateSync } from 'three/addons/libs/fflate.module.js';

/** Signature of the end of central directory record. */
const ZIP_READER_END_SIGNATURE = 0x06054b50;
/** Signature of a central directory file header. */
const ZIP_READER_CENTRAL_SIGNATURE = 0x02014b50;
/** Signature of a local file header (also the first bytes of every zip). */
const ZIP_READER_LOCAL_SIGNATURE = 0x04034b50;
/** Size of the end record without its comment. */
const ZIP_READER_END_SIZE = 22;
/** Longest comment an end record may carry. */
const ZIP_READER_COMMENT_MAXIMUM = 0xffff;
/** Size of a local file header without name and extra field. */
const ZIP_READER_LOCAL_SIZE = 30;
/** Size of a central directory header without name, extra field and comment. */
const ZIP_READER_CENTRAL_SIZE = 46;

/** One file in a zip, as its central directory lists it. */
export interface ZipReaderEntry {
  name: string;
  /** 0: stored, 8: deflated. */
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

/**
 * Tells whether bytes start like a zip.
 *
 * @param head First bytes of a file (at least four).
 * @returns True for the local file header signature "PK\3\4".
 */
export function zipReaderSignatureIs(head: Uint8Array): boolean {
  return (
    head.length >= 4 && new DataView(head.buffer, head.byteOffset, 4).getUint32(0, true) === ZIP_READER_LOCAL_SIGNATURE
  );
}

/**
 * Reads a zip lazily from a Blob (a File from a picker or a project folder):
 * opening reads only the central directory at the end; an entry is read when
 * asked for. A stored entry is returned as a slice of the file without reading
 * it, so images stay on disk until something shows them.
 */
export class ZipReader {
  /**
   * Creates a reader of a directory already read.
   *
   * @param blob Zip file.
   * @param entries Its entries by name.
   */
  private constructor(
    private readonly blob: Blob,
    private readonly entries: ReadonlyMap<string, ZipReaderEntry>,
  ) {}

  /**
   * Reads the central directory of a zip.
   *
   * @param blob Zip file.
   * @returns Reader.
   */
  static async open(blob: Blob): Promise<ZipReader> {
    const end = await zipReaderEndFind(blob);
    const directory = await zipReaderBytes(blob, end.offset, end.offset + end.size);
    return new ZipReader(blob, zipReaderDirectoryParse(directory, end.count));
  }

  /**
   * Lists the entries.
   *
   * @returns Entries in directory order.
   */
  list(): ZipReaderEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Finds an entry by name.
   *
   * @param name Entry name.
   * @returns Entry, or null.
   */
  entry(name: string): ZipReaderEntry | null {
    return this.entries.get(name) ?? null;
  }

  /**
   * Returns an entry's contents: a lazy slice for a stored entry, the inflated
   * bytes for a deflated one.
   *
   * @param entry Entry.
   * @returns Contents.
   */
  async read(entry: ZipReaderEntry): Promise<Blob> {
    const header = new DataView(
      (await zipReaderBytes(this.blob, entry.localOffset, entry.localOffset + ZIP_READER_LOCAL_SIZE)).buffer,
    );
    if (header.getUint32(0, true) !== ZIP_READER_LOCAL_SIGNATURE) throw new Error(`${entry.name} is damaged`);
    const start = entry.localOffset + ZIP_READER_LOCAL_SIZE + header.getUint16(26, true) + header.getUint16(28, true);
    const data = this.blob.slice(start, start + entry.compressedSize);
    if (data.size !== entry.compressedSize) throw new Error(`${entry.name} is cut off`);
    if (entry.method === 0) return data;
    if (entry.method !== 8) throw new Error(`${entry.name} uses an unsupported compression`);
    return new Blob([new Uint8Array(inflateSync(new Uint8Array(await data.arrayBuffer())))]);
  }
}

/**
 * Reads a byte range of a blob.
 *
 * @param blob Blob.
 * @param start First byte.
 * @param end End (exclusive).
 * @returns Bytes.
 */
async function zipReaderBytes(blob: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  if (start < 0 || end > blob.size || end < start) throw new Error('The zip is damaged');
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/**
 * Finds the end of central directory record in the last bytes of a zip.
 *
 * @param blob Zip file.
 * @returns Entry count and the directory's offset and size.
 */
async function zipReaderEndFind(blob: Blob): Promise<{ count: number; offset: number; size: number }> {
  const tailStart = Math.max(0, blob.size - ZIP_READER_END_SIZE - ZIP_READER_COMMENT_MAXIMUM);
  const tail = await zipReaderBytes(blob, tailStart, blob.size);
  const view = new DataView(tail.buffer);
  for (let at = tail.length - ZIP_READER_END_SIZE; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== ZIP_READER_END_SIGNATURE) continue;
    return {
      count: view.getUint16(at + 10, true),
      size: view.getUint32(at + 12, true),
      offset: view.getUint32(at + 16, true),
    };
  }
  throw new Error('Not a zip file (no central directory)');
}

/**
 * Parses the central directory.
 *
 * @param directory Its bytes.
 * @param count Number of entries.
 * @returns Entries by name.
 */
function zipReaderDirectoryParse(directory: Uint8Array<ArrayBuffer>, count: number): Map<string, ZipReaderEntry> {
  const entries = new Map<string, ZipReaderEntry>();
  for (let index = 0, at = 0; index < count; index += 1) {
    const parsed = zipReaderEntryParse(directory, at);
    entries.set(parsed.entry.name, parsed.entry);
    at = parsed.next;
  }
  return entries;
}

/**
 * Parses one central directory header.
 *
 * @param directory Directory bytes.
 * @param at Offset of the header.
 * @returns Entry and the offset of the next header.
 */
function zipReaderEntryParse(directory: Uint8Array<ArrayBuffer>, at: number): { entry: ZipReaderEntry; next: number } {
  const view = new DataView(directory.buffer);
  if (at + ZIP_READER_CENTRAL_SIZE > directory.length || view.getUint32(at, true) !== ZIP_READER_CENTRAL_SIGNATURE)
    throw new Error('The zip directory is damaged');
  const nameLength = view.getUint16(at + 28, true);
  const nameStart = at + ZIP_READER_CENTRAL_SIZE;
  const entry: ZipReaderEntry = {
    name: new TextDecoder().decode(directory.subarray(nameStart, nameStart + nameLength)),
    method: view.getUint16(at + 10, true),
    compressedSize: view.getUint32(at + 20, true),
    size: view.getUint32(at + 24, true),
    localOffset: view.getUint32(at + 42, true),
  };
  return { entry, next: nameStart + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true) };
}
