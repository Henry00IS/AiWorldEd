import { Vector3 } from 'three';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  modifierBevelRotatePlacement,
  modifierBevelRotationIsIdle,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import { MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';
import { modifierBevelSmearSurface } from './modifier_bevel_surface_smear.js';
import { modifierBevelFaceMatrix } from './modifier_bevel_uv_layout.js';
import { modifierBevelPlacementPivot } from './modifier_bevel_uv_pivot.js';
import { modifierBevelFaceUsesLayout } from './modifier_bevel_uv_target.js';

/**
 * Returns the UV a fold copies, with volume rotation applied at the source.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face the fold copies from.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @returns UV matrix, or null when the face has no surface.
 */
export function modifierBevelUnplacedMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  curveFace: number,
): SurfaceUvMatrix | null {
  if (modifierBevelFaceUsesLayout(derived, faceIndex)) return modifierBevelLayoutUv(source, derived, faceIndex);
  return modifierBevelRawSmearMatrix(source, derived, faceIndex, curveFace, new Set());
}

/**
 * Returns the layout matrix of one face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @returns Layout matrix.
 */
function modifierBevelLayoutUv(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix | null {
  const parent = derived.faces[faceIndex]?.parentSurfaceIndex ?? 0;
  return modifierBevelFaceMatrix(source, derived, faceIndex, source.getFaceSurface(parent));
}

/**
 * Folds the rotated parent texture across a strip.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @param seen Faces already entered on this walk.
 * @returns Smeared matrix.
 */
function modifierBevelRawSmearMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  curveFace: number,
  seen: Set<number>,
): SurfaceUvMatrix | null {
  if (seen.has(faceIndex)) return modifierBevelTurnedRoot(source, derived, faceIndex, curveFace);
  seen.add(faceIndex);
  return modifierBevelSmearLinked(source, derived, faceIndex, curveFace, seen);
}

/**
 * Smears across the recorded source, or returns the rotated parent.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Generated face index.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @param seen Faces already entered on this walk.
 * @returns Smeared matrix.
 */
function modifierBevelSmearLinked(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  curveFace: number,
  seen: Set<number>,
): SurfaceUvMatrix | null {
  const record = derived.faces[faceIndex];
  const authored = modifierBevelTurnedRoot(source, derived, faceIndex, curveFace);
  if (!record?.chamferEdge || record.smearFromDerivedIndex < 0 || !authored) return authored;
  return modifierBevelSmearOnto(source, derived, record, authored, curveFace, seen);
}

/**
 * Smears a source matrix across one chamfer edge.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param record Face inherit record.
 * @param authored Parent UV matrix.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @param seen Faces already entered on this walk.
 * @returns Smeared matrix.
 */
function modifierBevelSmearOnto(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  record: ModifierBevelFaceRecord,
  authored: SurfaceUvMatrix,
  curveFace: number,
  seen: Set<number>,
): SurfaceUvMatrix | null {
  const fromUv = modifierBevelRawSourceMatrix(source, derived, record.smearFromDerivedIndex, curveFace, seen);
  if (!fromUv || !record.chamferEdge) return authored;
  return modifierBevelSmearCopied(source, derived, record, fromUv);
}

/**
 * Copies one source matrix across a chamfer edge.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param record Face inherit record.
 * @param fromUv Source matrix.
 * @returns Smeared matrix.
 */
function modifierBevelSmearCopied(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  record: ModifierBevelFaceRecord,
  fromUv: SurfaceUvMatrix,
): SurfaceUvMatrix | null {
  if (!record.chamferEdge) return fromUv;
  const smeared = modifierBevelSmearSurface(
    { textureId: '', uv: fromUv },
    modifierBevelRawNormal(source, derived, record),
    record.chamferEdge,
  );
  return smeared.uv;
}

/**
 * Returns the UV a smear step copies from.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Source face index.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @param seen Faces already entered on this walk.
 * @returns Source matrix.
 */
function modifierBevelRawSourceMatrix(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  curveFace: number,
  seen: Set<number>,
): SurfaceUvMatrix | null {
  if (modifierBevelFaceUsesLayout(derived, faceIndex)) return modifierBevelLayoutUv(source, derived, faceIndex);
  const record = derived.faces[faceIndex];
  if (!record?.chamferEdge) return modifierBevelTurnedRoot(source, derived, faceIndex, curveFace);
  return modifierBevelRawSmearMatrix(source, derived, faceIndex, curveFace, seen);
}

/**
 * Rotates the authored parent about the curve pivot.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face whose parent is rotated.
 * @param curveFace Face whose curve supplies the rotation pivot.
 * @returns Rotated parent matrix, or null when the parent is missing.
 */
function modifierBevelTurnedRoot(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  curveFace: number,
): SurfaceUvMatrix | null {
  const matrix = modifierBevelParentUv(source, derived, faceIndex);
  if (!matrix) return null;
  const pivot = modifierBevelRootPivot(source, derived, curveFace, matrix);
  return modifierBevelRotatePlacement(matrix, derived.placement, pivot);
}

/**
 * Returns the pivot in the matrix that is about to rotate.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param curveFace Face whose curve supplies the pivot.
 * @param matrix Parent matrix.
 * @returns Pivot in that matrix.
 */
function modifierBevelRootPivot(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  curveFace: number,
  matrix: SurfaceUvMatrix,
): { u: number; v: number } {
  const chart = modifierBevelCenterChart(source, derived, curveFace);
  return modifierBevelPlacementPivot(derived, curveFace, chart ?? matrix);
}

/**
 * Returns the unrotated continuation used to measure a center pivot.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param curveFace Face whose curve is measured.
 * @returns Continuation, or null when the pivot is not the center.
 */
function modifierBevelCenterChart(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  curveFace: number,
): SurfaceUvMatrix | null {
  if (!modifierBevelUsesCenterChart(derived)) return null;
  return modifierBevelIdleChart(source, derived, curveFace);
}

/**
 * Returns whether the center pivot needs the unrotated continuation.
 *
 * @param derived Derived brush.
 * @returns True when the pivot is the center and the rotation is active.
 */
function modifierBevelUsesCenterChart(derived: ModifierBevelDerivedBrush): boolean {
  if (derived.placement.uvPivot !== MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER) return false;
  return !modifierBevelRotationIsIdle(derived.placement.uvRotation);
}

/**
 * Folds the curve with rotation forced off.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param curveFace Face whose curve is measured.
 * @returns Unrotated continuation.
 */
function modifierBevelIdleChart(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  curveFace: number,
): SurfaceUvMatrix | null {
  const placement = derived.placement;
  derived.placement = { ...placement, uvRotation: 0 };
  try {
    return modifierBevelRawSmearMatrix(source, derived, curveFace, curveFace, new Set());
  } finally {
    derived.placement = placement;
  }
}

/**
 * Returns the authored UV of one derived face's parent.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns Parent UV matrix.
 */
function modifierBevelParentUv(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): SurfaceUvMatrix | null {
  return source.getFaceSurface(derived.faces[faceIndex]?.parentSurfaceIndex ?? 0).uv;
}

/**
 * Returns the normal of the face being smeared from.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param record Face inherit record.
 * @returns Unit normal.
 */
function modifierBevelRawNormal(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  record: ModifierBevelFaceRecord,
): Vector3 {
  const edge = record.chamferEdge;
  const fromIndex = record.smearFromDerivedIndex;
  const fromRecord = derived.faces[fromIndex];
  if (!edge || !fromRecord?.chamferEdge) return modifierBevelAuthoredNormal(source, record.parentSurfaceIndex);
  return derived.localBrush.planes[fromIndex]?.normal ?? edge.destNormal;
}

/**
 * Returns an authored face normal.
 *
 * @param source Authored instance.
 * @param parentSurfaceIndex Authored parent index.
 * @returns Unit normal.
 */
function modifierBevelAuthoredNormal(source: SolidBrushInstance, parentSurfaceIndex: number): Vector3 {
  return source.brush.planes[parentSurfaceIndex]?.normal.clone() ?? new Vector3(0, 1, 0);
}
