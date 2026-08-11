/**
 * Named IK effectors for the play-mode character. The gait cycle drives feet
 * and knee poles; free arms and wall push drive hands and elbow poles.
 */
export const PLAYER_CHARACTER_CONTROL = {
  footLeft: 'foot_left',
  footRight: 'foot_right',
  kneePoleLeft: 'knee_pole_left',
  kneePoleRight: 'knee_pole_right',
  handLeft: 'hand_left',
  handRight: 'hand_right',
  elbowPoleLeft: 'elbow_pole_left',
  elbowPoleRight: 'elbow_pole_right',
} as const;

/** Control point identifier string union. */
export type PlayerCharacterControlId = (typeof PLAYER_CHARACTER_CONTROL)[keyof typeof PLAYER_CHARACTER_CONTROL];

/** All eight control ids in stable order. */
export const PLAYER_CHARACTER_CONTROL_IDS: readonly PlayerCharacterControlId[] = [
  PLAYER_CHARACTER_CONTROL.footLeft,
  PLAYER_CHARACTER_CONTROL.footRight,
  PLAYER_CHARACTER_CONTROL.kneePoleLeft,
  PLAYER_CHARACTER_CONTROL.kneePoleRight,
  PLAYER_CHARACTER_CONTROL.handLeft,
  PLAYER_CHARACTER_CONTROL.handRight,
  PLAYER_CHARACTER_CONTROL.elbowPoleLeft,
  PLAYER_CHARACTER_CONTROL.elbowPoleRight,
];
