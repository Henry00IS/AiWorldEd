import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT } from './player_locomotion_gait_config.js';
import { PLAYER_LOCOMOTION_JUMP_POSE } from './player_locomotion_jump_pose.js';
import { playerLocomotionPositiveHalfLift } from './player_locomotion_math.js';

/** Writes local free-ground and jump foot controls and tracks plant events. */
export class PlayerLocomotionGaitFootWriter {
  private footstepLeftPending: boolean;
  private footstepRightPending: boolean;
  private previousLeftFootAirborne: boolean;
  private previousRightFootAirborne: boolean;

  /** Creates a foot writer with no pending plant events. */
  constructor() {
    this.footstepLeftPending = false;
    this.footstepRightPending = false;
    this.previousLeftFootAirborne = false;
    this.previousRightFootAirborne = false;
  }

  /**
   * Consumes a pending left-foot plant event.
   *
   * @returns True when the left foot planted since the last consume.
   */
  consumeFootstepLeftPending(): boolean {
    const pending = this.footstepLeftPending;
    this.footstepLeftPending = false;
    return pending;
  }

  /**
   * Consumes a pending right-foot plant event.
   *
   * @returns True when the right foot planted since the last consume.
   */
  consumeFootstepRightPending(): boolean {
    const pending = this.footstepRightPending;
    this.footstepRightPending = false;
    return pending;
  }

  /** Clears plant bookkeeping for a new play session. */
  reset(): void {
    this.footstepLeftPending = false;
    this.footstepRightPending = false;
    this.previousLeftFootAirborne = false;
    this.previousRightFootAirborne = false;
  }

  /** Clears airborne tracking when leaving free walk for jump or wall. */
  clearAirborneTracking(): void {
    this.previousLeftFootAirborne = false;
    this.previousRightFootAirborne = false;
  }

  /**
   * Queues a plant event for the given foot.
   *
   * @param isLeft Left foot when true.
   */
  queueFootstep(isLeft: boolean): void {
    if (isLeft) {
      this.footstepLeftPending = true;
      return;
    }
    this.footstepRightPending = true;
  }

  /**
   * Writes jump-pose desired feet and knee poles.
   *
   * @param controls Control rig.
   */
  writeJumpFeet(controls: PlayerCharacterControlRig): void {
    const pose = PLAYER_LOCOMOTION_JUMP_POSE;
    controls.set(PLAYER_CHARACTER_CONTROL.footLeft, pose.footLeft.x, pose.footLeft.y, pose.footLeft.z);
    controls.set(PLAYER_CHARACTER_CONTROL.footRight, pose.footRight.x, pose.footRight.y, pose.footRight.z);
    controls.set(PLAYER_CHARACTER_CONTROL.kneePoleLeft, pose.kneePoleLeft.x, pose.kneePoleLeft.y, pose.kneePoleLeft.z);
    controls.set(
      PLAYER_CHARACTER_CONTROL.kneePoleRight,
      pose.kneePoleRight.x,
      pose.kneePoleRight.y,
      pose.kneePoleRight.z,
    );
  }

  /**
   * Places both feet under the hips in a rest plant.
   *
   * @param controls Control rig.
   */
  writeIdleFeet(controls: PlayerCharacterControlRig): void {
    const width = PLAYER_LOCOMOTION_GAIT.stanceWidthMeters;
    const groundY = PLAYER_LOCOMOTION_GAIT.footGroundYMeters;
    this.writeFoot(controls, true, width, groundY, 0);
    this.writeFoot(controls, false, -width, groundY, 0);
    this.writeKneePole(controls, true, width, 0, false);
    this.writeKneePole(controls, false, -width, 0, false);
  }

  /**
   * Writes a forward walk cycle with opposite foot phases.
   *
   * @param controls Control rig.
   * @param wantsRun True when the run stride should be used.
   * @param cyclePhaseRadians Shared cycle phase.
   */
  writeWalkFeet(controls: PlayerCharacterControlRig, wantsRun: boolean, cyclePhaseRadians: number): void {
    const stride = this.resolveStride(wantsRun);
    const height = this.resolveStepHeight(wantsRun);
    const width = PLAYER_LOCOMOTION_GAIT.stanceWidthMeters;
    this.writeCycledFoot(controls, true, cyclePhaseRadians, width, stride, height);
    this.writeCycledFoot(controls, false, cyclePhaseRadians + Math.PI, -width, stride, height);
  }

  /**
   * Writes one foot control in character-local space.
   *
   * @param controls Control rig.
   * @param isLeft Left foot when true.
   * @param x Local X.
   * @param y Local Y.
   * @param z Local Z.
   */
  writeFoot(controls: PlayerCharacterControlRig, isLeft: boolean, x: number, y: number, z: number): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.footLeft : PLAYER_CHARACTER_CONTROL.footRight;
    controls.set(id, x, y, z);
  }

  /**
   * Writes one knee pole.
   *
   * @param controls Control rig.
   * @param isLeft Left leg when true.
   * @param sideX Lateral offset.
   * @param alongZ Forward offset.
   * @param isSideStep Side-step pole style when true.
   */
  writeKneePole(
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
    sideX: number,
    alongZ: number,
    isSideStep: boolean,
  ): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.kneePoleLeft : PLAYER_CHARACTER_CONTROL.kneePoleRight;
    const out = isLeft ? PLAYER_LOCOMOTION_GAIT.kneePoleSideMeters : -PLAYER_LOCOMOTION_GAIT.kneePoleSideMeters;
    if (isSideStep) {
      controls.set(
        id,
        sideX + out * 0.35,
        PLAYER_LOCOMOTION_GAIT.sideStepKneePoleHeightMeters,
        alongZ + PLAYER_LOCOMOTION_GAIT.sideStepKneePoleForwardMeters,
      );
      return;
    }
    controls.set(id, sideX + out, PLAYER_LOCOMOTION_GAIT.kneePoleHeightMeters, alongZ);
  }

  /**
   * Writes one walk foot from phase.
   *
   * @param controls Control rig.
   * @param isLeft Left foot when true.
   * @param phaseRadians Limb phase.
   * @param sideX Stance X.
   * @param strideMeters Stride length.
   * @param stepHeightMeters Peak lift.
   */
  private writeCycledFoot(
    controls: PlayerCharacterControlRig,
    isLeft: boolean,
    phaseRadians: number,
    sideX: number,
    strideMeters: number,
    stepHeightMeters: number,
  ): void {
    const along = Math.sin(phaseRadians) * strideMeters;
    const liftFactor = playerLocomotionPositiveHalfLift(phaseRadians);
    const lift = liftFactor * stepHeightMeters;
    this.trackWalkFootPlant(isLeft, liftFactor);
    const groundY = PLAYER_LOCOMOTION_GAIT.footGroundYMeters + lift;
    this.writeFoot(controls, isLeft, sideX, groundY, along);
    this.writeKneePole(controls, isLeft, sideX, along + PLAYER_LOCOMOTION_GAIT.kneePoleForwardMeters, false);
  }

  /**
   * Raises a footstep when a walk/run swing foot returns to stance.
   *
   * @param isLeft Left foot when true.
   * @param liftFactor Current swing lift in [0, 1].
   */
  private trackWalkFootPlant(isLeft: boolean, liftFactor: number): void {
    const airborne = liftFactor > 0.08;
    if (isLeft) {
      if (this.previousLeftFootAirborne && !airborne) {
        this.queueFootstep(true);
      }
      this.previousLeftFootAirborne = airborne;
      return;
    }
    if (this.previousRightFootAirborne && !airborne) {
      this.queueFootstep(false);
    }
    this.previousRightFootAirborne = airborne;
  }

  /**
   * Resolves walk/run stride length.
   *
   * @param wantsRun True when the run stride should be used.
   * @returns Stride meters.
   */
  private resolveStride(wantsRun: boolean): number {
    if (wantsRun) {
      return PLAYER_LOCOMOTION_GAIT.runStrideMeters;
    }
    return PLAYER_LOCOMOTION_GAIT.walkStrideMeters;
  }

  /**
   * Resolves walk/run step height.
   *
   * @param wantsRun True when the run step height should be used.
   * @returns Step height meters.
   */
  private resolveStepHeight(wantsRun: boolean): number {
    if (wantsRun) {
      return PLAYER_LOCOMOTION_GAIT.runStepHeightMeters;
    }
    return PLAYER_LOCOMOTION_GAIT.walkStepHeightMeters;
  }
}
