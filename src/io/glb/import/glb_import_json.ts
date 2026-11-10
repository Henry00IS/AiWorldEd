/** The parts of a glTF 2.0 JSON document the GLB importer reads. */
export interface GlbImportJson {
  scene?: number;
  scenes?: GlbImportJsonScene[];
  nodes?: GlbImportJsonNode[];
  meshes?: GlbImportJsonMesh[];
  materials?: GlbImportJsonMaterial[];
  textures?: GlbImportJsonTexture[];
  images?: GlbImportJsonImage[];
}

/** One glTF scene: its root node indices. */
export interface GlbImportJsonScene {
  name?: string;
  nodes?: number[];
}

/** One glTF node with either a matrix or translation, rotation and scale. */
export interface GlbImportJsonNode {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

/** One glTF mesh and its primitives. */
export interface GlbImportJsonMesh {
  name?: string;
  primitives: GlbImportJsonPrimitive[];
}

/** One glTF primitive: draw mode and material index. */
export interface GlbImportJsonPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

/** One glTF material: the base color texture reference. */
export interface GlbImportJsonMaterial {
  name?: string;
  pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
}

/** One glTF texture: its image source, possibly through an image extension. */
export interface GlbImportJsonTexture {
  name?: string;
  source?: number;
  extensions?: Record<string, { source?: number }>;
}

/** One glTF image: a buffer view or a data URI. */
export interface GlbImportJsonImage {
  name?: string;
  uri?: string;
  mimeType?: string;
  bufferView?: number;
}
