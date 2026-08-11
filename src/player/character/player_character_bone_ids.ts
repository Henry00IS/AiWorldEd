/** Stable bone identifiers for the play-mode character rig. */
export const PLAYER_CHARACTER_BONE = {
  hips: 'hips',
  spine: 'spine',
  head: 'head',
  shoulderLeft: 'shoulder_left',
  upperArmLeft: 'upper_arm_left',
  lowerArmLeft: 'lower_arm_left',
  handLeft: 'hand_left',
  shoulderRight: 'shoulder_right',
  upperArmRight: 'upper_arm_right',
  lowerArmRight: 'lower_arm_right',
  handRight: 'hand_right',
  hipLeft: 'hip_left',
  upperLegLeft: 'upper_leg_left',
  lowerLegLeft: 'lower_leg_left',
  footLeft: 'foot_left',
  hipRight: 'hip_right',
  upperLegRight: 'upper_leg_right',
  lowerLegRight: 'lower_leg_right',
  footRight: 'foot_right',
} as const;

/** Bone identifier string union. */
export type PlayerCharacterBoneId = (typeof PLAYER_CHARACTER_BONE)[keyof typeof PLAYER_CHARACTER_BONE];
