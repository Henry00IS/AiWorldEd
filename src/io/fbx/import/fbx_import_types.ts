import type * as THREE from 'three';
import type { GlbImportImage, GlbImportTextureResolution } from '@/io/glb/import/glb_import_types.js';

/** One texture an FBX material uses as its diffuse (base color) map. */
export interface FbxImportTexture {
  /** Index of the texture in this import. */
  index: number;
  /** File-safe texture name without extension. */
  name: string;
  /** File paths the file names for the image (relative first), possibly empty. */
  references: string[];
  /** Image embedded in the file, or null when the image is an external file. */
  image: GlbImportImage | null;
}

/** Decides which texture id each texture of an FBX import gets. */
export interface FbxImportTextureResolver {
  /**
   * Resolves texture ids for the textures an FBX uses.
   *
   * @param textures Diffuse textures (may be empty).
   * @returns Texture id per texture index and an optional status note.
   */
  resolve(textures: readonly FbxImportTexture[]): Promise<GlbImportTextureResolution>;
}

/** Result of importing an FBX file. */
export interface FbxImportResult {
  /** Object to add under the world (a mesh or a group holding the hierarchy). */
  root: THREE.Object3D;
  /** Number of content meshes built. */
  importedMeshCount: number;
  /** Number of polygons read from the file. */
  importedPolygonCount: number;
  /** Status note from texture resolution, or null. */
  textureNote: string | null;
}
