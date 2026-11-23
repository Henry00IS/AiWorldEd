import * as THREE from 'three';
import { playerCharacterApplyBaseLocomotionPose } from './player_character_pose_mixer.js';
import {
  playerCharacterApplyPoseWeightsFromState,
  playerCharacterCreatePoseWeights,
  type PlayerCharacterPoseWeights,
} from './player_character_pose_weights.js';
import { PlayerCharacterControlRig } from './player_character_control_rig.js';
import { PlayerCharacterControlIk } from './player_character_control_ik.js';
import { PLAYER_CHARACTER_CONTROL } from './player_character_control_ids.js';
import type { PlayerCharacterHandTargets } from './player_character_hand_targets.js';
import type { PlayerCharacterRig } from './player_character_rig.js';
import { PlayerLocomotionSystem } from './locomotion/player_locomotion_system.js';
import { PLAYER_LOCOMOTION_GAIT } from './locomotion/player_locomotion_gait_config.js';
import type { PlayerLocomotionBody, PlayerLocomotionFootstepSink } from './locomotion/player_locomotion_body.js';
import type { PlayerLocomotionStateId } from './locomotion/state/player_locomotion_state_id.js';
import { PlayerCharacterRagdoll } from './player_character_ragdoll.js';
import { PLAYER_RUN_SPEED_METERS_PER_SECOND } from '@/player/player_constants.js';

/**
 * Applies an extra pose between the base locomotion pose and the limb IK (for
 * example a remote player's head look).
 */
export type PlayerCharacterAnimatorOverlay = (rig: PlayerCharacterRig) => void;

/** Palm normal of hands held on targets: palms face down. */
const PLAYER_CHARACTER_ANIMATOR_PALM_UP = new THREE.Vector3(0, 1, 0);
/** Finger direction of hands held on targets: forward. */
const PLAYER_CHARACTER_ANIMATOR_FINGERS_FORWARD = new THREE.Vector3(0, 0, 1);
/**
 * Character-local elbow pole of the left arm on targets (out and back); the
 * right one is mirrored.
 */
const PLAYER_CHARACTER_ANIMATOR_ELBOW_POLE = new THREE.Vector3(0.55, 0.95, -0.35);
/**
 * Planar speed in the air past which the character counts as flung (goes limp
 * into the ragdoll until it lands), well above a running jump.
 */
const PLAYER_CHARACTER_ANIMATOR_FLIGHT_SPEED = PLAYER_RUN_SPEED_METERS_PER_SECOND * 1.25;

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
  private handTargets: PlayerCharacterHandTargets | null = null;
  private readonly handLeft = new THREE.Vector3();
  private readonly handRight = new THREE.Vector3();
  private readonly rootInverse = new THREE.Quaternion();
  private readonly rootPosition = new THREE.Vector3();
  private readonly ragdoll = new PlayerCharacterRagdoll();
  private reach: THREE.Vector3 | null = null;
  private flying = false;
  private deltaSeconds = 0;
  private readonly velocity = new THREE.Vector3();

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
   * Puts both hands on world targets with palms down (for example on keys), or
   * frees them for the locomotion arms.
   *
   * @param targets Hand targets, or null.
   */
  setHandTargets(targets: PlayerCharacterHandTargets | null): void {
    this.handTargets = targets;
  }

  /**
   * Makes the right arm reach for a point (the grapple beam's anchor) and the
   * character fly limp while it does, or stops reaching.
   *
   * @param point Point, or null.
   */
  setReach(point: THREE.Vector3 | null): void {
    this.reach = point;
  }

  /**
   * Returns how far the pose is taken over by the flight ragdoll.
   *
   * @returns 0 (animated) to 1 (limp).
   */
  getRagdollWeight(): number {
    return this.ragdoll.getWeight();
  }

  /** Frees the flight ragdoll. */
  dispose(): void {
    this.ragdoll.dispose();
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
   * Advances the locomotion state, the limb targets and the footsteps, and
   * tells whether the character flies (reaching for an anchor, or flung fast
   * through the air, until it lands).
   *
   * @param root Character root, already placed at the feet and facing.
   * @param body Motion of the body.
   * @param deltaSeconds Frame delta.
   */
  update(root: THREE.Object3D, body: PlayerLocomotionBody, deltaSeconds: number): void {
    this.deltaSeconds = deltaSeconds;
    const airborne = !body.getIsGrounded();
    if (this.reach || (airborne && body.getPlanarSpeed() > PLAYER_CHARACTER_ANIMATOR_FLIGHT_SPEED)) this.flying = true;
    else if (!airborne) this.flying = false;
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
   * torso), then, while flying, the ragdoll over it.
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
    if (this.handTargets?.copyHandTargetsTo(this.handLeft, this.handRight)) this.solveTargetIk(rig);
    else this.solveLimbIk(rig);
    body.copyHorizontalVelocityTo(this.velocity).setY(body.getVerticalVelocity());
    this.ragdoll.apply(rig, this.flying, this.reach, this.velocity, this.deltaSeconds);
  }

  /**
   * Solves the legs as usual and puts the hands on the targets, palms down.
   *
   * @param rig Character rig.
   */
  private solveTargetIk(rig: PlayerCharacterRig): void {
    rig.root.getWorldQuaternion(this.rootInverse).invert();
    rig.root.getWorldPosition(this.rootPosition);
    const pole = PLAYER_CHARACTER_ANIMATOR_ELBOW_POLE;
    [this.handLeft, this.handRight].forEach((hand) => hand.sub(this.rootPosition).applyQuaternion(this.rootInverse));
    this.controls.get(PLAYER_CHARACTER_CONTROL.handLeft).copy(this.handLeft);
    this.controls.get(PLAYER_CHARACTER_CONTROL.handRight).copy(this.handRight);
    this.controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleLeft, pole.x, pole.y, pole.z);
    this.controls.set(PLAYER_CHARACTER_CONTROL.elbowPoleRight, -pole.x, pole.y, pole.z);
    this.controlIk.apply(rig.bones, rig.restLocalQuaternions, rig.root, this.controls, {
      solveLegs: true,
      solveArms: true,
      handOrient: 'palm_wall',
      wallNormalLocalOut: PLAYER_CHARACTER_ANIMATOR_PALM_UP,
      fingersLocalOut: PLAYER_CHARACTER_ANIMATOR_FINGERS_FORWARD,
    });
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
