import type * as THREE from 'three';

/** One embedded image a GLB material uses as its base color. */
export interface GlbImportImage {
  /** Index in the glTF images array. */
  index: number;
  /** File-safe image name without extension. */
  name: string;
  /** Image MIME type ("image/png", "image/jpeg", ...). */
  mimeType: string;
  /** Encoded image bytes exactly as stored in the GLB. */
  bytes: Uint8Array;
}

/** Texture ids chosen for the embedded images of one import. */
export interface GlbImportTextureResolution {
  /** Texture id per glTF image index; missing images use the checker. */
  textureIdByImage: ReadonlyMap<number, string>;
  /** Status text describing what happened to the images, or null. */
  note: string | null;
}

/** Decides which texture id each embedded image of a GLB import gets. */
export interface GlbImportTextureResolver {
  /**
   * Resolves texture ids for the images a GLB uses.
   *
   * @param images Embedded base color images (may be empty).
   * @returns Texture ids per image and an optional status note.
   */
  resolve(images: readonly GlbImportImage[]): Promise<GlbImportTextureResolution>;
}

/** Result of importing a binary glTF file. */
export interface GlbImportResult {
  /** Object to add under the world (a mesh or a group holding the hierarchy). */
  root: THREE.Object3D;
  /** Number of content meshes built. */
  importedMeshCount: number;
  /** Number of triangles read from the file. */
  importedTriangleCount: number;
  /** Status note from texture resolution, or null. */
  textureNote: string | null;
}
