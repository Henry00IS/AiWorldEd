import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelRecordUsesVolumeTexture } from './modifier_bevel_face_record.js';
import { modifierBevelGirderForFace } from './modifier_bevel_profile_cylinder.js';

/**
 * Identifies generated faces outside any authored-edge profile strip.
 *
 * @param derived Derived brush.
 * @param faceIndex Derived face.
 */
export function modifierBevelIsCap(derived: ModifierBevelDerivedBrush, faceIndex: number): boolean {
  return (
    modifierBevelRecordUsesVolumeTexture(derived.faces[faceIndex]) &&
    modifierBevelGirderForFace(derived.localBrush, derived.girders, faceIndex) < 0
  );
}

/**
 * Chooses an optional cap texture before the general bevel texture.
 *
 * @param derived Derived brush.
 * @param faceIndex Derived face.
 */
export function modifierBevelGeneratedTexture(derived: ModifierBevelDerivedBrush, faceIndex: number): string {
  if (derived.options?.capTextureId && modifierBevelIsCap(derived, faceIndex)) return derived.options.capTextureId;
  return derived.textureId;
}
