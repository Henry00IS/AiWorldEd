import type { Vector3 } from 'three';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelRecordUsesVolumeTexture } from './modifier_bevel_face_record.js';
import { modifierBevelLayoutSurface } from './modifier_bevel_uv_layout.js';
import { modifierBevelStitchCap } from './modifier_bevel_uv_layout_cap.js';
import { modifierBevelCornerDonor } from './modifier_bevel_uv_layout_corner.js';
import { modifierBevelUnplacedMatrix } from './modifier_bevel_uv_unplaced.js';
import { modifierBevelTurnGirderChart } from './modifier_bevel_uv_girder_turn.js';
import { modifierBevelPlacementPivot } from './modifier_bevel_uv_pivot.js';
import { modifierBevelFaceStitches, modifierBevelFaceUsesLayout } from './modifier_bevel_uv_target.js';
import {
  modifierBevelPlacementWasApplied,
  modifierBevelRotatePlacement,
  modifierBevelScaleOffsetPlacement,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import { modifierBevelSmearSurface } from './modifier_bevel_surface_smear.js';

/**
 * Builds a compile-only instance whose brush is the chamfer and whose surfaces
 * match it. The authored instance is not modified.
 *
 * @param source Authored instance.
 * @param derived Chamfered local brush and face records.
 * @returns Stand-in sharing the source mesh and id.
 */
export function modifierBevelCreateStandIn(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
): SolidBrushInstance {
  const standIn = new SolidBrushInstance(source.id, source.name, derived.localBrush, source.operation);
  standIn.mesh = source.mesh;
  standIn.position.copy(source.position);
  standIn.rotation.copy(source.rotation);
  standIn.scale.copy(source.scale);
  standIn.visible = source.visible;
  standIn.restoreFaceSurfaces(source.serializeDefaultSurface(), modifierBevelStandInSurfaces(source, derived));
  return standIn;
}

/**
 * Resolves one face surface for a derived face from the live authored brush.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param memo Surfaces already resolved for this brush.
 * @returns Surface to bake.
 */
export function modifierBevelResolveDerivedSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  memo: Map<number, FaceSurfaceDescription> = new Map(),
): FaceSurfaceDescription {
  const cached = memo.get(faceIndex);
  if (cached) return modifierBevelFinishSurface(source, derived, faceIndex, cached, memo);
  const cap = modifierBevelChooseCap(source, derived, faceIndex);
  if (cap) return modifierBevelFinishSurface(source, derived, faceIndex, cap, memo);
  if (modifierBevelFaceUsesLayout(derived, faceIndex)) {
    return modifierBevelStoreLayoutSurface(source, derived, faceIndex, memo);
  }
  const recorded = modifierBevelStoreRecordedSurface(source, derived, faceIndex, memo);
  return modifierBevelFinishSurface(source, derived, faceIndex, recorded, memo);
}

/**
 * Stitches a corner cap to its neighboring strip.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns Cap surface, or null when this face is not stitched.
 */
function modifierBevelChooseCap(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): FaceSurfaceDescription | null {
  if (!modifierBevelFaceStitches(derived, faceIndex)) return null;
  return modifierBevelTryStitch(source, derived, faceIndex) ?? modifierBevelParentCap(source, derived, faceIndex);
}

/**
 * Returns the parent surface when a cap has no strip to copy.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Corner cap.
 * @returns Parent surface.
 */
function modifierBevelParentCap(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): FaceSurfaceDescription {
  const parent = derived.faces[faceIndex]?.parentSurfaceIndex ?? 0;
  return source.getFaceSurface(parent);
}

/**
 * Stitches a corner cap to the strip that shares its longest edge.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns Cap surface, or null when this face keeps another placement.
 */
function modifierBevelTryStitch(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): FaceSurfaceDescription | null {
  if (!modifierBevelFaceStitches(derived, faceIndex)) return null;
  const donor = modifierBevelCornerDonor(derived, faceIndex);
  if (donor < 0) return null;
  const donorUv = modifierBevelUnplacedMatrix(source, derived, donor, donor);
  if (!donorUv) return null;
  return modifierBevelStitchedSurface(source, derived, faceIndex, donor, donorUv);
}

/**
 * Builds the stitched cap surface.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Corner cap.
 * @param donor Strip the corner copies.
 * @param donorUv Unplaced strip matrix.
 * @returns Cap surface, or null when the cap misses the strip.
 */
function modifierBevelStitchedSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  donor: number,
  donorUv: SurfaceUvMatrix,
): FaceSurfaceDescription | null {
  const uv = modifierBevelStitchCap(derived, faceIndex, donor, donorUv);
  if (!uv) return null;
  const parent = derived.faces[faceIndex]?.parentSurfaceIndex ?? 0;
  return { textureId: source.getFaceSurface(parent).textureId, uv };
}

/**
 * Stores a layout surface for one generated face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param memo Resolved surfaces.
 * @returns Surface to bake.
 */
function modifierBevelStoreLayoutSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  memo: Map<number, FaceSurfaceDescription>,
): FaceSurfaceDescription {
  const continued = source.getFaceSurface(derived.faces[faceIndex]?.parentSurfaceIndex ?? 0);
  const surface = modifierBevelLayoutSurface(source, derived, faceIndex, continued);
  return modifierBevelFinishSurface(source, derived, faceIndex, surface, memo);
}

/**
 * Applies a volume texture to a generated face and stores the result.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param surface Surface before the volume texture.
 * @param memo Resolved surfaces.
 * @returns Surface to bake.
 */
function modifierBevelFinishSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  surface: FaceSurfaceDescription,
  memo: Map<number, FaceSurfaceDescription>,
): FaceSurfaceDescription {
  const painted = modifierBevelPaintGenerated(derived, faceIndex, surface);
  const adjusted = modifierBevelAdjustGenerated(source, derived, faceIndex, painted);
  memo.set(faceIndex, adjusted);
  return adjusted;
}

/**
 * Applies the volume's scale and offset after a single rotation.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param surface Surface before the scale and offset.
 * @returns Adjusted surface, or the same surface when nothing changes.
 */
function modifierBevelAdjustGenerated(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  surface: FaceSurfaceDescription,
): FaceSurfaceDescription {
  const record = derived.faces[faceIndex];
  if (!modifierBevelRecordUsesVolumeTexture(record)) return surface;
  if (modifierBevelPlacementWasApplied(surface.uv)) return surface;
  const turned = modifierBevelTurnFreshSurface(source, derived, faceIndex, surface.uv);
  const uv = modifierBevelScaleOffsetPlacement(turned, derived.placement);
  if (uv === surface.uv) return surface;
  return { textureId: surface.textureId, uv };
}

/**
 * Rotates a chart that has not already been rotated at its source.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param matrix Unrotated chart.
 * @returns Rotated chart, or the same matrix when the fold already carries the
 *   turn.
 */
function modifierBevelTurnFreshSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  matrix: SurfaceUvMatrix,
): SurfaceUvMatrix {
  if (modifierBevelFoldCarriesRotation(derived, faceIndex)) return matrix;
  const pivot = modifierBevelPlacementPivot(derived, faceIndex, matrix);
  const turned = modifierBevelTurnGirderChart(source, derived, faceIndex, matrix, pivot);
  return turned ?? modifierBevelRotatePlacement(matrix, derived.placement, pivot);
}

/**
 * Returns whether the fold already rotated this face's source.
 *
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns True when another rotation would turn the texture twice.
 */
function modifierBevelFoldCarriesRotation(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  if (modifierBevelFaceUsesLayout(derived, faceIndex)) return false;
  if (modifierBevelFaceStitches(derived, faceIndex)) return true;
  return (derived.faces[faceIndex]?.smearFromDerivedIndex ?? -1) >= 0;
}

/**
 * Replaces the texture on a generated face when the volume names one.
 *
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param surface Surface before the volume texture.
 * @returns Painted surface, or the same surface when nothing changes.
 */
function modifierBevelPaintGenerated(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  surface: FaceSurfaceDescription,
): FaceSurfaceDescription {
  const textureId = derived.textureId;
  const generated = modifierBevelRecordUsesVolumeTexture(derived.faces[faceIndex]);
  if (!textureId || !generated || surface.textureId === textureId) return surface;
  return { textureId, uv: surface.uv };
}

/**
 * Stores the recorded strip smear for a face that is not a corner cap.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @param memo Resolved surfaces.
 * @returns Surface to bake.
 */
function modifierBevelStoreRecordedSurface(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  memo: Map<number, FaceSurfaceDescription>,
): FaceSurfaceDescription {
  const record = derived.faces[faceIndex];
  const parent = record?.parentSurfaceIndex ?? 0;
  const authored = source.getFaceSurface(parent);
  if (!record?.chamferEdge || record.smearFromDerivedIndex < 0) {
    memo.set(faceIndex, authored);
    return authored;
  }
  const smeared = modifierBevelSmearFromRecord(source, derived, record, authored, faceIndex);
  memo.set(faceIndex, smeared);
  return smeared;
}

/**
 * Smears the rotated source face across this generated face.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param record Face inherit record.
 * @param authored Authored surface for the parent face.
 * @param faceIndex Face being smeared onto.
 * @returns Smeared surface.
 */
function modifierBevelSmearFromRecord(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  record: ModifierBevelDerivedBrush['faces'][number],
  authored: FaceSurfaceDescription,
  faceIndex: number,
): FaceSurfaceDescription {
  const fromUv = modifierBevelUnplacedMatrix(source, derived, record.smearFromDerivedIndex, faceIndex);
  const fromNormal = modifierBevelSmearSourceNormal(
    source,
    derived,
    record.smearFromDerivedIndex,
    record.parentSurfaceIndex,
  );
  if (!record.chamferEdge || !fromUv) return authored;
  return modifierBevelSmearSurface({ textureId: authored.textureId, uv: fromUv }, fromNormal, record.chamferEdge);
}

/**
 * Returns the normal of the face being smeared from.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @param fromIndex Derived source face.
 * @param parentSurfaceIndex Authored parent index.
 * @returns Unit normal.
 */
function modifierBevelSmearSourceNormal(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  fromIndex: number,
  parentSurfaceIndex: number,
): Vector3 {
  const fromRecord = derived.faces[fromIndex];
  if (!fromRecord?.chamferEdge) {
    return (
      source.brush.planes[parentSurfaceIndex]?.normal ?? source.getFaceSurface(parentSurfaceIndex).uv.planeNormal()
    );
  }
  return derived.localBrush.planes[fromIndex]?.normal ?? fromRecord.chamferEdge.destNormal;
}

/**
 * Builds the stand-in face surface list.
 *
 * @param source Authored instance.
 * @param derived Derived brush.
 * @returns Surfaces aligned with derived faces.
 */
function modifierBevelStandInSurfaces(
  source: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
): FaceSurfaceDescription[] {
  const memo = new Map<number, FaceSurfaceDescription>();
  return derived.faces.map((_, index) => modifierBevelResolveDerivedSurface(source, derived, index, memo));
}
