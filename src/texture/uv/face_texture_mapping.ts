import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { SurfaceUvMatrix, type SurfaceUvMatrixSerialized } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** World-axis alignment preset stored on a face texture mapping. */
export type FaceTextureAlign = 'auto' | 'floor' | 'ceiling' | 'wall' | 'face';

/**
 * Surface texture identity and UV matrix for one coplanar face region. UVs are
 * projected as u = U·p + Uw, v = V·p + Vw. Optional TRS fields may hold
 * meters-per-tile proxy values when present.
 */
export interface FaceTextureMapping {
  /** Durable texture identity. */
  textureId: string;
  /** 2×4 UV projection matrix. */
  uv: SurfaceUvMatrix;
  /** Optional world-axis align preset. */
  align?: FaceTextureAlign;
  /** World meters per texture tile on U. */
  scaleU?: number;
  /** World meters per texture tile on V. */
  scaleV?: number;
  /** UV phase shift along U in meters. */
  offsetU?: number;
  /** UV phase shift along V in meters. */
  offsetV?: number;
  /** UV rotation around the face normal in degrees. */
  rotationDeg?: number;
}

/** TRS fields in meters-per-tile scale convention. */
export interface FaceTextureMappingTrs {
  /**
   * World meters covered by one texture tile on U. Negative values mirror the
   * texture along U.
   */
  scaleU: number;
  /**
   * World meters covered by one texture tile on V. Negative values mirror the
   * texture along V.
   */
  scaleV: number;
  /** UV phase shift along U (meters). */
  offsetU: number;
  /** UV phase shift along V (meters). */
  offsetV: number;
  /** Rotation of U/V around the face normal (degrees). */
  rotationDeg: number;
}

/**
 * Face mapping whose scaleU, scaleV, offsetU, offsetV, and rotationDeg fields
 * are required meters-per-tile TRS values.
 */
export type FaceTextureMappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/** Stored mapping for a coplanar set of triangles on a mesh. */
export interface FaceTextureMapEntry {
  /** Triangle indices that share this mapping. */
  triangleIndices: number[];
  /** UV matrix + texture for this region. */
  mapping: FaceTextureMapping;
}

/** UserData key for face texture map tables on content meshes. */
export const FACE_TEXTURE_MAPS_USERDATA_KEY = 'faceTextureMaps';

/** Plain JSON form of a face texture mapping. */
export interface FaceTextureMappingSerialized {
  textureId: string;
  uv: SurfaceUvMatrixSerialized;
  align?: FaceTextureAlign;
  /** Legacy planar fields (load-only). */
  scaleU?: number;
  scaleV?: number;
  offsetU?: number;
  offsetV?: number;
  rotationDeg?: number;
  customUAxis?: { x: number; y: number; z: number };
  customVAxis?: { x: number; y: number; z: number };
}

/** Fallback unit normal (0, 1, 0) when a mapping has no usable UV plane normal. */
const DEFAULT_TRS_NORMAL = new THREE.Vector3(0, 1, 0);

/**
 * Creates a default face mapping (centered UV matrix, checker texture). UV
 * translation is +0.5 on U and V so a unit-centered face maps to one full tile
 * with the texture centered on each side.
 *
 * @param textureId Optional texture id.
 * @returns New default mapping with TRS accessors.
 */
export function createDefaultFaceTextureMapping(
  textureId: string = DEFAULT_CHECKER_TEXTURE_ID,
): FaceTextureMappingWithTrs {
  return withTrsAccessors({
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.centered(),
    align: 'auto',
  });
}

/**
 * Builds a face mapping from meters-per-tile TRS fields and a face normal.
 * Negative scaleU/V mirror that axis. Empty textureId is preserved unchanged.
 *
 * @param textureId Texture identity; empty string is kept as-is.
 * @param faceNormal Face normal in the matrix space.
 * @param trs Meters-per-tile scale, offset, and rotation fields.
 * @param align Optional align preset stored on the mapping.
 * @returns New mapping with UV matrix and TRS accessors.
 */
export function createFaceTextureMappingFromTrs(
  textureId: string,
  faceNormal: THREE.Vector3,
  trs: FaceTextureMappingTrs,
  align: FaceTextureAlign = 'face',
): FaceTextureMappingWithTrs {
  return withTrsAccessors({
    textureId: normalizeOptionalTextureId(textureId),
    uv: buildUvMatrixFromTrsFields(trs, faceNormal),
    align,
  });
}

/**
 * Wraps a mapping so scaleU, scaleV, offsetU, offsetV, and rotationDeg read and
 * write meters-per-tile TRS against the mapping UV plane normal, or +Y when no
 * usable plane normal exists. Already-proxied mappings are returned unchanged.
 *
 * @param mapping Source mapping to wrap or return if already proxied.
 * @returns Proxied mapping with TRS field accessors.
 */
export function withTrsAccessors(mapping: FaceTextureMapping): FaceTextureMappingWithTrs {
  if ((mapping as { __trsProxy?: boolean }).__trsProxy) {
    return mapping as unknown as FaceTextureMappingWithTrs;
  }
  const target: FaceTextureMapping & { __trsProxy: boolean } = {
    textureId: normalizeOptionalTextureId(mapping.textureId),
    uv: mapping.uv.clone(),
    __trsProxy: true,
  };
  if (mapping.align !== undefined) target.align = mapping.align;
  return new Proxy(target, {
    get(obj, prop) {
      if (
        prop === 'scaleU' ||
        prop === 'scaleV' ||
        prop === 'offsetU' ||
        prop === 'offsetV' ||
        prop === 'rotationDeg'
      ) {
        return getFaceTextureMappingTrs(obj, resolveMappingTrsNormal(obj))[prop];
      }
      return Reflect.get(obj, prop);
    },
    set(obj, prop, value) {
      if (
        prop === 'scaleU' ||
        prop === 'scaleV' ||
        prop === 'offsetU' ||
        prop === 'offsetV' ||
        prop === 'rotationDeg'
      ) {
        const extractNormal = resolveMappingTrsNormal(obj);
        const trs = getFaceTextureMappingTrs(obj, extractNormal);
        trs[prop as keyof FaceTextureMappingTrs] = value as number;
        obj.uv = buildUvMatrixFromTrsFields(trs, extractNormal);
        return true;
      }
      return Reflect.set(obj, prop, value);
    },
  }) as unknown as FaceTextureMappingWithTrs;
}

/**
 * Returns the UV matrix plane normal when it has non-zero length, otherwise a
 * clone of the default +Y normal.
 *
 * @param mapping Mapping whose UV plane is inspected.
 * @returns Unit normal for TRS extract and rebuild.
 */
function resolveMappingTrsNormal(mapping: FaceTextureMapping): THREE.Vector3 {
  if (mapping.uv instanceof SurfaceUvMatrix) {
    const planeNormal = mapping.uv.planeNormal();
    if (planeNormal.lengthSq() > 1e-20) {
      return planeNormal;
    }
  }
  return DEFAULT_TRS_NORMAL.clone();
}

/**
 * Decomposes a mapping into meters-per-tile TRS fields. Negative scale
 * preserves texture mirroring along that axis.
 *
 * @param mapping Source mapping whose UV matrix is decomposed.
 * @param faceNormal Face normal used for orientation during decompose.
 * @returns TRS fields in meters-per-tile scale convention.
 */
export function getFaceTextureMappingTrs(
  mapping: FaceTextureMapping,
  faceNormal: THREE.Vector3,
): FaceTextureMappingTrs {
  const trs = mapping.uv.decompose(faceNormal);
  const metersU = matrixScaleToMetersPerTile(trs.scaleU);
  const metersV = matrixScaleToMetersPerTile(trs.scaleV);
  return {
    scaleU: metersU,
    scaleV: metersV,
    offsetU: -mapping.uv.u.w * metersU,
    offsetV: -mapping.uv.v.w * metersV,
    rotationDeg: trs.rotationDeg,
  };
}

/**
 * Builds a UV matrix from meters-per-tile TRS fields.
 *
 * @param trs Meters-per-tile scale, offset, and rotation fields.
 * @param faceNormal Face normal for plane orientation.
 * @returns Surface UV matrix.
 */
function buildUvMatrixFromTrsFields(trs: FaceTextureMappingTrs, faceNormal: THREE.Vector3): SurfaceUvMatrix {
  const matrixScaleU = metersPerTileToMatrixScale(trs.scaleU);
  const matrixScaleV = metersPerTileToMatrixScale(trs.scaleV);
  const translation = new THREE.Vector2(-trs.offsetU * matrixScaleU, -trs.offsetV * matrixScaleV);
  return SurfaceUvMatrix.fromTrs(translation, faceNormal, trs.rotationDeg, matrixScaleU, matrixScaleV);
}

/**
 * Converts meters-per-tile scale to matrix UV scale (1 / meters). Sign is
 * preserved so negative meters-per-tile mirrors the texture.
 *
 * @param metersPerTile Meters-per-tile scale (zero or non-finite becomes 1).
 * @returns Matrix scale.
 */
function metersPerTileToMatrixScale(metersPerTile: number): number {
  if (!Number.isFinite(metersPerTile) || metersPerTile === 0) {
    return 1;
  }
  return 1 / metersPerTile;
}

/**
 * Converts signed matrix UV scale to meters-per-tile scale.
 *
 * @param matrixScale Matrix scale (zero or non-finite becomes 1).
 * @returns Meters-per-tile scale with mirror sign preserved.
 */
function matrixScaleToMetersPerTile(matrixScale: number): number {
  if (!Number.isFinite(matrixScale) || matrixScale === 0) {
    return 1;
  }
  return 1 / matrixScale;
}

/**
 * Deep-clones a face texture mapping.
 *
 * @param mapping Source mapping.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapping(mapping: FaceTextureMapping): FaceTextureMappingWithTrs {
  const cloned: FaceTextureMapping = {
    textureId: normalizeOptionalTextureId(mapping.textureId),
    uv: mapping.uv.clone(),
  };
  if (mapping.align !== undefined) cloned.align = mapping.align;
  return withTrsAccessors(cloned);
}

/**
 * Normalizes a texture id. Undefined or null becomes the default checker id;
 * empty string is preserved unchanged.
 *
 * @param textureId Raw texture id or missing value.
 * @returns Normalized texture id (may be empty).
 */
function normalizeOptionalTextureId(textureId: string | undefined | null): string {
  if (textureId === undefined || textureId === null) return DEFAULT_CHECKER_TEXTURE_ID;
  return textureId;
}

/**
 * Clones a face texture map entry including triangle index list.
 *
 * @param entry Source entry.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapEntry(entry: FaceTextureMapEntry): FaceTextureMapEntry {
  return {
    triangleIndices: entry.triangleIndices.slice(),
    mapping: cloneFaceTextureMapping(entry.mapping),
  };
}

/**
 * Serializes a mapping to a plain JSON object (textureId, uv, optional align).
 *
 * @param mapping Source mapping.
 * @returns Plain JSON object.
 */
export function serializeFaceTextureMapping(mapping: FaceTextureMapping): FaceTextureMappingSerialized {
  const serialized: FaceTextureMappingSerialized = {
    textureId: mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: mapping.uv.serialize(),
  };
  if (mapping.align !== undefined) serialized.align = mapping.align;
  return serialized;
}

/**
 * Restores a mapping from JSON, including legacy planar scale/offset form.
 *
 * @param data Serialized mapping.
 * @param faceNormal Face normal used when migrating legacy planar fields.
 * @returns Restored mapping.
 */
export function deserializeFaceTextureMapping(
  data: FaceTextureMappingSerialized | FaceTextureMapping | undefined,
  faceNormal: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): FaceTextureMappingWithTrs {
  if (!data) return createDefaultFaceTextureMapping();
  if (isMatrixMapping(data)) {
    return cloneFaceTextureMapping(data);
  }
  const record = data as FaceTextureMappingSerialized;
  if (record.uv && Array.isArray(record.uv.u) && Array.isArray(record.uv.v)) {
    const restored: FaceTextureMapping = {
      textureId: record.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: SurfaceUvMatrix.fromSerialized(record.uv),
    };
    if (record.align !== undefined) restored.align = record.align;
    return withTrsAccessors(restored);
  }
  return migrateLegacyPlanarMapping(record, faceNormal);
}

/**
 * Type guard for live FaceTextureMapping with SurfaceUvMatrix.
 *
 * @param value Unknown value.
 * @returns True when value has a SurfaceUvMatrix uv field.
 */
function isMatrixMapping(value: unknown): value is FaceTextureMapping {
  if (!value || typeof value !== 'object') return false;
  const record = value as { uv?: unknown; textureId?: unknown };
  return record.uv instanceof SurfaceUvMatrix && typeof record.textureId === 'string';
}

/**
 * Converts legacy planar fields into a UV matrix mapping.
 *
 * @param data Legacy serialized mapping.
 * @param faceNormal Face normal for basis.
 * @returns Matrix mapping.
 */
function migrateLegacyPlanarMapping(
  data: FaceTextureMappingSerialized,
  faceNormal: THREE.Vector3,
): FaceTextureMappingWithTrs {
  const scaleU = data.scaleU === 0 || data.scaleU === undefined ? 1 : data.scaleU;
  const scaleV = data.scaleV === 0 || data.scaleV === undefined ? 1 : data.scaleV;
  const offsetU = data.offsetU ?? 0;
  const offsetV = data.offsetV ?? 0;
  const rotationDeg = data.rotationDeg ?? 0;
  if (data.customUAxis && data.customVAxis) {
    const uLen = Math.hypot(data.customUAxis.x, data.customUAxis.y, data.customUAxis.z) || 1;
    const vLen = Math.hypot(data.customVAxis.x, data.customVAxis.y, data.customVAxis.z) || 1;
    const uDir = new THREE.Vector3(data.customUAxis.x / uLen, data.customUAxis.y / uLen, data.customUAxis.z / uLen);
    const vDir = new THREE.Vector3(data.customVAxis.x / vLen, data.customVAxis.y / vLen, data.customVAxis.z / vLen);
    const u = new THREE.Vector4(uDir.x / scaleU, uDir.y / scaleU, uDir.z / scaleU, -offsetU / scaleU);
    const v = new THREE.Vector4(vDir.x / scaleV, vDir.y / scaleV, vDir.z / scaleV, -offsetV / scaleV);
    return withTrsAccessors({
      textureId: data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: new SurfaceUvMatrix(u, v),
      align: data.align ?? 'face',
    });
  }
  return createFaceTextureMappingFromTrs(
    data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    faceNormal,
    { scaleU, scaleV, offsetU, offsetV, rotationDeg },
    data.align ?? 'face',
  );
}
