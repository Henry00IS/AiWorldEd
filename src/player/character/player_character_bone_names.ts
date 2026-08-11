import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from './player_character_bone_ids.js';

/**
 * Maps GLB skeleton bone names onto stable play-mode bone ids.
 *
 * The simplified character uses LowerSpine/UpperSpine, separate HipL/HipR, and
 * shoulder bones. Three.js keeps these names as authored (no dots to strip).
 */
const GLB_BONE_NAME_TO_ID: Readonly<Record<string, PlayerCharacterBoneId>> = {
  LowerSpine: PLAYER_CHARACTER_BONE.hips,
  UpperSpine: PLAYER_CHARACTER_BONE.spine,
  Head: PLAYER_CHARACTER_BONE.head,
  ShoulderL: PLAYER_CHARACTER_BONE.shoulderLeft,
  UpperArmL: PLAYER_CHARACTER_BONE.upperArmLeft,
  LowerArmL: PLAYER_CHARACTER_BONE.lowerArmLeft,
  HandL: PLAYER_CHARACTER_BONE.handLeft,
  ShoulderR: PLAYER_CHARACTER_BONE.shoulderRight,
  UpperArmR: PLAYER_CHARACTER_BONE.upperArmRight,
  LowerArmR: PLAYER_CHARACTER_BONE.lowerArmRight,
  HandR: PLAYER_CHARACTER_BONE.handRight,
  HipL: PLAYER_CHARACTER_BONE.hipLeft,
  UpperLegL: PLAYER_CHARACTER_BONE.upperLegLeft,
  LowerLegL: PLAYER_CHARACTER_BONE.lowerLegLeft,
  FootL: PLAYER_CHARACTER_BONE.footLeft,
  HipR: PLAYER_CHARACTER_BONE.hipRight,
  UpperLegR: PLAYER_CHARACTER_BONE.upperLegRight,
  LowerLegR: PLAYER_CHARACTER_BONE.lowerLegRight,
  FootR: PLAYER_CHARACTER_BONE.footRight,
};

/**
 * Resolves a loaded skeleton bone name to a play-mode bone id when mapped.
 *
 * @param boneName Skeleton bone name from the loaded model.
 * @returns Mapped bone id, or null when the bone is unused by play-mode
 *   systems.
 */
export function playerCharacterBoneIdFromGlbName(boneName: string): PlayerCharacterBoneId | null {
  const mapped = GLB_BONE_NAME_TO_ID[boneName];
  if (mapped === undefined) {
    return null;
  }
  return mapped;
}
