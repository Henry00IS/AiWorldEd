import type { GlbImportTextureResolver } from '@/io/glb/import/glb_import_types.js';

/** One primitive of a fixture mesh. */
export interface GlbFixturePrimitive {
  positions: number[];
  uvs?: number[];
  indices?: number[];
  mode?: number;
  material?: number;
}

/** One node of a fixture file. */
export interface GlbFixtureNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

/** Content of a fixture file; images become buffer views, one texture each. */
export interface GlbFixtureSpec {
  nodes: GlbFixtureNode[];
  meshes: { name?: string; primitives: GlbFixturePrimitive[] }[];
  sceneNodes?: number[];
  materials?: { name?: string; image?: number }[];
  images?: { name?: string; bytes: Uint8Array }[];
}

/** Binary chunk under construction. */
interface GlbFixtureBinary {
  bytes: number[];
  bufferViews: { buffer: number; byteOffset: number; byteLength: number }[];
  accessors: Record<string, unknown>[];
}

/** Resolver giving image i the id "fixture/<name>.png". */
export const GLB_FIXTURE_RESOLVER: GlbImportTextureResolver = {
  resolve: async (images) => ({
    textureIdByImage: new Map(images.map((image) => [image.index, `fixture/${image.name}.png`])),
    note: images.length > 0 ? `${images.length} image(s)` : null,
  }),
};

/**
 * Builds a quad in the XY plane at a depth, with glTF UVs (v down).
 *
 * @param size Edge length.
 * @param z Depth.
 * @param material Material index.
 * @returns Primitive.
 */
export function glbFixtureQuad(size: number, z = 0, material?: number): GlbFixturePrimitive {
  return {
    positions: [0, 0, z, size, 0, z, size, size, z, 0, size, z],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    ...(material === undefined ? {} : { material }),
  };
}

/**
 * Appends bytes, padded to four bytes, as a buffer view.
 *
 * @param binary Binary chunk.
 * @param bytes Bytes.
 * @returns Buffer view index.
 */
function glbFixtureView(binary: GlbFixtureBinary, bytes: Uint8Array): number {
  const byteOffset = binary.bytes.length;
  binary.bytes.push(...bytes);
  while (binary.bytes.length % 4 !== 0) binary.bytes.push(0);
  binary.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  return binary.bufferViews.length - 1;
}

/**
 * Appends an accessor.
 *
 * @param binary Binary chunk.
 * @param values Values.
 * @param type Accessor type.
 * @param indices True for unsigned short indices.
 * @returns Accessor index.
 */
function glbFixtureAccessor(binary: GlbFixtureBinary, values: number[], type: string, indices = false): number {
  const array = indices ? new Uint16Array(values) : new Float32Array(values);
  const bufferView = glbFixtureView(binary, new Uint8Array(array.buffer));
  const width = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
  const accessor: Record<string, unknown> = {
    bufferView,
    componentType: indices ? 5123 : 5126,
    count: values.length / width,
    type,
  };
  if (type === 'VEC3') {
    const axes = [0, 1, 2].map((axis) => values.filter((_value, index) => index % 3 === axis));
    accessor['min'] = axes.map((axis) => Math.min(...axis));
    accessor['max'] = axes.map((axis) => Math.max(...axis));
  }
  binary.accessors.push(accessor);
  return binary.accessors.length - 1;
}

/**
 * Encodes a primitive's accessors.
 *
 * @param binary Binary chunk.
 * @param primitive Primitive.
 * @returns GlTF primitive.
 */
function glbFixturePrimitiveJson(binary: GlbFixtureBinary, primitive: GlbFixturePrimitive): Record<string, unknown> {
  const attributes: Record<string, number> = { POSITION: glbFixtureAccessor(binary, primitive.positions, 'VEC3') };
  if (primitive.uvs) attributes['TEXCOORD_0'] = glbFixtureAccessor(binary, primitive.uvs, 'VEC2');
  const json: Record<string, unknown> = { attributes };
  if (primitive.indices) json['indices'] = glbFixtureAccessor(binary, primitive.indices, 'SCALAR', true);
  if (primitive.mode !== undefined) json['mode'] = primitive.mode;
  if (primitive.material !== undefined) json['material'] = primitive.material;
  return json;
}

/**
 * Builds the glTF JSON of a fixture and fills its binary chunk.
 *
 * @param spec Fixture content.
 * @param binary Binary chunk.
 * @returns GlTF JSON.
 */
function glbFixtureJson(spec: GlbFixtureSpec, binary: GlbFixtureBinary): Record<string, unknown> {
  const meshes = spec.meshes.map((mesh) => ({
    ...(mesh.name === undefined ? {} : { name: mesh.name }),
    primitives: mesh.primitives.map((primitive) => glbFixturePrimitiveJson(binary, primitive)),
  }));
  const images = (spec.images ?? []).map((image) => ({
    ...(image.name === undefined ? {} : { name: image.name }),
    mimeType: 'image/png',
    bufferView: glbFixtureView(binary, image.bytes),
  }));
  const materials = (spec.materials ?? []).map((material) => ({
    ...(material.name === undefined ? {} : { name: material.name }),
    pbrMetallicRoughness: material.image === undefined ? {} : { baseColorTexture: { index: material.image } },
  }));
  const sceneNodes = spec.sceneNodes ?? [0];
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes: spec.nodes,
    meshes,
    ...(images.length > 0 ? { images, textures: images.map((_image, source) => ({ source })) } : {}),
    ...(materials.length > 0 ? { materials } : {}),
  };
}

/**
 * Encodes a fixture as a binary glTF file.
 *
 * @param spec Fixture content.
 * @returns GLB bytes.
 */
export function glbFixtureEncode(spec: GlbFixtureSpec): ArrayBuffer {
  const binary: GlbFixtureBinary = { bytes: [], bufferViews: [], accessors: [] };
  const json = glbFixtureJson(spec, binary);
  Object.assign(json, {
    buffers: [{ byteLength: binary.bytes.length }],
    bufferViews: binary.bufferViews,
    accessors: binary.accessors,
  });
  const jsonBytes = [...new TextEncoder().encode(JSON.stringify(json))];
  while (jsonBytes.length % 4 !== 0) jsonBytes.push(0x20);
  const total = 12 + 8 + jsonBytes.length + 8 + binary.bytes.length;
  const view = new DataView(new ArrayBuffer(total));
  [0x46546c67, 2, total, jsonBytes.length, 0x4e4f534a].forEach((value, index) =>
    view.setUint32(index * 4, value, true),
  );
  new Uint8Array(view.buffer).set(jsonBytes, 20);
  view.setUint32(20 + jsonBytes.length, binary.bytes.length, true);
  view.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  new Uint8Array(view.buffer).set(binary.bytes, 28 + jsonBytes.length);
  return view.buffer;
}
