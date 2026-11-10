import * as THREE from 'three';
import { GLTFLoader, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { arrayBufferCopyToRealm } from '@/utils/utils_array_buffer_realm.js';
import type { GlbImportJson } from './glb_import_json.js';

/** A parsed glTF document: its JSON and the loader parser that reads buffers. */
export interface GlbImportDocument {
  json: GlbImportJson;
  parser: GLTFParser;
}

/** Name of the loader plugin that keeps texture images from being decoded. */
const GLB_IMPORT_TEXTURE_SKIP_PLUGIN_NAME = 'AIWORLDED_glb_import_texture_skip';

/**
 * Parses binary glTF (and embedded-data glTF JSON) with the Three.js loader.
 * Texture images are never decoded (the loader receives an empty placeholder
 * texture): the importer reads their encoded bytes itself and the editor's
 * texture system displays them.
 */
export class GlbImportDocumentLoader {
  /**
   * Parses a document.
   *
   * @param data File bytes.
   * @returns Parsed document; rejects when the file is not valid glTF.
   */
  async load(data: ArrayBuffer | ArrayBufferView): Promise<GlbImportDocument> {
    const loader = new GLTFLoader();
    loader.register(() => ({
      name: GLB_IMPORT_TEXTURE_SKIP_PLUGIN_NAME,
      loadTexture: () => Promise.resolve(new THREE.Texture()),
    }));
    const gltf = await loader.parseAsync(arrayBufferCopyToRealm(data), '');
    return { json: gltf.parser.json as GlbImportJson, parser: gltf.parser };
  }
}
