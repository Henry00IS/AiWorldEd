/**
 * Character-local IK control targets sampled from reference/character-jump.glb
 * after the same height normalize used by the play-mode character (1.75 m).
 *
 * Limbs only: feet, knee poles, hands, elbow poles. Torso stays at rest so the
 * jump silhouette comes entirely from two-bone IK, not bone euler overrides.
 */
export const PLAYER_LOCOMOTION_JUMP_POSE = {
  footLeft: { x: 0.0884, y: 0.1194, z: -0.0003 },
  footRight: { x: -0.0875, y: 0.2691, z: 0.3897 },
  kneePoleLeft: { x: 0.12, y: 0.4847, z: 0.16 },
  kneePoleRight: { x: -0.12, y: 0.6494, z: 0.38 },
  handLeft: { x: 0.4348, y: 1.1117, z: 0.1093 },
  handRight: { x: -0.3583, y: 1.0598, z: 0.4591 },
  elbowPoleLeft: { x: 0.42, y: 1.2, z: -0.05 },
  elbowPoleRight: { x: -0.42, y: 1.12, z: 0.22 },
} as const;
