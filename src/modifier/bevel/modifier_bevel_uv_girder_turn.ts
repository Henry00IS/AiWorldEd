import { Vector4 } from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  modifierBevelRotationIsIdle,
  type ModifierBevelUvPivotPoint,
  type ModifierBevelUvPlacement,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelGirderSurface } from './modifier_bevel_uv_girder_matrix.js';

/**
 * Rotates a trim or stretch chart in meter space so the texels stay
 * rectangular.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Unrotated girder chart.
 * @param pivot UV point that stays fixed.
 * @returns Rotated chart, or null when this face is not a trim or stretch
 *   chart.
 */
export function modifierBevelTurnGirderChart(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix | null {
  if (!modifierBevelFaceUsesGirderTurn(derived, faceIndex)) return null;
  if (modifierBevelRotationIsIdle(derived.placement.uvRotation)) return matrix;
  return modifierBevelSpinGirderChart(source, derived, faceIndex, matrix, derived.placement, pivot);
}

/**
 * Returns whether a face should turn in meter space.
 *
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns True for a trim or stretch face that has a girder.
 */
function modifierBevelFaceUsesGirderTurn(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  if (!modifierBevelLayoutTurnsInMeters(derived.layout)) return false;
  return derived.girders[derived.girderOfFace[faceIndex] ?? -1] !== undefined;
}

/**
 * Returns whether a layout's axes use different units.
 *
 * @param layout Volume layout.
 * @returns True for trim and stretch.
 */
function modifierBevelLayoutTurnsInMeters(layout: string): boolean {
  return layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM || layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH;
}

/**
 * Spins the meter chart and writes the layout scales back onto the rows.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Unrotated chart.
 * @param placement Rotation in degrees.
 * @param pivot UV point that stays fixed.
 * @returns Rotated chart, or the same matrix when a row has no length.
 */
function modifierBevelSpinGirderChart(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
  placement: ModifierBevelUvPlacement,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix {
  const ratio = modifierBevelGirderRatio(source, derived, faceIndex, matrix);
  if (!ratio) return matrix;
  const radians = (placement.uvRotation * Math.PI) / 180;
  return modifierBevelGirderTurnedMatrix(
    matrix,
    Math.cos(radians),
    Math.sin(radians),
    ratio.along,
    ratio.across,
    pivot,
  );
}

/**
 * Returns the shared length-to-profile mix for one face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param matrix Unrotated chart.
 * @returns Mix weights, or null when a row collapses.
 */
function modifierBevelGirderRatio(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
): { along: number; across: number } | null {
  const along = modifierBevelRowLength(matrix.u);
  const across = modifierBevelDominantAcross(source, derived, derived.girderOfFace[faceIndex] ?? -1);
  if (along < 1e-8 || across < 1e-8) return null;
  return { along: along / across, across: across / along };
}

/** Across-length chosen for each derived girder. */
const MODIFIER_BEVEL_GIRDER_ACROSS = new WeakMap<ModifierBevelDerivedBrush, Map<number, number>>();

/**
 * Returns the profile gradient shared by one girder.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param girderIndex Girder index.
 * @returns Length of the profile row on the face that covers the most profile.
 */
function modifierBevelDominantAcross(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  girderIndex: number,
): number {
  const saved = modifierBevelReadAcross(derived, girderIndex);
  if (saved > 0) return saved;
  const across = modifierBevelMeasureDominantAcross(source, derived, girderIndex);
  modifierBevelStoreAcross(derived, girderIndex, across);
  return across;
}

/**
 * Reads a cached profile gradient.
 *
 * @param derived Derived brush.
 * @param girderIndex Girder index.
 * @returns Cached length, or 0.
 */
function modifierBevelReadAcross(derived: ModifierBevelDerivedBrush, girderIndex: number): number {
  return MODIFIER_BEVEL_GIRDER_ACROSS.get(derived)?.get(girderIndex) ?? 0;
}

/**
 * Stores the profile gradient for one girder.
 *
 * @param derived Derived brush.
 * @param girderIndex Girder index.
 * @param across Profile row length.
 */
function modifierBevelStoreAcross(derived: ModifierBevelDerivedBrush, girderIndex: number, across: number): void {
  const table = MODIFIER_BEVEL_GIRDER_ACROSS.get(derived) ?? new Map<number, number>();
  table.set(girderIndex, across);
  MODIFIER_BEVEL_GIRDER_ACROSS.set(derived, table);
}

/**
 * Measures the profile row on the face that covers the widest fraction.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param girderIndex Girder index.
 * @returns Profile row length.
 */
function modifierBevelMeasureDominantAcross(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  girderIndex: number,
): number {
  let bestSpan = -1;
  let bestAcross = 0;
  for (let face = 0; face < derived.faces.length; face += 1) {
    const next = modifierBevelConsiderGirderFace(source, derived, girderIndex, face, bestSpan, bestAcross);
    bestSpan = next.span;
    bestAcross = next.across;
  }
  return bestAcross;
}

/**
 * Keeps the widest profile face seen so far.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param girderIndex Girder index.
 * @param faceIndex Candidate face.
 * @param bestSpan Widest fraction so far.
 * @param bestAcross Profile length for that face.
 * @returns Updated span and profile length.
 */
function modifierBevelConsiderGirderFace(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  girderIndex: number,
  faceIndex: number,
  bestSpan: number,
  bestAcross: number,
): { span: number; across: number } {
  if ((derived.girderOfFace[faceIndex] ?? -1) !== girderIndex) return { span: bestSpan, across: bestAcross };
  const chart = modifierBevelGirderSurface(source, derived, faceIndex);
  if (!chart) return { span: bestSpan, across: bestAcross };
  const span = modifierBevelFaceVSpan(derived, faceIndex, chart);
  if (span <= bestSpan) return { span: bestSpan, across: bestAcross };
  return { span, across: modifierBevelRowLength(chart.v) };
}

/**
 * Returns the V range of one face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param matrix UV matrix.
 * @returns Highest V minus lowest V.
 */
function modifierBevelFaceVSpan(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
): number {
  const loop = derived.localBrush.faces[faceIndex];
  const points = loop ? derived.localBrush.getFaceVertices(loop) : [];
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const sample = matrix.project(point).v;
    low = Math.min(low, sample);
    high = Math.max(high, sample);
  }
  return Number.isFinite(low) ? high - low : 0;
}

/**
 * Returns the length of one UV row.
 *
 * @param row UV row.
 * @returns Length of the spatial gradient.
 */
function modifierBevelRowLength(row: Vector4): number {
  return Math.hypot(row.x, row.y, row.z);
}

/**
 * Builds the rotated trim or stretch matrix.
 *
 * @param matrix Unrotated chart.
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param lengthOverProfile Length density divided by profile density.
 * @param profileOverLength Profile density divided by length density.
 * @param pivot UV point that stays fixed.
 * @returns Rotated chart.
 */
function modifierBevelGirderTurnedMatrix(
  matrix: SurfaceUvMatrix,
  cos: number,
  sin: number,
  lengthOverProfile: number,
  profileOverLength: number,
  pivot: ModifierBevelUvPivotPoint,
): SurfaceUvMatrix {
  return new SurfaceUvMatrix(
    modifierBevelGirderU(matrix, cos, sin, lengthOverProfile, pivot),
    modifierBevelGirderV(matrix, cos, sin, profileOverLength, pivot),
  );
}

/**
 * Builds the rotated U row.
 *
 * @param matrix Unrotated chart.
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param lengthOverProfile Length density divided by profile density.
 * @param pivot UV point that stays fixed.
 * @returns U row.
 */
function modifierBevelGirderU(
  matrix: SurfaceUvMatrix,
  cos: number,
  sin: number,
  lengthOverProfile: number,
  pivot: ModifierBevelUvPivotPoint,
): Vector4 {
  const shift = modifierBevelGirderShiftU(cos, sin, lengthOverProfile, pivot);
  return modifierBevelMixGirderRow(matrix.u, matrix.v, cos, sin * lengthOverProfile, shift);
}

/**
 * Builds the rotated V row.
 *
 * @param matrix Unrotated chart.
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param profileOverLength Profile density divided by length density.
 * @param pivot UV point that stays fixed.
 * @returns V row.
 */
function modifierBevelGirderV(
  matrix: SurfaceUvMatrix,
  cos: number,
  sin: number,
  profileOverLength: number,
  pivot: ModifierBevelUvPivotPoint,
): Vector4 {
  const shift = modifierBevelGirderShiftV(cos, sin, profileOverLength, pivot);
  return modifierBevelMixGirderRow(matrix.u, matrix.v, -sin * profileOverLength, cos, shift);
}

/**
 * Returns the U shift that keeps the pivot fixed.
 *
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param lengthOverProfile Length density divided by profile density.
 * @param pivot UV point that stays fixed.
 * @returns Translation added to U.
 */
function modifierBevelGirderShiftU(
  cos: number,
  sin: number,
  lengthOverProfile: number,
  pivot: ModifierBevelUvPivotPoint,
): number {
  return pivot.u - cos * pivot.u - sin * pivot.v * lengthOverProfile;
}

/**
 * Returns the V shift that keeps the pivot fixed.
 *
 * @param cos Cosine of the rotation.
 * @param sin Sine of the rotation.
 * @param profileOverLength Profile density divided by length density.
 * @param pivot UV point that stays fixed.
 * @returns Translation added to V.
 */
function modifierBevelGirderShiftV(
  cos: number,
  sin: number,
  profileOverLength: number,
  pivot: ModifierBevelUvPivotPoint,
): number {
  return pivot.v + sin * pivot.u * profileOverLength - cos * pivot.v;
}

/**
 * Mixes two UV rows and adds a translation.
 *
 * @param left First row.
 * @param right Second row.
 * @param leftWeight Weight of the first row.
 * @param rightWeight Weight of the second row.
 * @param shift Translation added to the row.
 * @returns Mixed row.
 */
function modifierBevelMixGirderRow(
  left: Vector4,
  right: Vector4,
  leftWeight: number,
  rightWeight: number,
  shift: number,
): Vector4 {
  return new Vector4(
    left.x * leftWeight + right.x * rightWeight,
    left.y * leftWeight + right.y * rightWeight,
    left.z * leftWeight + right.z * rightWeight,
    left.w * leftWeight + right.w * rightWeight + shift,
  );
}
