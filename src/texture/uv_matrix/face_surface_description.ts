import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { SurfaceUvMatrix, type SurfaceUvMatrixSerialized } from './surface_uv_matrix.js';

/**
 * Authored texture identity plus UV matrix for one surface (solid face or
 * content coplanar region).
 */
export interface FaceSurfaceDescription {
  /** Durable texture identity. */
  textureId: string;
  /** UV projection matrix for this surface. */
  uv: SurfaceUvMatrix;
  /** Smooth shading kept from a baked modifier; absent means flat. */
  smooth?: FaceSurfaceSmooth;
}

/** Smooth shading of one face, such as a baked column side. */
export interface FaceSurfaceSmooth {
  /** Faces of one group blend normals where they meet. */
  group: string;
  /** Faces meeting at less than this angle, in degrees, shade smoothly. */
  maxAngle: number;
  /** Only faces of the same class blend; -1 stays flat. */
  smoothClass: number;
}

/** JSON form of a face surface description. */
export interface FaceSurfaceDescriptionSerialized {
  textureId: string;
  uv: SurfaceUvMatrixSerialized;
  smooth?: FaceSurfaceSmooth;
}

/**
 * Creates a default surface description (centered UV, optional texture id).
 * Translation is +0.5 on U and V so textures sit centered on unit-centered
 * brush faces when oriented per face normal.
 *
 * @param textureId Optional texture identity.
 * @returns New default description.
 */
export function createDefaultFaceSurface(textureId: string = DEFAULT_CHECKER_TEXTURE_ID): FaceSurfaceDescription {
  return {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.centered(),
  };
}

/**
 * Orients a template surface's UV translation, rotation, and scale onto a face
 * normal.
 *
 * @param template Surface whose texture and UV trs are copied.
 * @param faceNormal Unit normal of the face receiving the surface.
 * @returns Surface aimed at the face.
 */
export function orientDefaultFaceSurface(
  template: FaceSurfaceDescription,
  faceNormal: THREE.Vector3,
): FaceSurfaceDescription {
  const upright = new THREE.Vector3(0, 1, 0);
  const trs = template.uv.decompose(upright);
  return {
    textureId: template.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.fromTrs(trs.translation, faceNormal, trs.rotationDeg, trs.scaleU, trs.scaleV),
  };
}

/**
 * Creates a surface description with a TRS-built UV matrix for a face normal.
 *
 * @param faceNormal Face normal in the matrix space.
 * @param textureId Texture identity.
 * @param metersPerTileU World meters per texture tile on U (default 1).
 * @param metersPerTileV World meters per texture tile on V (default 1).
 * @returns New description.
 */
export function createFaceSurfaceFromTileSize(
  faceNormal: THREE.Vector3,
  textureId: string = DEFAULT_CHECKER_TEXTURE_ID,
  metersPerTileU: number = 1,
  metersPerTileV: number = 1,
): FaceSurfaceDescription {
  const scaleU = 1 / (metersPerTileU === 0 ? 1 : metersPerTileU);
  const scaleV = 1 / (metersPerTileV === 0 ? 1 : metersPerTileV);
  return {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), faceNormal, 0, scaleU, scaleV),
  };
}

/**
 * Deep-clones a face surface description.
 *
 * @param surface Source surface.
 * @returns Independent copy.
 */
export function cloneFaceSurface(surface: FaceSurfaceDescription): FaceSurfaceDescription {
  return faceSurfaceSmoothKeep<FaceSurfaceDescription>(surface.smooth, {
    textureId: surface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: surface.uv.clone(),
  });
}

/**
 * Serializes a face surface for persistence.
 *
 * @param surface Source surface.
 * @returns Plain JSON object.
 */
export function serializeFaceSurface(surface: FaceSurfaceDescription): FaceSurfaceDescriptionSerialized {
  return faceSurfaceSmoothKeep<FaceSurfaceDescriptionSerialized>(surface.smooth, {
    textureId: surface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: surface.uv.serialize(),
  });
}

/**
 * Restores a face surface from persistence.
 *
 * @param data Serialized surface.
 * @returns Restored description.
 */
export function deserializeFaceSurface(data: FaceSurfaceDescriptionSerialized): FaceSurfaceDescription {
  return faceSurfaceSmoothKeep<FaceSurfaceDescription>(data.smooth, {
    textureId: data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.fromSerialized(data.uv),
  });
}

/**
 * Adds a valid copy of a face's smooth shading to a surface.
 *
 * @param smooth Stored smoothing, possibly from untrusted JSON.
 * @param surface Surface to extend.
 * @returns The surface.
 */
function faceSurfaceSmoothKeep<T extends { smooth?: FaceSurfaceSmooth }>(smooth: unknown, surface: T): T {
  const value = smooth as Partial<FaceSurfaceSmooth> | undefined;
  if (!value || typeof value.group !== 'string' || !Number.isFinite(value.maxAngle)) return surface;
  const smoothClass = Number.isFinite(value.smoothClass) ? Number(value.smoothClass) : 0;
  surface.smooth = { group: value.group, maxAngle: Number(value.maxAngle), smoothClass };
  return surface;
}
