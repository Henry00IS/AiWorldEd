import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FBX_BINARY_COMPRESS_THRESHOLD, FbxBinarySerializer } from '@/io/fbx/fbx_binary_serializer.js';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { fbxExportNode, type FbxExportNode } from '@/io/fbx/fbx_export_node.js';
import { FbxImportParserBinary } from '@/io/fbx/import/parse/fbx_import_parser_binary.js';
import { fbxImportDocumentParse } from '@/io/fbx/import/parse/fbx_import_document.js';
import { fbxImportObjectName } from '@/io/fbx/import/parse/fbx_import_node.js';

const MAGIC = 'Kaydara FBX Binary  \u0000\u001a\u0000';
const FOOTER_ID = [0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e];
const FOOTER_MAGIC = [0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b];

/**
 * Serializes records behind the FBXHeaderExtension the writer expects.
 *
 * @param nodes Records.
 * @returns File bytes.
 */
function serialize(...nodes: FbxExportNode[]): Uint8Array {
  return new FbxBinarySerializer().serialize([fbxExportNode('FBXHeaderExtension'), ...nodes]);
}

/**
 * Parses file bytes with the importer's binary parser.
 *
 * @param bytes File bytes.
 * @returns Version and top-level records.
 */
function parse(bytes: Uint8Array) {
  return new FbxImportParserBinary().parse(bytes);
}

/**
 * Finds the offset of a byte sequence.
 *
 * @param bytes Haystack.
 * @param needle Sequence.
 * @returns Offset, or -1.
 */
function indexOfBytes(bytes: Uint8Array, needle: readonly number[]): number {
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) if (bytes[offset + index] !== needle[index]) continue outer;
    return offset;
  }
  return -1;
}

describe('FbxBinarySerializer', () => {
  it('writes the Kaydara header with version 7400', () => {
    const bytes = serialize();
    expect(new TextDecoder().decode(bytes.slice(0, 23))).toBe(MAGIC);
    expect(new DataView(bytes.buffer).getUint32(23, true)).toBe(7400);
  });

  it('writes the standard footer: null record, id, padding, version, zeros, magic', () => {
    const bytes = serialize(fbxExportNode('Leaf', [{ type: 'I', value: 1 }]));
    const view = new DataView(bytes.buffer);
    const footerAt = indexOfBytes(bytes, FOOTER_ID);
    expect(bytes.slice(footerAt - 13, footerAt).every((byte) => byte === 0)).toBe(true);
    expect(bytes.slice(footerAt + 16, footerAt + 20).every((byte) => byte === 0)).toBe(true);
    const versionAt = bytes.length - 16 - 120 - 4;
    expect(versionAt % 16).toBe(0);
    expect(versionAt - (footerAt + 20)).toBeGreaterThanOrEqual(1);
    expect(versionAt - (footerAt + 20)).toBeLessThanOrEqual(16);
    expect(bytes.slice(footerAt + 20, versionAt).every((byte) => byte === 0)).toBe(true);
    expect(view.getUint32(versionAt, true)).toBe(7400);
    expect(bytes.slice(versionAt + 4, versionAt + 124).every((byte) => byte === 0)).toBe(true);
    expect([...bytes.slice(-16)]).toEqual(FOOTER_MAGIC);
  });

  it('adds FileId, CreationTime and Creator after FBXHeaderExtension', () => {
    const { records } = parse(serialize(fbxExportNode('Objects')));
    expect(records.map((record) => record.name)).toEqual([
      'FBXHeaderExtension',
      'FileId',
      'CreationTime',
      'Creator',
      'Objects',
    ]);
    expect([...(records[1]?.properties[0] as Uint8Array)].slice(0, 4)).toEqual([0x28, 0xb3, 0x2a, 0xeb]);
    expect(records[2]?.properties).toEqual(['1970-01-01 10:00:00:000']);
  });

  it('encodes every property type so the importer reads it back', () => {
    const node = fbxExportNode('Values', [
      { type: 'C', value: true },
      { type: 'Y', value: -1234 },
      { type: 'I', value: -123456789 },
      { type: 'L', value: 5_000_000_000 },
      { type: 'F', value: 1.5 },
      { type: 'D', value: Math.PI },
      { type: 'S', value: 'Wall "A" ü' },
      { type: 'S', value: 'Wall', objectClass: 'Model' },
      { type: 'R', value: new Uint8Array([0, 1, 254, 255]) },
    ]);
    const arrays = (['f', 'd', 'l', 'i'] as const).map((type) =>
      fbxExportNode(`Array_${type}`, [{ type, value: [-2, 0, 0.5 * Number(type !== 'l' && type !== 'i'), 3e6] }]),
    );
    const bools = fbxExportNode('Array_b', [{ type: 'b', value: [true, false, true] }]);
    const records = parse(serialize(node, ...arrays, bools)).records;
    const values = records.find((record) => record.name === 'Values')?.properties;
    expect(values).toEqual([
      1,
      -1234,
      -123456789,
      5_000_000_000n,
      1.5,
      Math.PI,
      'Wall "A" ü',
      'Wall\u0000\u0001Model',
      new Uint8Array([0, 1, 254, 255]),
    ]);
    for (const type of ['f', 'd', 'l', 'i']) {
      const half = type === 'l' || type === 'i' ? 0 : 0.5;
      expect([...(records.find((record) => record.name === `Array_${type}`)?.properties[0] as Float64Array)]).toEqual([
        -2,
        0,
        half,
        3e6,
      ]);
    }
    expect([...(records.find((record) => record.name === 'Array_b')?.properties[0] as Float64Array)]).toEqual([
      1, 0, 1,
    ]);
  });

  it('zlib-compresses arrays above 128 bytes and keeps small ones raw', () => {
    const small = Array.from({ length: FBX_BINARY_COMPRESS_THRESHOLD / 8 }, (_unused, index) => index);
    const large = Array.from({ length: 1000 }, (_unused, index) => index * 0.25);
    for (const [values, encoding] of [
      [small, 0],
      [large, 1],
    ] as const) {
      const bytes = serialize(fbxExportNode('Samples', [{ type: 'd', value: values }]));
      const view = new DataView(bytes.buffer);
      const typeAt = indexOfBytes(bytes, [...new TextEncoder().encode('Samples')]) + 7;
      expect(String.fromCharCode(bytes[typeAt] ?? 0)).toBe('d');
      expect([view.getUint32(typeAt + 1, true), view.getUint32(typeAt + 5, true)]).toEqual([values.length, encoding]);
      if (encoding === 1) expect(view.getUint32(typeAt + 9, true)).toBeLessThan(values.length * 8);
      const record = parse(bytes).records.find((each) => each.name === 'Samples');
      expect([...(record?.properties[0] as Float64Array)]).toEqual(values);
    }
  });

  it('closes nested lists with null records', () => {
    const tree = fbxExportNode(
      'Root',
      [],
      [
        fbxExportNode('Empty'),
        fbxExportNode('Leaf', [{ type: 'I', value: 7 }]),
        fbxExportNode('Parent', [{ type: 'S', value: 'p' }], [fbxExportNode('Child', [{ type: 'I', value: 1 }])]),
        fbxExportNode('LastEmpty'),
      ],
    );
    const bytes = serialize(tree);
    const view = new DataView(bytes.buffer);
    const recordEnds: Record<string, number> = {};
    const rootAt = indexOfBytes(bytes, [...new TextEncoder().encode('Root')]) - 13;
    let offset = rootAt + 13 + 4;
    for (const name of ['Empty', 'Leaf', 'Parent', 'Child']) {
      expect(new TextDecoder().decode(bytes.slice(offset + 13, offset + 13 + name.length))).toBe(name);
      recordEnds[name] = view.getUint32(offset, true);
      offset = name === 'Parent' ? offset + 13 + name.length + 6 : (recordEnds[name] ?? 0);
    }
    // "Empty" (no properties, not last) carries a null record; "Leaf" does not.
    expect(recordEnds['Empty']).toBe(rootAt + 17 + 13 + 5 + 13);
    expect(recordEnds['Leaf']).toBe((recordEnds['Empty'] ?? 0) + 13 + 4 + 5);
    // "Parent" ends after "Child" and its own null record.
    expect(recordEnds['Parent']).toBe((recordEnds['Child'] ?? 0) + 13);
    const root = parse(bytes).records.find((record) => record.name === 'Root');
    expect(root?.children.map((child) => child.name)).toEqual(['Empty', 'Leaf', 'Parent', 'LastEmpty']);
    expect(root?.child('Parent')?.childNumber('Child')).toBe(1);
  });

  it('writes exports the importer opens as FBX 7.4', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'Cube';
    world.add(mesh);
    const bytes = new FbxExporter().exportBinary(world);
    expect(parse(bytes).version).toBe(7400);
    const document = fbxImportDocumentParse(bytes);
    expect(document.objectsOfType('Model').map(({ node }) => fbxImportObjectName(node.properties[1]))).toContain(
      'Cube',
    );
    expect(['Geometry', 'Material'].map((type) => document.objectsOfType(type).length)).toEqual([1, 1]);
  });
});
