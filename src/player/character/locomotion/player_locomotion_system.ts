import * as THREE from 'three';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import type { PlayerLocomotionBody, PlayerLocomotionFootstepSink } from './player_locomotion_body.js';
import { PlayerLocomotionControlArms } from './player_locomotion_control_arms.js';
import { PlayerLocomotionControlFollow } from './player_locomotion_control_follow.js';
import { PlayerLocomotionGaitCycle } from './player_locomotion_gait_cycle.js';
import { PlayerLocomotionWallPush } from './player_locomotion_wall_push.js';
import {
  playerLocomotionStateUsesJumpFeet,
  playerLocomotionStateUsesWallFeet,
  playerLocomotionStateUsesWallHands,
  type PlayerLocomotionStateId,
} from './state/player_locomotion_state_id.js';
import { PlayerLocomotionStateMachine } from './state/player_locomotion_state_machine.js';

/**
 * Orchestrates exclusive locomotion states into desired IK targets, then
 * interpolates them through control follow.
 */
export class PlayerLocomotionSystem {
  private readonly stateMachine: PlayerLocomotionStateMachine;
  private readonly gaitCycle: PlayerLocomotionGaitCycle;
  private readonly controlArms: PlayerLocomotionControlArms;
  private readonly controlFollow: PlayerLocomotionControlFollow;
  private readonly wallPush: PlayerLocomotionWallPush;
  private readonly wallNormalWorld: THREE.Vector3;
  private readonly moveIntentWorld: THREE.Vector3;
  private readonly wallTangentWorld: THREE.Vector3;
  private readonly footstepWorldPosition: THREE.Vector3;
  private wallLateralIntent: number;
  private wallLateralSpeed: number;
  private wallHandsAvailable: boolean;
  private previousState: PlayerLocomotionStateId;
  private readonly footstep: PlayerLocomotionFootstepSink;

  /**
   * Creates the locomotion system.
   *
   * @param footstep Receives planted feet (default: the local player's footstep
   *   event).
   */
  constructor(footstep: PlayerLocomotionFootstepSink = playerLocomotionFootstepLocal) {
    this.footstep = footstep;
    this.stateMachine = new PlayerLocomotionStateMachine();
    this.gaitCycle = new PlayerLocomotionGaitCycle();
    this.controlArms = new PlayerLocomotionControlArms();
    this.controlFollow = new PlayerLocomotionControlFollow();
    this.wallPush = new PlayerLocomotionWallPush();
    this.wallNormalWorld = new THREE.Vector3();
    this.moveIntentWorld = new THREE.Vector3();
    this.wallTangentWorld = new THREE.Vector3();
    this.footstepWorldPosition = new THREE.Vector3();
    this.wallLateralIntent = 0;
    this.wallLateralSpeed = 0;
    this.wallHandsAvailable = false;
    this.previousState = 'idle';
  }

  /**
   * Returns the step cycle phase for torso coupling.
   *
   * @returns Phase radians.
   */
  getCyclePhaseRadians(): number {
    return this.gaitCycle.getCyclePhaseRadians();
  }

  /**
   * Returns the exclusive active locomotion state.
   *
   * @returns Active state id.
   */
  getState(): PlayerLocomotionStateId {
    return this.stateMachine.getState();
  }

  /**
   * Returns the last wall normal used for palm orientation.
   *
   * @returns Character-local outward normal.
   */
  getWallNormalLocalOut(): THREE.Vector3 {
    return this.wallPush.getWallNormalLocalOut();
  }

  /**
   * Returns whether the active state is wall side-step.
   *
   * @returns True while side-step state is active.
   */
  getIsSideStep(): boolean {
    return this.stateMachine.getState() === 'wall_sidestep';
  }

  /**
   * Returns whether wall palm plants are active this frame.
   *
   * @returns True while hands target the wall.
   */
  getUsesWallHands(): boolean {
    return playerLocomotionStateUsesWallHands(this.stateMachine.getState(), this.wallHandsAvailable);
  }

  /** Resets gait, arms, follow, and state for a fresh play session. */
  reset(): void {
    this.gaitCycle.reset();
    this.controlFollow.reset();
    this.controlArms.reset();
    this.stateMachine.reset();
    this.wallLateralIntent = 0;
    this.wallLateralSpeed = 0;
    this.wallHandsAvailable = false;
    this.previousState = 'idle';
  }

  /**
   * Advances exclusive state, desired limb targets, then control follow.
   *
   * @param controls Control rig.
   * @param characterRoot Character root.
   * @param body Player body state.
   * @param deltaSeconds Frame delta.
   */
  update(
    controls: PlayerCharacterControlRig,
    characterRoot: THREE.Object3D,
    body: PlayerLocomotionBody,
    deltaSeconds: number,
  ): void {
    this.sampleWallContact(body);
    this.stateMachine.update({
      planarSpeed: body.getPlanarSpeed(),
      isGrounded: body.getIsGrounded(),
      isWallPushing: this.wallHandsAvailable,
      wantsRun: body.getWantsRun(),
      verticalVelocity: body.getVerticalVelocity(),
      wallLateralSpeed: this.wallLateralSpeed,
      wallLateralIntent: this.wallLateralIntent,
    });
    const state = this.stateMachine.getState();
    this.writeLegs(controls, characterRoot, body, state, deltaSeconds);
    this.raisePendingFootsteps(controls, characterRoot, body);
    this.writeArms(controls, characterRoot, body, state, deltaSeconds);
    const snapFeet = this.resolveSnapFeet(state);
    const worldLockFeet = this.resolveWorldLockFeet(body, state);
    this.controlFollow.apply(controls, {
      characterRoot,
      planarSpeed: body.getPlanarSpeed(),
      verticalSpeed: Math.abs(body.getVerticalVelocity()),
      deltaSeconds,
      snapFeetToDesired: snapFeet,
      worldLockFeet,
    });
    this.previousState = state;
  }

  /**
   * Samples wall contact normal, hand eligibility, and wall-left lateral
   * motion.
   *
   * @param body Player body.
   */
  private sampleWallContact(body: PlayerLocomotionBody): void {
    body.copyWallNormalTo(this.wallNormalWorld);
    this.wallNormalWorld.y = 0;
    if (this.wallNormalWorld.lengthSq() < 1e-8) {
      this.wallNormalWorld.set(0, 0, 0);
      this.wallHandsAvailable = false;
      this.wallLateralIntent = 0;
      this.wallLateralSpeed = 0;
      return;
    }
    this.wallNormalWorld.normalize();
    this.wallHandsAvailable = body.getIsWallPushing();
    const sample = this.measureWallMoveSample(body);
    this.wallLateralIntent = sample.lateralIntent;
    this.wallLateralSpeed = sample.lateralSpeed;
  }

  /**
   * Raises footstep frame events for any feet that planted this update.
   *
   * @param controls Control rig with desired foot locals.
   * @param characterRoot Character root for world conversion.
   * @param body Player body for planar speed pitch.
   */
  private raisePendingFootsteps(
    controls: PlayerCharacterControlRig,
    characterRoot: THREE.Object3D,
    body: PlayerLocomotionBody,
  ): void {
    const leftPlanted = this.gaitCycle.consumeFootstepLeftPending();
    const rightPlanted = this.gaitCycle.consumeFootstepRightPending();
    if (!leftPlanted && !rightPlanted) {
      return;
    }
    const planarSpeed = body.getPlanarSpeed();
    if (leftPlanted) {
      this.raiseFootstepForControl(controls, characterRoot, PLAYER_CHARACTER_CONTROL.footLeft, planarSpeed);
    }
    if (rightPlanted) {
      this.raiseFootstepForControl(controls, characterRoot, PLAYER_CHARACTER_CONTROL.footRight, planarSpeed);
    }
  }

  /**
   * Raises one footstep event at a foot control's world position.
   *
   * @param controls Control rig.
   * @param characterRoot Character root.
   * @param controlId Foot control id.
   * @param planarSpeed Planar speed meters per second.
   */
  private raiseFootstepForControl(
    controls: PlayerCharacterControlRig,
    characterRoot: THREE.Object3D,
    controlId: (typeof PLAYER_CHARACTER_CONTROL)[keyof typeof PLAYER_CHARACTER_CONTROL],
    planarSpeed: number,
  ): void {
    characterRoot.updateMatrixWorld(true);
    this.footstepWorldPosition.copy(controls.get(controlId));
    this.footstepWorldPosition.applyMatrix4(characterRoot.matrixWorld);
    this.footstep(
      this.footstepWorldPosition.x,
      this.footstepWorldPosition.y,
      this.footstepWorldPosition.z,
      planarSpeed,
    );
  }

  /**
   * Writes exclusive desired foot targets from the active state.
   *
   * @param controls Control rig.
   * @param characterRoot Character root.
   * @param body Player body.
   * @param state Active locomotion state.
   * @param deltaSeconds Frame delta.
   */
  private writeLegs(
    controls: PlayerCharacterControlRig,
    characterRoot: THREE.Object3D,
    body: PlayerLocomotionBody,
    state: PlayerLocomotionStateId,
    deltaSeconds: number,
  ): void {
    const wallFeet = playerLocomotionStateUsesWallFeet(state);
    this.gaitCycle.update(controls, {
      planarSpeed: body.getPlanarSpeed(),
      verticalVelocity: body.getVerticalVelocity(),
      wantsRun: body.getWantsRun() || state === 'run',
      isGrounded: body.getIsGrounded(),
      isWallIdle: state === 'wall_idle',
      isSideStep: state === 'wall_sidestep',
      sideStepSign: this.stateMachine.getWallLateralSign(),
      sideStepLateralSpeed: this.wallLateralSpeed,
      deltaSeconds,
      characterRoot,
      wallNormalWorld: wallFeet || state === 'jump_wall' ? this.wallNormalWorld : null,
    });
  }

  /**
   * Writes exclusive desired arm targets for free or wall states.
   *
   * @param controls Control rig.
   * @param characterRoot Character root.
   * @param body Player body.
   * @param state Active locomotion state.
   * @param deltaSeconds Frame delta.
   */
  private writeArms(
    controls: PlayerCharacterControlRig,
    characterRoot: THREE.Object3D,
    body: PlayerLocomotionBody,
    state: PlayerLocomotionStateId,
    deltaSeconds: number,
  ): void {
    if (playerLocomotionStateUsesWallHands(state, this.wallHandsAvailable)) {
      this.wallPush.writeDesired(controls, characterRoot, this.wallNormalWorld, deltaSeconds);
      return;
    }
    this.controlArms.write(controls, {
      cyclePhaseRadians: this.gaitCycle.getCyclePhaseRadians(),
      planarSpeed: body.getPlanarSpeed(),
      wantsRun: state === 'run' || body.getWantsRun(),
      isGrounded: body.getIsGrounded(),
      verticalVelocity: body.getVerticalVelocity(),
      isSideStep: state === 'wall_sidestep',
      deltaSeconds,
    });
  }

  /**
   * Snaps feet only for gait-requested events (e.g. jump pose entry).
   *
   * Wall enter/flip/corner never snap; control follow interpolates plant
   * retargets so left/right side-step cannot teleport.
   *
   * @param state Active state.
   * @returns True when feet should snap this frame.
   */
  private resolveSnapFeet(state: PlayerLocomotionStateId): boolean {
    if (this.gaitCycle.consumeNeedsControlSnap()) {
      return true;
    }
    if (state === this.previousState) {
      return false;
    }
    return playerLocomotionStateUsesJumpFeet(state);
  }

  /**
   * World-locks feet while wall plants are valid on the ground.
   *
   * @param body Player body.
   * @param state Active state.
   * @returns True when feet follow in world space.
   */
  private resolveWorldLockFeet(body: PlayerLocomotionBody, state: PlayerLocomotionStateId): boolean {
    if (!body.getIsGrounded()) {
      return false;
    }
    if (!playerLocomotionStateUsesWallFeet(state)) {
      return false;
    }
    return this.gaitCycle.getSideStepPlantsValid() || state === 'wall_idle';
  }

  /**
   * Samples lateral intent and speed along geometric wall-left.
   *
   * @param body Player body.
   * @returns Lateral intent and speed for side-step sign and mode.
   */
  private measureWallMoveSample(body: PlayerLocomotionBody): {
    lateralIntent: number;
    lateralSpeed: number;
  } {
    this.wallTangentWorld.set(-this.wallNormalWorld.z, 0, this.wallNormalWorld.x);
    if (this.wallTangentWorld.lengthSq() < 1e-8) {
      this.wallTangentWorld.set(1, 0, 0);
    } else {
      this.wallTangentWorld.normalize();
    }
    body.copyMoveIntentTo(this.moveIntentWorld);
    this.moveIntentWorld.y = 0;
    const lateralIntent = this.moveIntentWorld.dot(this.wallTangentWorld);
    body.copyHorizontalVelocityTo(this.moveIntentWorld);
    const lateralSpeed = this.moveIntentWorld.dot(this.wallTangentWorld);
    return {
      lateralIntent,
      lateralSpeed,
    };
  }
}

/**
 * Raises the local player's footstep event.
 *
 * @param x World X.
 * @param y World Y.
 * @param z World Z.
 * @param planarSpeed Planar speed in meters per second.
 */
function playerLocomotionFootstepLocal(x: number, y: number, z: number, planarSpeed: number): void {
  NotificationGlobal.onPlayerFootstep(x, y, z, planarSpeed);
}
