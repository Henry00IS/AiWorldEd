import type * as THREE from 'three';
import { playerCharacterApplyBaseLocomotionPose } from './player_character_pose_mixer.js';
import {
  playerCharacterApplyPoseWeightsFromState,
  playerCharacterCreatePoseWeights,
  type PlayerCharacterPoseWeights,
} from './player_character_pose_weights.js';
import { PlayerCharacterControlRig } from './player_character_control_rig.js';
import { PlayerCharacterControlIk } from './player_character_control_ik.js';
import type { PlayerCharacterRig } from './player_character_rig.js';
import { PlayerLocomotionSystem } from './locomotion/player_locomotion_system.js';
import { PLAYER_LOCOMOTION_GAIT } from './locomotion/player_locomotion_gait_config.js';
import type { PlayerLocomotionBody, PlayerLocomotionFootstepSink } from './locomotion/player_locomotion_body.js';
import type { PlayerLocomotionStateId } from './locomotion/state/player_locomotion_state_id.js';

/**
 * Applies an extra pose between the base locomotion pose and the limb IK (for
 * example a remote player's head look).
 */
export type PlayerCharacterAnimatorOverlay = (rig: PlayerCharacterRig) => void;

/**
 * The character's animation: exclusive locomotion states (walk, run, idle, wall
 * push, jump, fall, land), the torso pose and the limb IK. Shared by the local
 * play-mode avatar and remote collaborators' characters.
 */
export class PlayerCharacterAnimator {
  private readonly controls: PlayerCharacterControlRig;
  private readonly controlIk: PlayerCharacterControlIk;
  private readonly locomotion: PlayerLocomotionSystem;
  private readonly poseWeights: PlayerCharacterPoseWeights;

  /**
   * Creates an animator in the idle state.
   *
   * @param footstep Receives planted feet (default: the local player's footstep
   *   event).
   */
  constructor(footstep?: PlayerLocomotionFootstepSink) {
    this.controls = new PlayerCharacterControlRig();
    this.controlIk = new PlayerCharacterControlIk();
    this.locomotion = new PlayerLocomotionSystem(footstep);
    this.poseWeights = playerCharacterCreatePoseWeights();
  }

  /** Returns to idle and forgets gait and limb state. */
  reset(): void {
    this.locomotion.reset();
    playerCharacterApplyPoseWeightsFromState(this.poseWeights, 'idle');
  }

  /**
   * Returns the active locomotion state.
   *
   * @returns State id.
   */
  getState(): PlayerLocomotionStateId {
    return this.locomotion.getState();
  }

  /**
   * Advances the locomotion state, the limb targets and the footsteps.
   *
   * @param root Character root, already placed at the feet and facing.
   * @param body Motion of the body.
   * @param deltaSeconds Frame delta.
   */
  update(root: THREE.Object3D, body: PlayerLocomotionBody, deltaSeconds: number): void {
    this.locomotion.update(this.controls, root, body, deltaSeconds);
    playerCharacterApplyPoseWeightsFromState(
      this.poseWeights,
      this.locomotion.getState(),
      this.locomotion.getUsesWallHands(),
    );
  }

  /**
   * Poses the skeleton: torso from the locomotion state, then the overlay, then
   * the legs and arms by IK (so hands stay planted when the overlay bends the
   * torso).
   *
   * @param rig Character rig.
   * @param body Motion of the body.
   * @param overlay Optional extra pose before the IK.
   */
  pose(rig: PlayerCharacterRig, body: PlayerLocomotionBody, overlay?: PlayerCharacterAnimatorOverlay): void {
    playerCharacterApplyBaseLocomotionPose(rig.bones, rig.restLocalQuaternions, {
      planarSpeed: body.getPlanarSpeed(),
      verticalVelocity: body.getVerticalVelocity(),
      cyclePhaseRadians: this.locomotion.getCyclePhaseRadians(),
      weights: this.poseWeights,
    });
    rig.root.updateMatrixWorld(true);
    if (overlay) {
      overlay(rig);
      rig.root.updateMatrixWorld(true);
    }
    this.solveLimbIk(rig);
  }

  /**
   * Solves legs and arms from control points, orienting palms on walls.
   *
   * @param rig Character rig.
   */
  private solveLimbIk(rig: PlayerCharacterRig): void {
    const wallNormal = this.locomotion.getWallNormalLocalOut();
    const palmOnWall = this.locomotion.getUsesWallHands() && wallNormal.lengthSq() > 1e-8;
    if (palmOnWall) {
      this.controlIk.apply(rig.bones, rig.restLocalQuaternions, rig.root, this.controls, {
        solveLegs: true,
        solveArms: true,
        handOrient: 'palm_wall',
        wallNormalLocalOut: wallNormal,
      });
      return;
    }
    this.controlIk.apply(rig.bones, rig.restLocalQuaternions, rig.root, this.controls, {
      solveLegs: true,
      solveArms: true,
      handOrient: 'palm_inward',
      handInwardYawRadians: PLAYER_LOCOMOTION_GAIT.handInwardYawRadians,
    });
  }
}
