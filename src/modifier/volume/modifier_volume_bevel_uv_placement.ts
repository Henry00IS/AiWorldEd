import type * as THREE from 'three';
import { Vector4 } from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  modifierBevelClampUvOwner,
  modifierBevelClampUvPivot,
  modifierBevelClampUvSpace,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
  type ModifierBevelUvSpace,
} from './modifier_volume_bevel_keys.js';

/** Matrices that already include a volume placement. */
const MODIFIER_BEVEL_PLACED_MATRICES = new WeakSet<SurfaceUvMatrix>();

/** UserData object storing scale, offset, and rotation for generated UVs. */
export const MODIFIER_VOLUME_BEVEL_UV_PLACEMENT_KEY = 'modifierBevelUvPlacement';

/** Meters-per-tile scale, shift, and rotation applied to a generated UV. */
export interface ModifierBevelUvPlacement {
  /** Meters of the bevel covered by one texture tile along U. */
  uvScaleU: number;
  /** Meters of the bevel covered by one texture tile along V. */
  uvScaleV: number;
  /** Shift along U, in meters. */
  uvOffsetU: number;
  /** Shift along V, in meters. */
  uvOffsetV: number;
  /** Texture rotation, in degrees. */
  uvRotation: number;
  /** Which wall owns a multi-segment curve. */
  uvOwner: ModifierBevelUvOwner;
  /** Point the texture rotates around. */
  uvPivot: ModifierBevelUvPivot;
  /** Map axes or brush axes. */
  uvSpace: ModifierBevelUvSpace;
}

/** UV point a rotation keeps fixed. */
export interface ModifierBevelUvPivotPoint {
  /** U coordinate that stays put. */
  u: number;
  /** V coordinate that stays put. */
  v: number;
}

/**
 * Reads the UV placement stored on a volume.
 *
 * @param volume Bevel volume.
 * @returns Placement. Missing values use one meter per tile and no shift.
 */
export function modifierBevelReadUvPlacement(volume: THREE.Object3D): ModifierBevelUvPlacement {
  const stored = volume.userData[MODIFIER_VOLUME_BEVEL_UV_PLACEMENT_KEY];
  return modifierBevelNormalizePlacement(stored);
}

/**
 * Stores the UV placement on a volume.
 *
 * @param volume Bevel volume.
 * @param placement Scale, offset, and rotation.
 */
export function modifierBevelWriteUvPlacement(volume: THREE.Object3D, placement: ModifierBevelUvPlacement): void {
  volume.userData[MODIFIER_VOLUME_BEVEL_UV_PLACEMENT_KEY] = {
    uvScaleU: modifierBevelFiniteScale(placement.uvScaleU),
    uvScaleV: modifierBevelFiniteScale(placement.uvScaleV),
    uvOffsetU: modifierBevelFiniteOffset(placement.uvOffsetU),
    uvOffsetV: modifierBevelFiniteOffset(placement.uvOffsetV),
    uvRotation: modifierBevelFiniteOffset(placement.uvRotation),
    uvOwner: modifierBevelClampUvOwner(placement.uvOwner),
    uvPivot: modifierBevelClampUvPivot(placement.uvPivot),
    uvSpace: modifierBevelClampUvSpace(placement.uvSpace),
  };
}

/**
 * Returns whether the placement leaves generated UVs unchanged.
 *
 * @param placement Scale, offset, and rotation.
 * @returns True when every field is at its default.
 */
export function modifierBevelUvPlacementIsNeutral(placement: ModifierBevelUvPlacement): boolean {
  return (
    placement.uvScaleU === 1 &&
    placement.uvScaleV === 1 &&
    placement.uvOffsetU === 0 &&
    placement.uvOffsetV === 0 &&
    placement.uvRotation === 0
  );
}

/**
 * Scales, shifts, and rotates a UV matrix in texture space.
 *
 * @param matrix Layout matrix.
 * @param placement Scale, offset, and rotation. Scale is meters per tile.
 * @param pivot UV point that rotation keeps fixed. Ignored when rotation is
 *   zero.
 * @returns Adjusted matrix, or the same matrix when the placement is neutral.
 */
export function modifierBevelApplyUvPlacement(
  matrix: SurfaceUvMatrix,
  placement: ModifierBevelUvPlacement,
  pivot: ModifierBevelUvPivotPoint = { u: 0, v: 0 },
): SurfaceUvMatrix {
  if (modifierBevelUvPlacementIsNeutral(placement) || MODIFIER_BEVEL_PLACED_MATRICES.has(matrix)) return matrix;
  const scaled = modifierBevelScalePlacement(matrix, placement);
  const placed = modifierBevelRotatePlacement(scaled, placement, pivot);
  MODIFIER_BEVEL_PLACED_MATRICES.add(placed);
  return placed;
}

/**
 * Scales a matrix in its own axes and shifts it by the offsets.
 *
 * @param matrix Layout matrix.
 * @param placement Scale and offset. Scale is meters per tile.
 * @returns Scaled matrix.
 */
function modifierBevelScalePlacement(matrix: SurfaceUvMatrix, placement: ModifierBevelUvPlacement): SurfaceUvMatrix {
  return new SurfaceUvMatrix(
    modifierBevelScaleRow(matrix.u, placement.uvScaleU, placement.uvOffsetU),
    modifierBevelScaleRow(matrix.v, placement.uvScaleV, placement.uvOffsetV),
  );
}

/**
 * Divides one UV row by a meters-per-tile scale and applies an offset.
 *
 * @param row UV row.
 * @param scale Meters per tile.
 * @param offset Shift in meters.
 * @returns Scaled row.
 */
function modifierBevelScaleRow(row: Vector4, scale: number, offset: number): Vector4 {
  const factor = 1 / modifierBevelFiniteScale(scale);
  const shift = modifierBevelFiniteOffset(offset) * factor;
  return new Vector4(row.x * factor, row.y * factor, row.z * factor, row.w * factor - shift);
}

/**
 * Returns whether a rotation leaves every UV point fixed.
 *
 * @param rotation Rotation in degrees.
 * @returns True when the angle is a whole turn.
 */
export function modifierBevelRotationIsIdle(rotation: number): boolean {
  const radians = (modifierBevelFiniteOffset(rotation) * Math.PI) / 180;
  return Math.abs(Math.sin(radians)) < 1e-12 && Math.cos(radians) > 0;
}

/**
 * Returns whether this matrix already received volume scale and offset.
 *
 * @param matrix UV matrix.
 * @returns True when scale and offset were committed onto it.
 */
export function modifierBevelPlacementWasApplied(matrix: SurfaceUvMatrix): boolean {
  return MODIFIER_BEVEL_PLACED_MATRICES.has(matrix);
}

/**
 * Scales and shifts a matrix, leaving rotation unchanged.
 *
 * @param matrix UV matrix.
 * @param placement Scale and offset. Scale is meters per tile.
 * @returns Scaled matrix, or the same matrix when the scale and offset are
 *   neutral.
 */
export function modifierBevelScaleOffsetPlacement(
  matrix: SurfaceUvMatrix,
  placement: ModifierBevelUvPlacement,
): SurfaceUvMatrix {
  if (MODIFIER_BEVEL_PLACED_MATRICES.has(matrix)) return matrix;
  if (modifierBevelOffsetIsNeutral(placement)) return modifierBevelRememberPlacement(matrix);
  return modifierBevelRememberPlacement(modifierBevelScalePlacement(matrix, placement));
}

/**
 * Returns whether scale and offset leave a matrix unchanged.
 *
 * @param placement Scale and offset.
 * @returns True when both scales are one and both offsets are zero.
 */
function modifierBevelOffsetIsNeutral(placement: ModifierBevelUvPlacement): boolean {
  return placement.uvScaleU === 1 && placement.uvScaleV === 1 && placement.uvOffsetU === 0 && placement.uvOffsetV === 0;
}

/**
 * Remembers that a matrix already includes volume scale and offset.
 *
 * @param matrix UV matrix.
 * @returns The same matrix.
 */
function modifierBevelRememberPlacement(matrix: SurfaceUvMatrix): SurfaceUvMatrix {
  MODIFIER_BEVEL_PLACED_MATRICES.add(matrix);
  return matrix;
}

/**
 * Rotates a matrix about a UV point.
 *
 * @param matrix UV matrix.
 * @param placement Rotation in degrees.
 * @param pivot UV point that stays fixed.
 * @returns Rotated matrix, or the same matrix when the angle is a whole turn.
 */
export function modifierBevelRotatePlacement(
  matrix: SurfaceUvMatrix,
  placement: ModifierBevelUvPlacement,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix {
  if (modifierBevelRotationIsIdle(placement.uvRotation)) return matrix;
  return modifierBevelTurnByPlacement(matrix, placement, pivot);
}

/**
 * Mixes the UV rows by the placement angle.
 *
 * @param matrix UV matrix.
 * @param placement Rotation in degrees.
 * @param pivot UV point that stays fixed.
 * @returns Rotated matrix.
 */
function modifierBevelTurnByPlacement(
  matrix: SurfaceUvMatrix,
  placement: ModifierBevelUvPlacement,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix {
  const radians = (modifierBevelFiniteOffset(placement.uvRotation) * Math.PI) / 180;
  return modifierBevelTurnPlacement(matrix, Math.cos(radians), Math.sin(radians), pivot);
}

/**
 * Mixes the UV rows by an angle about a pivot.
 *
 * @param matrix Scaled matrix.
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param pivot UV point that stays fixed.
 * @returns Rotated matrix.
 */
function modifierBevelTurnPlacement(
  matrix: SurfaceUvMatrix,
  cos: number,
  sin: number,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix {
  return new SurfaceUvMatrix(
    modifierBevelPlaceRow(matrix.u, matrix.v, cos, sin, modifierBevelPivotShiftU(cos, sin, pivot)),
    modifierBevelPlaceRow(matrix.u, matrix.v, -sin, cos, modifierBevelPivotShiftV(cos, sin, pivot)),
  );
}

/**
 * Returns the U translation that keeps the pivot fixed.
 *
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param pivot UV point that stays fixed.
 * @returns Translation added to U.
 */
function modifierBevelPivotShiftU(cos: number, sin: number, pivot: ModifierBevelUvPivotPoint): number {
  return pivot.u - cos * pivot.u - sin * pivot.v;
}

/**
 * Returns the V translation that keeps the pivot fixed.
 *
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param pivot UV point that stays fixed.
 * @returns Translation added to V.
 */
function modifierBevelPivotShiftV(cos: number, sin: number, pivot: ModifierBevelUvPivotPoint): number {
  return pivot.v + sin * pivot.u - cos * pivot.v;
}

/**
 * Fills missing placement fields.
 *
 * @param stored UserData value.
 * @returns Complete placement.
 */
function modifierBevelNormalizePlacement(stored: unknown): ModifierBevelUvPlacement {
  const record = modifierBevelPlacementRecord(stored);
  return {
    uvScaleU: modifierBevelFiniteScale(record.uvScaleU),
    uvScaleV: modifierBevelFiniteScale(record.uvScaleV),
    uvOffsetU: modifierBevelFiniteOffset(record.uvOffsetU),
    uvOffsetV: modifierBevelFiniteOffset(record.uvOffsetV),
    uvRotation: modifierBevelFiniteOffset(record.uvRotation),
    uvOwner: modifierBevelClampUvOwner(record.uvOwner),
    uvPivot: modifierBevelClampUvPivot(record.uvPivot),
    uvSpace: modifierBevelClampUvSpace(record.uvSpace),
  };
}

/**
 * Reads a stored placement object.
 *
 * @param stored UserData value.
 * @returns Field bag. Missing fields stay undefined.
 */
function modifierBevelPlacementRecord(stored: unknown): Partial<ModifierBevelUvPlacement> {
  if (!stored || typeof stored !== 'object') return {};
  return stored as Partial<ModifierBevelUvPlacement>;
}

/**
 * Accepts a nonzero finite scale.
 *
 * @param value Requested meters per tile.
 * @returns Value, or 1 when it cannot scale a texture.
 */
function modifierBevelFiniteScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 1;
  return value;
}

/**
 * Accepts a finite offset or rotation.
 *
 * @param value Requested number.
 * @returns Value, or 0 when it is not finite.
 */
function modifierBevelFiniteOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

/**
 * Mixes two UV rows and adds an offset.
 *
 * @param left First row.
 * @param right Second row.
 * @param leftWeight Weight of the first row.
 * @param rightWeight Weight of the second row.
 * @param offset Added to the translation.
 * @returns Mixed row.
 */
function modifierBevelPlaceRow(
  left: Vector4,
  right: Vector4,
  leftWeight: number,
  rightWeight: number,
  offset: number,
): Vector4 {
  return new Vector4(
    left.x * leftWeight + right.x * rightWeight,
    left.y * leftWeight + right.y * rightWeight,
    left.z * leftWeight + right.z * rightWeight,
    left.w * leftWeight + right.w * rightWeight + offset,
  );
}
