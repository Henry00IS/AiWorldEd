import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelProfileStrip } from './modifier_bevel_uv_layout_profile.js';

/**
 * Returns whether a generated face uses a layout matrix instead of a fold.
 *
 * @param derived Derived brush.
 * @param faceIndex Derived face index.
 * @returns True when the volume layout replaces the fold.
 */
export function modifierBevelFaceUsesLayout(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  const record = derived.faces[faceIndex];
  if (!record || derived.layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE) return false;
  return !!record.chamferEdge || record.cornerFace;
}

/**
 * Returns whether a corner cap should copy its neighboring strip.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns True when the cap is stitched instead of projected.
 */
export function modifierBevelFaceStitches(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  if (!modifierBevelCornerCap(derived, faceIndex) || modifierBevelGirderLayout(derived.layout)) return false;
  return !modifierBevelFaceProjects(derived.layout);
}

/**
 * Returns whether a layout charts length and profile from the authored edge.
 *
 * @param layout Volume layout.
 * @returns True for tile, trim, and stretch.
 */
function modifierBevelGirderLayout(layout: ModifierBevelUvLayout): boolean {
  return (
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH
  );
}

/**
 * Returns whether a face is a corner cap rather than a bevel strip.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns True when the face is a cap.
 */
function modifierBevelCornerCap(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  const record = derived.faces[faceIndex];
  return !!record?.cornerFace && !modifierBevelProfileStrip(derived, faceIndex);
}

/**
 * Returns whether a layout projects each face on its own.
 *
 * @param layout Volume layout.
 * @returns True for view projections and the parent projection.
 */
function modifierBevelFaceProjects(layout: ModifierBevelUvLayout): boolean {
  return (
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS ||
    layout === MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT
  );
}
