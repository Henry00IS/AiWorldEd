import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';

/**
 * World-axis alignment presets for planar face texture projection.
 * Matches classic CSG / brush editor surface tools.
 */
export type FaceTextureAlign =
  | 'auto'
  | 'floor'
  | 'ceiling'
  | 'wall'
  | 'face';

/**
 * Authored texture parameters for one coplanar face region.
 * UVs are baked from these via world-space planar projection.
 * textureId is the durable surface material identity for paint and export.
 */
export interface FaceTextureMapping {
  /** Projection basis preset. */
  align: FaceTextureAlign;
  /** World meters covered by one full texture tile on U. */
  scaleU: number;
  /** World meters covered by one full texture tile on V. */
  scaleV: number;
  /** World-space shift along U (meters). */
  offsetU: number;
  /** World-space shift along V (meters). */
  offsetV: number;
  /** Rotation of the U/V basis around the projection normal (degrees). */
  rotationDeg: number;
  /**
   * Stable texture identity (built-in checker id or folder-relative path).
   * Survives mesh rebuilds when carried through CSG polygons.
   */
  textureId: string;
}

/**
 * Stored mapping for a coplanar set of triangles on a mesh.
 */
export interface FaceTextureMapEntry {
  /** Triangle indices that share this mapping. */
  triangleIndices: number[];
  /** Projection parameters for this region. */
  mapping: FaceTextureMapping;
}

/** userData key for face texture map tables on content meshes. */
export const FACE_TEXTURE_MAPS_USERDATA_KEY = 'faceTextureMaps';

/**
 * Creates default face texture mapping (1 m tile, auto projection, checker).
 * @param textureId Optional texture id (defaults to built-in checker).
 * @returns A new default mapping object.
 */
export function createDefaultFaceTextureMapping(
  textureId: string = DEFAULT_CHECKER_TEXTURE_ID
): FaceTextureMapping {
  return {
    align: 'auto',
    scaleU: 1,
    scaleV: 1,
    offsetU: 0,
    offsetV: 0,
    rotationDeg: 0,
    textureId
  };
}

/**
 * Deep-clones a face texture mapping.
 * @param mapping Source mapping.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapping(
  mapping: FaceTextureMapping
): FaceTextureMapping {
  return {
    align: mapping.align,
    scaleU: mapping.scaleU,
    scaleV: mapping.scaleV,
    offsetU: mapping.offsetU,
    offsetV: mapping.offsetV,
    rotationDeg: mapping.rotationDeg,
    textureId: mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID
  };
}

/**
 * Clones a face texture map entry including triangle index list.
 * @param entry Source entry.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapEntry(
  entry: FaceTextureMapEntry
): FaceTextureMapEntry {
  return {
    triangleIndices: entry.triangleIndices.slice(),
    mapping: cloneFaceTextureMapping(entry.mapping)
  };
}
