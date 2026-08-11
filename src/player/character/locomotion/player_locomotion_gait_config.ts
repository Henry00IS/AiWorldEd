/**
 * Tunable gait dimensions for procedural IK locomotion. Values are meters or
 * seconds unless noted.
 */
export const PLAYER_LOCOMOTION_GAIT = {
  footGroundYMeters: 0.09,
  stanceWidthMeters: 0.08,
  walkStrideMeters: 0.28,
  runStrideMeters: 0.38,
  walkStepHeightMeters: 0.08,
  runStepHeightMeters: 0.12,
  walkCadenceRadiansPerMeter: 3.4,
  runCadenceRadiansPerMeter: 2.6,
  idleSwayRadiansPerSecond: 1.4,
  kneePoleHeightMeters: 0.42,
  kneePoleForwardMeters: 0.22,
  kneePoleSideMeters: 0.03,
  armSideMeters: 0.22,
  armHeightMeters: 0.82,
  armSwingAmplitudeMeters: 0.18,
  armSwingHeightMeters: 0.8,
  armElbowDropMeters: 0.16,
  armElbowOutMeters: 0.06,
  armElbowBehindMeters: 0.1,
  armElbowSwingFollow: 0.2,
  idleArmForwardMeters: 0.03,
  /**
   * Run arm base from reference/character-run.glb, plus soft opposite-phase
   * sway and spring-damped inertial trail so arms lag behind body velocity.
   */
  runArmSideMeters: 0.38,
  runArmBehindMeters: 0.08,
  runArmHeightMeters: 1.28,
  runArmSwingAmplitudeMeters: 0.06,
  runArmHeightBobMeters: 0.02,
  runArmSideSwayMeters: 0.02,
  runElbowOutMeters: 0.1,
  runElbowHeightDropMeters: 0.05,
  /** Elbow poles sit slightly behind the hand so the fold never leads forward. */
  runElbowBehindHandMeters: 0.05,
  /** Extra hand trail meters per m/s of planar speed. */
  runArmTrailMetersPerSpeed: 0.02,
  /** Cap on inertial hand trail meters. */
  runArmTrailMaxMeters: 0.24,
  /** Spring rate pulling trail toward the speed-based target. */
  runArmTrailSpringPerSecondSquared: 28,
  /** Damping on trail velocity. */
  runArmTrailDampingPerSecond: 11,
  wallHandHeightMeters: 1.22,
  wallHandSideMeters: 0.18,
  wallPalmFreeSpaceMeters: 0.01,
  wallElbowDropMeters: 0.28,
  wallElbowFreeSpaceMeters: 0.14,
  wallPalmOrientWeight: 0.35,
  /**
   * Max turn rate when the wall-hug normal switches (e.g. corner). Keeps palm
   * targets and hand orientation from snapping to the new wall.
   */
  wallNormalFollowRadiansPerSecond: 7,
  sideStepComfortLengthMeters: 0.26,
  sideStepMinLengthMeters: 0.16,
  /**
   * Hard cap on side-step length so the trail foot never sits half a meter
   * behind the hips while the lead opens.
   */
  sideStepMaxLengthMeters: 0.4,
  /** Extra meters of step length per m/s of planar speed. */
  sideStepLengthSpeedScale: 0.03,
  sideStepHeightMeters: 0.025,
  /**
   * Fraction of step length spent opening the lead foot; remainder closes the
   * trail.
   */
  sideStepOpenFraction: 0.55,
  sideStepKneePoleHeightMeters: 0.28,
  sideStepKneePoleForwardMeters: 0.05,
  /**
   * Wall-normal turn (radians) that forces plant reseed. Corners ~90° always
   * reseed so feet do not keep a 1m offset from the previous wall.
   */
  sideStepWallNormalReseedRadians: 0.6,
  /**
   * Base max speed control points may travel toward a new desired target (m/s).
   * Body-relative tracking uses a floor of planar speed so plants do not
   * slide.
   */
  controlFollowMaxSpeedMetersPerSecond: 10,
  /** Multiplier on planar speed for the control follow floor. */
  controlFollowBodySpeedScale: 1.25,
  /** Extra m/s above body speed so plants and swings keep up. */
  controlFollowBodySpeedSlackMetersPerSecond: 2.0,
  sideStepVelocitySignThreshold: 0.2,
  /** Min opposing lateral speed that aborts a step aimed the other way. */
  sideStepContraryVelocityMetersPerSecond: 0.35,
  /** Min opposing body travel that aborts a step aimed the other way. */
  sideStepContraryTravelMeters: 0.02,
  /** Max root travel treated as standing still while wall-stuck. */
  sideStepStationaryTravelMeters: 0.0005,
  /** Per-frame travel budget multiplier on planar/lateral speed * dt. */
  sideStepTravelBudgetScale: 1.5,
  /** Extra meters allowed in the per-frame travel budget. */
  sideStepTravelBudgetSlackMeters: 0.05,
  settleSpeedMetersPerSecond: 0.2,
  handInwardYawRadians: 0.3490658503988659,
} as const;

/**
 * Returns whether locomotion should use the jump/fall IK pose.
 *
 * Airborne bodies always use jump/fall feet so WASD while falling never plays a
 * walk cycle. Upward launch velocity is treated as air even before floor
 * contact clears, so the jump silhouette starts on the first frame of a hop.
 *
 * @param isGrounded Collision grounded flag.
 * @param verticalVelocity Vertical velocity meters per second (positive up).
 * @param _planarSpeed Unused; kept so call sites stay stable.
 * @returns True when jump/fall feet should be used.
 */
export function playerLocomotionIsBallisticAir(
  isGrounded: boolean,
  verticalVelocity: number = 0,
  _planarSpeed: number = 0,
): boolean {
  if (verticalVelocity >= 0.5) {
    return true;
  }
  return !isGrounded;
}
