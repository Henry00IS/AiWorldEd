import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT, playerLocomotionIsBallisticAir } from './player_locomotion_gait_config.js';
import { PLAYER_LOCOMOTION_JUMP_POSE } from './player_locomotion_jump_pose.js';

/** Arm pose drivers for free locomotion (not wall push). */
export interface PlayerLocomotionArmInput {
  cyclePhaseRadians: number;
  planarSpeed: number;
  wantsRun: boolean;
  isGrounded: boolean;
  /** Vertical velocity meters per second (positive up). */
  verticalVelocity: number;
  isSideStep: boolean;
  /** Frame delta for secondary arm trail physics. */
  deltaSeconds: number;
}

/**
 * Writes desired hand and elbow control points for idle, walk swing, run, and
 * jump. Control follow interpolates these into the live rig.
 *
 * Running uses a light opposite-phase sway plus spring-damped inertial trail so
 * arms lag behind planar velocity instead of pumping elbows forward.
 */
export class PlayerLocomotionControlArms {
  private armTrailMeters: number;
  private armTrailVelocity: number;

  /** Creates arm writers with settled trail state. */
  constructor() {
    this.armTrailMeters = 0;
    this.armTrailVelocity = 0;
  }

  /** Clears inertial trail state for a new play session. */
  reset(): void {
    this.settleArmTrail();
  }

  /**
   * Writes free-space arm desired targets from gait phase and speed.
   *
   * @param controls Control rig.
   * @param input Arm drivers.
   */
  write(controls: PlayerCharacterControlRig, input: PlayerLocomotionArmInput): void {
    if (playerLocomotionIsBallisticAir(input.isGrounded, input.verticalVelocity, input.planarSpeed)) {
      this.settleArmTrail();
      this.writeJumpArms(controls);
      return;
    }
    if (input.planarSpeed < PLAYER_LOCOMOTION_GAIT.settleSpeedMetersPerSecond) {
      this.tickArmTrail(0, input.deltaSeconds);
      this.writeIdleArms(controls);
      return;
    }
    if (input.isSideStep) {
      this.tickArmTrail(0, input.deltaSeconds);
      this.writeIdleArms(controls);
      return;
    }
    if (input.wantsRun && input.planarSpeed > 6) {
      this.tickArmTrail(input.planarSpeed, input.deltaSeconds);
      this.writeRunArms(controls, input.cyclePhaseRadians);
      return;
    }
    this.tickArmTrail(input.planarSpeed * 0.35, input.deltaSeconds);
    this.writeWalkArms(controls, input.cyclePhaseRadians);
  }

  /**
   * Writes jump-pose desired hands and elbows from the reference GLB sample.
   *
   * @param controls Control rig.
   */
  private writeJumpArms(controls: PlayerCharacterControlRig): void {
    const pose = PLAYER_LOCOMOTION_JUMP_POSE;
    this.writeHand(controls, true, pose.handLeft.x, pose.handLeft.y, pose.handLeft.z);
    this.writeHand(controls, false, pose.handRight.x, pose.handRight.y, pose.handRight.z);
    this.writeElbow(controls, true, pose.elbowPoleLeft.x, pose.elbowPoleLeft.y, pose.elbowPoleLeft.z);
    this.writeElbow(controls, false, pose.elbowPoleRight.x, pose.elbowPoleRight.y, pose.elbowPoleRight.z);
  }

  /**
   * Places arms in a relaxed hang near the hips.
   *
   * @param controls Control rig.
   */
  private writeIdleArms(controls: PlayerCharacterControlRig): void {
    const side = PLAYER_LOCOMOTION_GAIT.armSideMeters;
    const height = PLAYER_LOCOMOTION_GAIT.armHeightMeters;
    const forward = PLAYER_LOCOMOTION_GAIT.idleArmForwardMeters;
    this.writeHand(controls, true, side, height, forward);
    this.writeHand(controls, false, -side, height, forward);
    this.writeStableElbow(controls, true, 0);
    this.writeStableElbow(controls, false, 0);
  }

  /**
   * Opposite-leg arm swing for walking with stable elbow poles.
   *
   * @param controls Control rig.
   * @param phaseRadians Gait phase.
   */
  private writeWalkArms(controls: PlayerCharacterControlRig, phaseRadians: number): void {
    const leftSwing = Math.sin(phaseRadians + Math.PI);
    const rightSwing = Math.sin(phaseRadians);
    const amp = PLAYER_LOCOMOTION_GAIT.armSwingAmplitudeMeters;
    const height = PLAYER_LOCOMOTION_GAIT.armSwingHeightMeters;
    const side = PLAYER_LOCOMOTION_GAIT.armSideMeters;
    const trail = this.armTrailMeters;
    this.writeHand(controls, true, side, height + leftSwing * 0.02, leftSwing * amp - trail);
    this.writeHand(controls, false, -side, height + rightSwing * 0.02, rightSwing * amp - trail);
    this.writeStableElbow(controls, true, leftSwing);
    this.writeStableElbow(controls, false, rightSwing);
  }

  /**
   * Places both arms in a high tucked run pose with soft sway and inertial
   * trail.
   *
   * @param controls Control rig.
   * @param phaseRadians Gait phase shared with the legs and torso.
   */
  private writeRunArms(controls: PlayerCharacterControlRig, phaseRadians: number): void {
    const leftSwing = Math.sin(phaseRadians + Math.PI);
    const rightSwing = Math.sin(phaseRadians);
    this.writeRunArm(controls, true, leftSwing);
    this.writeRunArm(controls, false, rightSwing);
  }

  /**
   * Writes one run arm from a soft swing sine and the live inertial trail.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   * @param swingSin Swing sine in [-1, 1].
   */
  private writeRunArm(controls: PlayerCharacterControlRig, isLeft: boolean, swingSin: number): void {
    const sideSign = isLeft ? 1 : -1;
    const side =
      PLAYER_LOCOMOTION_GAIT.runArmSideMeters + swingSin * PLAYER_LOCOMOTION_GAIT.runArmSideSwayMeters * sideSign;
    const height =
      PLAYER_LOCOMOTION_GAIT.runArmHeightMeters + Math.max(0, swingSin) * PLAYER_LOCOMOTION_GAIT.runArmHeightBobMeters;
    const handZ =
      -PLAYER_LOCOMOTION_GAIT.runArmBehindMeters -
      this.armTrailMeters +
      swingSin * PLAYER_LOCOMOTION_GAIT.runArmSwingAmplitudeMeters;
    this.writeHand(controls, isLeft, sideSign * side, height, handZ);
    this.writeRunElbow(controls, isLeft, sideSign, height, handZ);
  }

  /**
   * Writes one run elbow pole outside and slightly behind the hand.
   *
   * Poles stay lateral so the hinge never flips; they do not lead the hand
   * forward through the cycle.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   * @param sideSign +1 left, -1 right.
   * @param handHeight Live hand height meters.
   * @param handZ Live hand forward meters.
   */
  private writeRunElbow(
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
    sideSign: number,
    handHeight: number,
    handZ: number,
  ): void {
    const out = PLAYER_LOCOMOTION_GAIT.runArmSideMeters + PLAYER_LOCOMOTION_GAIT.runElbowOutMeters;
    const height = handHeight - PLAYER_LOCOMOTION_GAIT.runElbowHeightDropMeters;
    const elbowZ = handZ - PLAYER_LOCOMOTION_GAIT.runElbowBehindHandMeters;
    this.writeElbow(controls, isLeft, sideSign * out, height, elbowZ);
  }

  /**
   * Places an elbow pole behind and outside the arm so the hinge never flips
   * when the hand crosses the middle of the swing.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   * @param swingSin Hand swing sine in [-1, 1].
   */
  private writeStableElbow(controls: PlayerCharacterControlRig, isLeft: boolean, swingSin: number): void {
    const side = PLAYER_LOCOMOTION_GAIT.armSideMeters;
    const out = side + PLAYER_LOCOMOTION_GAIT.armElbowOutMeters;
    const height = PLAYER_LOCOMOTION_GAIT.armSwingHeightMeters - PLAYER_LOCOMOTION_GAIT.armElbowDropMeters;
    const behind = -PLAYER_LOCOMOTION_GAIT.armElbowBehindMeters - this.armTrailMeters * 0.5;
    const follow =
      swingSin * PLAYER_LOCOMOTION_GAIT.armSwingAmplitudeMeters * PLAYER_LOCOMOTION_GAIT.armElbowSwingFollow;
    const x = isLeft ? out : -out;
    this.writeElbow(controls, isLeft, x, height, behind + follow);
  }

  /**
   * Advances spring-damped inertial trail from planar speed.
   *
   * Faster motion pulls the trail target backward; spring/damping keep the
   * response soft so arms fall back with velocity instead of snapping.
   *
   * @param planarSpeed Body planar speed meters per second.
   * @param deltaSeconds Frame delta.
   */
  private tickArmTrail(planarSpeed: number, deltaSeconds: number): void {
    const dt = Math.max(0, deltaSeconds);
    if (dt <= 1e-8) {
      return;
    }
    const target = this.resolveArmTrailTargetMeters(planarSpeed);
    const stiffness = PLAYER_LOCOMOTION_GAIT.runArmTrailSpringPerSecondSquared;
    const damping = PLAYER_LOCOMOTION_GAIT.runArmTrailDampingPerSecond;
    const acceleration = (target - this.armTrailMeters) * stiffness - this.armTrailVelocity * damping;
    this.armTrailVelocity += acceleration * dt;
    this.armTrailMeters += this.armTrailVelocity * dt;
    if (this.armTrailMeters < 0) {
      this.armTrailMeters = 0;
      this.armTrailVelocity = Math.max(0, this.armTrailVelocity);
    }
  }

  /**
   * Resolves how far arms should lag behind from planar speed.
   *
   * @param planarSpeed Body planar speed meters per second.
   * @returns Desired trail meters (positive = behind).
   */
  private resolveArmTrailTargetMeters(planarSpeed: number): number {
    const raw = Math.max(0, planarSpeed) * PLAYER_LOCOMOTION_GAIT.runArmTrailMetersPerSpeed;
    return Math.min(raw, PLAYER_LOCOMOTION_GAIT.runArmTrailMaxMeters);
  }

  /** Clears trail state when leaving grounded locomotion. */
  private settleArmTrail(): void {
    this.armTrailMeters = 0;
    this.armTrailVelocity = 0;
  }

  /**
   * Writes one hand control in character-local space.
   *
   * @param controls Control rig.
   * @param isLeft Left hand.
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   */
  private writeHand(controls: PlayerCharacterControlRig, isLeft: boolean, x: number, y: number, z: number): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.handLeft : PLAYER_CHARACTER_CONTROL.handRight;
    controls.set(id, x, y, z);
  }

  /**
   * Writes one elbow pole in character-local space.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   */
  private writeElbow(controls: PlayerCharacterControlRig, isLeft: boolean, x: number, y: number, z: number): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.elbowPoleLeft : PLAYER_CHARACTER_CONTROL.elbowPoleRight;
    controls.set(id, x, y, z);
  }
}
