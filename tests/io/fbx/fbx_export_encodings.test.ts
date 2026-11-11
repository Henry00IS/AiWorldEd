import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { FbxImportParserAscii } from '@/io/fbx/import/parse/fbx_import_parser_ascii.js';
import { FbxImportParserBinary } from '@/io/fbx/import/parse/fbx_import_parser_binary.js';
import type { FbxImportNode, FbxImportValue } from '@/io/fbx/import/parse/fbx_import_node.js';

/** Records only binary files carry (the SDK writes them only there). */
const BINARY_ONLY_RECORDS = new Set(['FileId', 'CreationTime', 'Creator']);

/**
 * Puts a parsed value in encoding-neutral form: object names as "Class::name",
 * 64-bit integers as numbers, arrays as plain arrays and booleans as 1/0.
 *
 * @param value Parsed value.
 * @returns Comparable value.
 */
function normalizeValue(value: FbxImportValue): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Float64Array) return Array.from(value);
  if (typeof value !== 'string') return value;
  if (value === 'Y' || value === 'N') return value === 'Y' ? 1 : 0;
  const separator = value.indexOf('\u0000\u0001');
  return separator < 0 ? value : `${value.slice(separator + 2)}::${value.slice(0, separator)}`;
}

/**
 * Converts parsed records into comparable plain objects.
 *
 * @param records Records.
 * @returns Plain tree.
 */
function normalize(records: readonly FbxImportNode[]): unknown[] {
  return records
    .filter((record) => !BINARY_ONLY_RECORDS.has(record.name))
    .map((record) => ({
      name: record.name,
      properties: record.properties.map(normalizeValue),
      children: normalize(record.children),
    }));
}

describe('FBX export encodings', () => {
  it('write the same records, values and full-precision numbers in binary and ASCII', () => {
    const world = new THREE.Group();
    const room = new THREE.Group();
    room.name = 'Room "North"';
    room.position.set(1 / 3, Math.PI, -2e-7);
    room.rotation.set(0.3, 0.5, 0.7);
    const map = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(90), 4, 4);
    map.name = 'C:\\art\\brick.png';
    const materials = [
      new THREE.MeshStandardMaterial({ name: 'Brick', map }),
      new THREE.MeshStandardMaterial({ name: 'Plain' }),
    ];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), materials);
    mesh.name = 'Crate';
    room.add(mesh);
    world.add(room);
    const exporter = new FbxExporter();
    const binary = new FbxImportParserBinary().parse(exporter.exportBinary(world));
    const ascii = new FbxImportParserAscii().parse(exporter.exportAscii(world));
    expect(binary.version).toBe(7400);
    expect(
      binary.records.filter((record) => BINARY_ONLY_RECORDS.has(record.name)).map((record) => record.name),
    ).toEqual(['FileId', 'CreationTime', 'Creator']);
    expect(normalize(ascii)).toEqual(normalize(binary.records));
    expect(JSON.stringify(normalize(ascii))).toContain('"Model::Room \\"North\\""');
  });
});
