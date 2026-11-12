/**
 * Wavefront OBJ export package: geometry text and, when materials are written,
 * the material library text and the diffuse map files it names by map_Kd.
 */

/** One image file written beside the .obj / .mtl pair. */
export interface ObjExportTextureFile {
  /** Path relative to the .mtl, as it names it. */
  fileName: string;
  /** Encoded image bytes (typically PNG). */
  blob: Blob;
}

/** Complete Wavefront export result ready for multi-file save. */
export interface ObjExportPackage {
  /** Suggested primary .obj file name. */
  objFileName: string;
  /** Wavefront OBJ source text including mtllib and usemtl lines. */
  objText: string;
  /** Companion material library, or null when materials are left out. */
  mtl: { fileName: string; text: string } | null;
  /** Diffuse map files the MTL names. */
  textures: ObjExportTextureFile[];
}
