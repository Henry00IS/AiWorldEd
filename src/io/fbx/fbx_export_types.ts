/**
 * Package shape for Autodesk FBX export: one scene file plus the diffuse map
 * images it names by RelativeFilename (none when they are embedded).
 */

/**
 * FBX file encoding. Binary opens in every FBX reader; ASCII is readable text
 * for diffing and hand inspection.
 */
export type FbxExportEncoding = 'binary' | 'ascii';

/** One image file written beside the .fbx. */
export interface FbxExportTextureFile {
  /** Path relative to the .fbx, as the FBX names it. */
  fileName: string;
  /** Encoded image bytes (typically PNG). */
  blob: Blob;
}

/** Complete FBX export result ready for multi-file save. */
export interface FbxExportPackage {
  /** Suggested primary .fbx file name. */
  fbxFileName: string;
  /** Encoding of {@link fbxBytes}. */
  encoding: FbxExportEncoding;
  /** FBX 7.4 file contents. */
  fbxBytes: Uint8Array<ArrayBuffer>;
  /** Diffuse map files the texture nodes name. */
  textures: FbxExportTextureFile[];
}
