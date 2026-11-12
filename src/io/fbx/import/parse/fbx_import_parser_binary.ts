import { unzlibSync } from 'three/addons/libs/fflate.module.js';
import { FbxImportBinaryReader } from './fbx_import_binary_reader.js';
import { FbxImportNode, type FbxImportValue } from './fbx_import_node.js';

/** Magic bytes at the start of every binary FBX file. */
const FBX_IMPORT_BINARY_MAGIC = 'Kaydara FBX Binary  \u0000';

/** Byte offset of the first record (after magic, two bytes and version). */
const FBX_IMPORT_BINARY_FIRST_RECORD_OFFSET = 27;

/** First file version whose record headers use 64-bit offsets. */
const FBX_IMPORT_BINARY_WIDE_HEADER_VERSION = 7500;

/** Header fields of one binary record. */
interface FbxImportBinaryRecordHeader {
  endOffset: number;
  propertyCount: number;
  name: string;
}

/**
 * Tells whether bytes start like a binary FBX file.
 *
 * @param bytes File bytes.
 * @returns True for binary FBX.
 */
export function fbxImportBinaryDetect(bytes: Uint8Array): boolean {
  if (bytes.byteLength < FBX_IMPORT_BINARY_FIRST_RECORD_OFFSET) return false;
  for (let index = 0; index < FBX_IMPORT_BINARY_MAGIC.length; index++) {
    if (bytes[index] !== FBX_IMPORT_BINARY_MAGIC.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Parses binary FBX (all 7.x versions, 32 and 64-bit record headers,
 * zlib-compressed arrays) into a record tree.
 */
export class FbxImportParserBinary {
  private wideHeaders = false;

  /**
   * Parses a file.
   *
   * @param bytes File bytes.
   * @returns File version and top-level records.
   */
  parse(bytes: Uint8Array): { version: number; records: FbxImportNode[] } {
    const reader = new FbxImportBinaryReader(bytes);
    reader.seek(FBX_IMPORT_BINARY_FIRST_RECORD_OFFSET - 4);
    const version = reader.uint32();
    this.wideHeaders = version >= FBX_IMPORT_BINARY_WIDE_HEADER_VERSION;
    return { version, records: this.recordListRead(reader, reader.length()) };
  }

  /**
   * Reads records until a null record or the end offset.
   *
   * @param reader Reader at the first record.
   * @param endOffset Offset the list may not pass.
   * @returns Records.
   */
  private recordListRead(reader: FbxImportBinaryReader, endOffset: number): FbxImportNode[] {
    const records: FbxImportNode[] = [];
    while (reader.offset() < endOffset) {
      const record = this.recordRead(reader);
      if (record === null) break;
      records.push(record);
    }
    return records;
  }

  /**
   * Reads one record and its nested records.
   *
   * @param reader Reader at the record header.
   * @returns Record, or null for the null record that ends a list.
   */
  private recordRead(reader: FbxImportBinaryReader): FbxImportNode | null {
    const header = this.recordHeaderRead(reader);
    if (header === null) return null;
    const properties: FbxImportValue[] = [];
    for (let index = 0; index < header.propertyCount; index++) properties.push(this.propertyRead(reader));
    const children = this.recordListRead(reader, header.endOffset);
    reader.seek(header.endOffset);
    return new FbxImportNode(header.name, properties, children);
  }

  /**
   * Reads a record header.
   *
   * @param reader Reader at the header.
   * @returns Header, or null for a null record.
   */
  private recordHeaderRead(reader: FbxImportBinaryReader): FbxImportBinaryRecordHeader | null {
    const endOffset = this.wideHeaders ? reader.uint64() : reader.uint32();
    const propertyCount = this.wideHeaders ? reader.uint64() : reader.uint32();
    if (this.wideHeaders) reader.uint64();
    else reader.uint32();
    const name = reader.text(reader.uint8());
    if (endOffset === 0) return null;
    if (endOffset > reader.length()) throw new Error('FBX file is truncated or damaged');
    return { endOffset, propertyCount, name };
  }

  /**
   * Reads one typed property value.
   *
   * @param reader Reader at the type code.
   * @returns Value.
   */
  private propertyRead(reader: FbxImportBinaryReader): FbxImportValue {
    const typeCode = String.fromCharCode(reader.uint8());
    const scalar = fbxImportBinaryScalarRead(reader, typeCode);
    if (scalar !== null) return scalar;
    if (typeCode === 'S') return reader.text(reader.uint32());
    if (typeCode === 'R') return reader.raw(reader.uint32()).slice();
    return fbxImportBinaryArrayRead(reader, typeCode);
  }
}

/**
 * Reads a scalar property value.
 *
 * @param reader Reader after the type code.
 * @param typeCode Type code.
 * @returns Value, or null when the type is not a scalar.
 */
function fbxImportBinaryScalarRead(reader: FbxImportBinaryReader, typeCode: string): FbxImportValue | null {
  switch (typeCode) {
    case 'Y':
      return reader.int16();
    case 'C':
      return reader.uint8();
    case 'I':
      return reader.int32();
    case 'F':
      return reader.float32();
    case 'D':
      return reader.float64();
    case 'L':
      return reader.int64();
    default:
      return null;
  }
}

/** Element size in bytes per array type code. */
const FBX_IMPORT_BINARY_ARRAY_ELEMENT_SIZE: Readonly<Record<string, number>> = { f: 4, d: 8, l: 8, i: 4, b: 1 };

/**
 * Reads an array property (raw or zlib-compressed) as float64 values.
 *
 * @param reader Reader after the type code.
 * @param typeCode Array type code.
 * @returns Values.
 */
function fbxImportBinaryArrayRead(reader: FbxImportBinaryReader, typeCode: string): Float64Array {
  const elementSize = FBX_IMPORT_BINARY_ARRAY_ELEMENT_SIZE[typeCode];
  if (elementSize === undefined) throw new Error(`FBX file has an unknown property type "${typeCode}"`);
  const count = reader.uint32();
  const encoding = reader.uint32();
  const stored = reader.raw(reader.uint32());
  const bytes = encoding === 1 ? unzlibSync(stored) : stored;
  if (bytes.byteLength < count * elementSize) throw new Error('FBX file is truncated or damaged');
  return fbxImportBinaryArrayDecode(bytes, typeCode, count);
}

/**
 * Decodes little-endian array elements.
 *
 * @param bytes Uncompressed element bytes.
 * @param typeCode Array type code.
 * @param count Element count.
 * @returns Values.
 */
function fbxImportBinaryArrayDecode(bytes: Uint8Array, typeCode: string, count: number): Float64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float64Array(count);
  const read = fbxImportBinaryArrayElementReader(view, typeCode);
  for (let index = 0; index < count; index++) values[index] = read(index);
  return values;
}

/**
 * Returns a function reading one array element.
 *
 * @param view Element bytes.
 * @param typeCode Array type code.
 * @returns Element reader by index.
 */
function fbxImportBinaryArrayElementReader(view: DataView, typeCode: string): (index: number) => number {
  switch (typeCode) {
    case 'f':
      return (index) => view.getFloat32(index * 4, true);
    case 'd':
      return (index) => view.getFloat64(index * 8, true);
    case 'l':
      return (index) => Number(view.getBigInt64(index * 8, true));
    case 'i':
      return (index) => view.getInt32(index * 4, true);
    default:
      return (index) => view.getUint8(index);
  }
}
