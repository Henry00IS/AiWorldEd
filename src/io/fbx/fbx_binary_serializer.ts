import { zlibSync } from 'three/addons/libs/fflate.module.js';
import { FBX_EXPORT_CREATOR, FBX_EXPORT_VERSION } from './fbx_export_document.js';
import { fbxExportLeaf, fbxExportString, type FbxExportNode, type FbxExportValue } from './fbx_export_node.js';

/** "Kaydara FBX Binary \0" plus the two bytes every reader expects after it. */
const FBX_BINARY_MAGIC = 'Kaydara FBX Binary  \u0000\u001a\u0000';

/**
 * Footer id written after the root null record: a fixed value widely used by
 * FBX writers for compatibility.
 */
const FBX_BINARY_FOOTER_ID = [
  0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e,
];

/** Closing magic at the very end of every binary FBX file. */
const FBX_BINARY_FOOTER_MAGIC = [
  0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b,
];

/**
 * FileId and CreationTime: fixed values widely used by FBX writers for
 * compatibility. The Autodesk SDK checks the footer against this pair, and this
 * pair is known to pass.
 */
const FBX_BINARY_FILE_ID = new Uint8Array([
  0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1,
]);
const FBX_BINARY_CREATION_TIME = '1970-01-01 10:00:00:000';

/** Arrays whose raw data is larger than this many bytes are zlib-compressed. */
export const FBX_BINARY_COMPRESS_THRESHOLD = 128;

/**
 * Null record length for FBX 7.4 (three 32-bit header fields and a name
 * length).
 */
const FBX_BINARY_NULL_RECORD_LENGTH = 13;

/** Element byte size per array type code. */
const ARRAY_ELEMENT_SIZE: Record<string, number> = { f: 4, d: 8, l: 8, i: 4, b: 1 };

/**
 * Writes an FBX record tree as binary FBX 7.4: the Kaydara header, the
 * binary-only FileId, CreationTime and Creator records after FBXHeaderExtension
 * (the SDK writes them only in binary files), records with 32-bit end offsets,
 * null records closing nested lists, zlib-compressed arrays above 128 bytes,
 * and the footer (id, alignment padding, version, 120 zero bytes, magic).
 */
export class FbxBinarySerializer {
  /**
   * Serializes the top-level records.
   *
   * @param nodes Top-level records.
   * @returns File bytes.
   */
  serialize(nodes: readonly FbxExportNode[]): Uint8Array<ArrayBuffer> {
    const writer = new FbxBinaryWriter();
    writer.bytes(new TextEncoder().encode(FBX_BINARY_MAGIC));
    writer.uint32(FBX_EXPORT_VERSION);
    const records = withFileRecords(nodes);
    records.forEach((node, index) => this.writeNode(writer, node, index === records.length - 1));
    writer.zeros(FBX_BINARY_NULL_RECORD_LENGTH);
    writer.bytes(FBX_BINARY_FOOTER_ID);
    writer.zeros(4);
    writer.zeros(16 - (writer.length % 16));
    writer.uint32(FBX_EXPORT_VERSION);
    writer.zeros(120);
    writer.bytes(FBX_BINARY_FOOTER_MAGIC);
    return writer.result();
  }

  /**
   * Writes one record. Like the SDK, a record ends with a null record when it
   * has children, or when it has neither properties nor children and is not the
   * last of its siblings.
   *
   * @param writer Output.
   * @param node Record.
   * @param isLast True for the last sibling.
   */
  private writeNode(writer: FbxBinaryWriter, node: FbxExportNode, isLast: boolean): void {
    const name = new TextEncoder().encode(node.name);
    if (name.length > 255) throw new Error(`FBX record name too long: ${node.name}`);
    const headerAt = writer.length;
    writer.zeros(12);
    writer.bytes([name.length]);
    writer.bytes(name);
    const propertiesAt = writer.length;
    node.properties.forEach((value) => this.writeValue(writer, value));
    const propertiesLength = writer.length - propertiesAt;
    node.children.forEach((child, index) => this.writeNode(writer, child, index === node.children.length - 1));
    if (node.children.length > 0 || (node.properties.length === 0 && !isLast)) {
      writer.zeros(FBX_BINARY_NULL_RECORD_LENGTH);
    }
    writer.setUint32(headerAt, writer.length);
    writer.setUint32(headerAt + 4, node.properties.length);
    writer.setUint32(headerAt + 8, propertiesLength);
  }

  /**
   * Writes one typed property.
   *
   * @param writer Output.
   * @param value Value.
   */
  private writeValue(writer: FbxBinaryWriter, value: FbxExportValue): void {
    writer.bytes([value.type.charCodeAt(0)]);
    switch (value.type) {
      case 'C':
        writer.bytes([value.value ? 1 : 0]);
        return;
      case 'Y':
        writer.scalar(2, (view) => view.setInt16(0, value.value, true));
        return;
      case 'I':
        writer.scalar(4, (view) => view.setInt32(0, value.value, true));
        return;
      case 'L':
        writer.scalar(8, (view) => view.setBigInt64(0, BigInt(Math.trunc(value.value)), true));
        return;
      case 'F':
        writer.scalar(4, (view) => view.setFloat32(0, value.value, true));
        return;
      case 'D':
        writer.scalar(8, (view) => view.setFloat64(0, value.value, true));
        return;
      case 'S': {
        const text = value.objectClass === undefined ? value.value : `${value.value}\u0000\u0001${value.objectClass}`;
        this.writeSized(writer, new TextEncoder().encode(text));
        return;
      }
      case 'R':
        this.writeSized(writer, value.value);
        return;
      default:
        this.writeArray(writer, value.type, value.value);
    }
  }

  /**
   * Writes length-prefixed bytes.
   *
   * @param writer Output.
   * @param bytes Bytes.
   */
  private writeSized(writer: FbxBinaryWriter, bytes: Uint8Array): void {
    writer.uint32(bytes.length);
    writer.bytes(bytes);
  }

  /**
   * Writes an array: count, encoding (0 raw, 1 zlib), byte length, data.
   *
   * @param writer Output.
   * @param type Array type code.
   * @param values Elements.
   */
  private writeArray(
    writer: FbxBinaryWriter,
    type: 'f' | 'd' | 'l' | 'i' | 'b',
    values: readonly (number | boolean)[],
  ): void {
    const raw = encodeArray(type, values);
    const compress = raw.length > FBX_BINARY_COMPRESS_THRESHOLD;
    const data = compress ? zlibSync(raw) : raw;
    writer.uint32(values.length);
    writer.uint32(compress ? 1 : 0);
    writer.uint32(data.length);
    writer.bytes(data);
  }
}

/**
 * Inserts the binary-only file identity records after FBXHeaderExtension.
 *
 * @param nodes Top-level records.
 * @returns Records to write.
 */
function withFileRecords(nodes: readonly FbxExportNode[]): FbxExportNode[] {
  const fileRecords = [
    fbxExportLeaf('FileId', { type: 'R', value: FBX_BINARY_FILE_ID }),
    fbxExportLeaf('CreationTime', fbxExportString(FBX_BINARY_CREATION_TIME)),
    fbxExportLeaf('Creator', fbxExportString(FBX_EXPORT_CREATOR)),
  ];
  const header = nodes.findIndex((node) => node.name === 'FBXHeaderExtension');
  return [...nodes.slice(0, header + 1), ...fileRecords, ...nodes.slice(header + 1)];
}

/**
 * Packs array elements little-endian.
 *
 * @param type Array type code.
 * @param values Elements.
 * @returns Raw bytes.
 */
function encodeArray(type: 'f' | 'd' | 'l' | 'i' | 'b', values: readonly (number | boolean)[]): Uint8Array {
  const size = ARRAY_ELEMENT_SIZE[type] ?? 1;
  const bytes = new Uint8Array(values.length * size);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    const offset = index * size;
    const number = Number(value);
    if (type === 'f') view.setFloat32(offset, number, true);
    else if (type === 'd') view.setFloat64(offset, number, true);
    else if (type === 'l') view.setBigInt64(offset, BigInt(Math.trunc(number)), true);
    else if (type === 'i') view.setInt32(offset, number, true);
    else view.setUint8(offset, number ? 1 : 0);
  });
  return bytes;
}

/** Growable little-endian byte buffer with back-patching. */
class FbxBinaryWriter {
  private buffer = new Uint8Array(1 << 16);
  private view = new DataView(this.buffer.buffer);
  length = 0;

  /**
   * Appends bytes.
   *
   * @param bytes Bytes.
   */
  bytes(bytes: ArrayLike<number>): void {
    this.reserve(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  /**
   * Appends zero bytes.
   *
   * @param count Count.
   */
  zeros(count: number): void {
    this.reserve(count);
    this.buffer.fill(0, this.length, this.length + count);
    this.length += count;
  }

  /**
   * Appends an unsigned 32-bit integer.
   *
   * @param value Value.
   */
  uint32(value: number): void {
    this.scalar(4, (view) => view.setUint32(0, value, true));
  }

  /**
   * Appends a fixed-size scalar written through a view at offset 0.
   *
   * @param size Byte size.
   * @param write Writer.
   */
  scalar(size: number, write: (view: DataView) => void): void {
    this.reserve(size);
    write(new DataView(this.buffer.buffer, this.length, size));
    this.length += size;
  }

  /**
   * Overwrites an unsigned 32-bit integer.
   *
   * @param offset Byte offset.
   * @param value Value.
   */
  setUint32(offset: number, value: number): void {
    this.view.setUint32(offset, value, true);
  }

  /**
   * Returns the written bytes.
   *
   * @returns Bytes.
   */
  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }

  /**
   * Grows the buffer to fit more bytes.
   *
   * @param extra Bytes about to be written.
   */
  private reserve(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
    this.view = new DataView(grown.buffer);
  }
}
