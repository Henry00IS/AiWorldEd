import type { FaceTextureAlign, FaceTextureMapping, FaceTextureMappingTrs } from './face_texture_mapping.js';
import { createFaceTextureMappingFromTrs, getFaceTextureMappingTrs } from './face_texture_mapping.js';
import { resolveProjectionNormal } from './planar_uv_projector.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import * as THREE from 'three';

/** Absolute UV editor field names (meters-per-tile TRS). */
export type UvTrsField = keyof FaceTextureMappingTrs;

/**
 * Relative UV TRS operation applied independently to each selected face region
 * (works with mixed multi-selection).
 */
export type UvRelativeTrsOp =
  | { kind: 'multiplyScale'; axis: 'u' | 'v'; factor: number }
  | { kind: 'addOffset'; axis: 'u' | 'v'; delta: number }
  | { kind: 'addRotation'; degrees: number };

/** Default offset nudge in world meters (¼ texture tile at scale 1). */
export const UV_OFFSET_NUDGE = 0.25;

/** Minimum |face · projection| before an align is considered useful. */
const ALIGN_MIN_FACE_DOT = 0.2;

/**
 * Returns whether applying an align preset would produce a usable projection on
 * this face. Mirrors classic UnrealEd behavior: Floor/Ceiling on walls and Wall
 * on floors/ceilings do nothing instead of collapsing a UV axis.
 *
 * @param faceNormal Unit face normal in world space.
 * @param align Requested align preset.
 * @returns True when the align is compatible with the face.
 */
export function isAlignCompatibleWithFace(faceNormal: THREE.Vector3, align: FaceTextureAlign): boolean {
  if (align === 'auto' || align === 'face') return true;
  const unitFace = faceNormal.clone().normalize();
  if (unitFace.lengthSq() < 1e-12) return false;
  const projectionNormal = resolveProjectionNormal(unitFace, align);
  return Math.abs(unitFace.dot(projectionNormal)) >= ALIGN_MIN_FACE_DOT;
}

/**
 * Applies a relative TRS op to one TRS field set.
 *
 * @param trs Source TRS.
 * @param op Relative operation.
 * @returns Updated TRS fields.
 */
export function applyRelativeOpToTrs(trs: FaceTextureMappingTrs, op: UvRelativeTrsOp): FaceTextureMappingTrs {
  if (op.kind === 'multiplyScale') {
    return applyScaleFactor(trs, op.axis, op.factor);
  }
  if (op.kind === 'addOffset') {
    return applyOffsetDelta(trs, op.axis, op.delta);
  }
  return {
    ...trs,
    rotationDeg: normalizeRotationDegrees(trs.rotationDeg + op.degrees),
  };
}

/**
 * Merges absolute field overrides onto a TRS set (multi-edit: only typed fields
 * change).
 *
 * @param trs Source TRS.
 * @param fields Fields to overwrite (only present keys).
 * @returns Updated TRS fields.
 */
export function applyPartialFieldsToTrs(
  trs: FaceTextureMappingTrs,
  fields: Partial<FaceTextureMappingTrs>,
): FaceTextureMappingTrs {
  return {
    scaleU: fields.scaleU !== undefined ? fields.scaleU : trs.scaleU,
    scaleV: fields.scaleV !== undefined ? fields.scaleV : trs.scaleV,
    offsetU: fields.offsetU !== undefined ? fields.offsetU : trs.offsetU,
    offsetV: fields.offsetV !== undefined ? fields.offsetV : trs.offsetV,
    rotationDeg: fields.rotationDeg !== undefined ? fields.rotationDeg : trs.rotationDeg,
  };
}

/**
 * Rebuilds a face mapping from an existing one with new TRS, keeping texture
 * and projection plane orientation.
 *
 * @param existing Current mapping.
 * @param faceNormal Face world normal.
 * @param trs New TRS fields.
 * @returns Mapping with updated UV matrix.
 */
export function rebuildMappingWithTrs(
  existing: FaceTextureMapping,
  faceNormal: THREE.Vector3,
  trs: FaceTextureMappingTrs,
): FaceTextureMapping {
  const align = existing.align ?? 'auto';
  const projectionNormal = resolveProjectionNormalForMapping(existing, faceNormal, align);
  return createFaceTextureMappingFromTrs(existing.textureId, projectionNormal, trs, align);
}

/**
 * Reads TRS from a mapping using the matrix plane when available.
 *
 * @param mapping Source mapping.
 * @param faceNormal Face normal fallback.
 * @returns Decomposed TRS fields.
 */
export function readMappingTrs(mapping: FaceTextureMapping, faceNormal: THREE.Vector3): FaceTextureMappingTrs {
  const extractNormal = resolveTrsExtractNormal(mapping, faceNormal);
  return getFaceTextureMappingTrs(mapping, extractNormal);
}

/**
 * Picks a normal for reading TRS from an existing matrix. Aligns the UV plane
 * normal to the face side so negative scale (mirror) does not flip decompose.
 *
 * @param mapping Incoming mapping.
 * @param fallbackNormal Face projection normal.
 * @returns Unit normal for TRS decompose.
 */
function resolveTrsExtractNormal(mapping: FaceTextureMapping, fallbackNormal: THREE.Vector3): THREE.Vector3 {
  if (mapping.uv instanceof SurfaceUvMatrix) {
    return mapping.uv.planeNormalAlignedTo(fallbackNormal);
  }
  return fallbackNormal.clone().normalize();
}

/**
 * Chooses the projection normal used when rewriting TRS on an existing mapping.
 *
 * @param existing Current mapping.
 * @param faceNormal Face world normal.
 * @param align Align preset on the mapping.
 * @returns Unit projection normal.
 */
function resolveProjectionNormalForMapping(
  existing: FaceTextureMapping,
  faceNormal: THREE.Vector3,
  align: FaceTextureAlign,
): THREE.Vector3 {
  if (align === 'floor' || align === 'ceiling' || align === 'wall') {
    return resolveProjectionNormal(faceNormal, align);
  }
  return resolveTrsExtractNormal(existing, faceNormal);
}

/**
 * Multiplies scale on one axis, clamping away from zero.
 *
 * @param trs Source TRS.
 * @param axis U or V.
 * @param factor Multiplier.
 * @returns Updated TRS.
 */
function applyScaleFactor(trs: FaceTextureMappingTrs, axis: 'u' | 'v', factor: number): FaceTextureMappingTrs {
  const safeFactor = factor === 0 || !Number.isFinite(factor) ? 1 : factor;
  if (axis === 'u') {
    return { ...trs, scaleU: sanitizeScale(trs.scaleU * safeFactor) };
  }
  return { ...trs, scaleV: sanitizeScale(trs.scaleV * safeFactor) };
}

/**
 * Adds an offset delta on one axis.
 *
 * @param trs Source TRS.
 * @param axis U or V.
 * @param delta Offset delta in meters.
 * @returns Updated TRS.
 */
function applyOffsetDelta(trs: FaceTextureMappingTrs, axis: 'u' | 'v', delta: number): FaceTextureMappingTrs {
  if (axis === 'u') {
    return { ...trs, offsetU: trs.offsetU + delta };
  }
  return { ...trs, offsetV: trs.offsetV + delta };
}

/**
 * Keeps scale away from zero while preserving sign.
 *
 * @param scale Input scale.
 * @returns Safe scale.
 */
function sanitizeScale(scale: number): number {
  if (!Number.isFinite(scale) || scale === 0) return 1;
  if (Math.abs(scale) < 1e-4) return scale < 0 ? -1e-4 : 1e-4;
  return scale;
}

/**
 * Wraps rotation into (−180, 180] for stable UI display.
 *
 * @param degrees Raw rotation degrees.
 * @returns Normalized degrees.
 */
function normalizeRotationDegrees(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}
