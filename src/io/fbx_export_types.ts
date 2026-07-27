/**
 * Package shape for Autodesk FBX ASCII export: one scene file plus optional
 * external diffuse map images referenced by RelativeFilename.
 */

/** One image written beside the .fbx (Unity-friendly external maps). */
export interface FbxExportTextureFile {
  /** Relative file name referenced from the FBX (no directories). */
  fileName: string;
  /** Encoded image bytes (typically PNG). */
  blob: Blob;
}

/** Complete FBX export result ready for multi-file save. */
export interface FbxExportPackage {
  /** Suggested primary .fbx file name. */
  fbxFileName: string;
  /** ASCII FBX 7.4 document text. */
  fbxText: string;
  /** Diffuse maps referenced by texture nodes. */
  textures: FbxExportTextureFile[];
}
