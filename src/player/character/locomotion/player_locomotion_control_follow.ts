import * as THREE from 'three';
import {
  PLAYER_CHARACTER_CONTROL,
  PLAYER_CHARACTER_CONTROL_IDS,
  type PlayerCharacterControlId,
} from '@/player/character/player_character_control_ids.js';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT } from './player_locomotion_gait_config.js';

/** Options for one control-follow pass. */
export interface PlayerLocomotionControlFollowOptions {
  /** Character root for local/world conversion. */
  characterRoot: THREE.Object3D | null;
  /** Body planar speed meters per second. */
  planarSpeed: number;
  /** Absolute vertical speed meters per second (boosts catch-up while falling). */
  verticalSpeed: number;
  /** Frame delta. */
  deltaSeconds: number;
  /** Snap legs to desired (plant reseed / leave ground / airborne free pose). */
  snapFeetToDesired: boolean;
  /**
   * When true, feet follow in world space (wall plant locks). When false, feet
   * follow in character-local space so free walk/jump stay attached to the
   * body.
   */
  worldLockFeet: boolean;
}

/**
 * Follows desired IK control targets into the live control rig. Writers only
 * ever set desired positions; this class is the only place that moves the
 * points the solver reads, so every pose change is interpolated.
 */
export class PlayerLocomotionControlFollow {
  private readonly smoothLocal: Map<PlayerCharacterControlId, THREE.Vector3>;
  private readonly smoothFootWorldLeft: THREE.Vector3;
  private readonly smoothFootWorldRight: THREE.Vector3;
  private hasSmoothed: boolean;
  private readonly rootWorldPosition: THREE.Vector3;
  private readonly rootWorldQuaternion: THREE.Quaternion;
  private readonly rootWorldQuaternionInverse: THREE.Quaternion;
  private readonly scratchWorld: THREE.Vector3;
  private readonly scratchLocal: THREE.Vector3;

  /** Creates a control-point follower with empty state. */
  constructor() {
    this.smoothLocal = new Map();
    for (let index = 0; index < PLAYER_CHARACTER_CONTROL_IDS.length; index++) {
      const id = PLAYER_CHARACTER_CONTROL_IDS[index];
      if (id) {
        this.smoothLocal.set(id, new THREE.Vector3());
      }
    }
    this.smoothFootWorldLeft = new THREE.Vector3();
    this.smoothFootWorldRight = new THREE.Vector3();
    this.hasSmoothed = false;
    this.rootWorldPosition = new THREE.Vector3();
    this.rootWorldQuaternion = new THREE.Quaternion();
    this.rootWorldQuaternionInverse = new THREE.Quaternion();
    this.scratchWorld = new THREE.Vector3();
    this.scratchLocal = new THREE.Vector3();
  }

  /**
   * Moves live controls toward the desired positions written by locomotion.
   *
   * @param controls Control rig holding desired targets (overwritten with
   *   smoothed).
   * @param options Follow options for this frame.
   */
  apply(controls: PlayerCharacterControlRig, options: PlayerLocomotionControlFollowOptions): void {
    this.captureRoot(options.characterRoot);
    if (!this.hasSmoothed || options.deltaSeconds <= 1e-8) {
      this.seedAllFromDesired(controls);
      this.hasSmoothed = true;
      return;
    }
    if (options.snapFeetToDesired) {
      this.snapLegControlsFromDesired(controls);
    }
    const maxStep = this.resolveMaxStepMeters(options.planarSpeed, options.verticalSpeed, options.deltaSeconds);
    this.followFeet(controls, options.worldLockFeet, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.kneePoleLeft, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.kneePoleRight, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.handLeft, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.handRight, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.elbowPoleLeft, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.elbowPoleRight, maxStep);
  }

  /** Clears smoothed state so the next apply reseeds from desired targets. */
  reset(): void {
    this.hasSmoothed = false;
  }

  /**
   * Seeds every smoothed control from the current desired targets.
   *
   * @param controls Control rig with desired targets.
   */
  private seedAllFromDesired(controls: PlayerCharacterControlRig): void {
    for (let index = 0; index < PLAYER_CHARACTER_CONTROL_IDS.length; index++) {
      const id = PLAYER_CHARACTER_CONTROL_IDS[index];
      if (!id) {
        continue;
      }
      this.copyDesiredToSmoothed(controls, id);
    }
    this.syncFootWorldFromLocal(controls);
  }

  /**
   * Snaps only leg controls to desired so plant reseeds and free-air poses do
   * not drag from stale world locks.
   *
   * @param controls Control rig with desired leg targets.
   */
  private snapLegControlsFromDesired(controls: PlayerCharacterControlRig): void {
    this.copyDesiredToSmoothed(controls, PLAYER_CHARACTER_CONTROL.footLeft);
    this.copyDesiredToSmoothed(controls, PLAYER_CHARACTER_CONTROL.footRight);
    this.copyDesiredToSmoothed(controls, PLAYER_CHARACTER_CONTROL.kneePoleLeft);
    this.copyDesiredToSmoothed(controls, PLAYER_CHARACTER_CONTROL.kneePoleRight);
    this.syncFootWorldFromLocal(controls);
  }

  /**
   * Copies one desired control into its smoothed buffer.
   *
   * @param controls Control rig.
   * @param id Control id.
   */
  private copyDesiredToSmoothed(controls: PlayerCharacterControlRig, id: PlayerCharacterControlId): void {
    const desired = controls.get(id);
    const smoothed = this.smoothLocal.get(id);
    if (!smoothed) {
      return;
    }
    smoothed.copy(desired);
  }

  /**
   * Rebuilds smoothed foot world positions from live local feet.
   *
   * @param controls Control rig holding foot locals.
   */
  private syncFootWorldFromLocal(controls: PlayerCharacterControlRig): void {
    this.localToWorld(controls.get(PLAYER_CHARACTER_CONTROL.footLeft), this.smoothFootWorldLeft);
    this.localToWorld(controls.get(PLAYER_CHARACTER_CONTROL.footRight), this.smoothFootWorldRight);
  }

  /**
   * Resolves how far any control may travel this frame toward its desired
   * target.
   *
   * @param planarSpeed Body planar speed meters per second.
   * @param verticalSpeed Absolute vertical speed meters per second.
   * @param deltaSeconds Frame delta.
   * @returns Maximum meters of travel.
   */
  private resolveMaxStepMeters(planarSpeed: number, verticalSpeed: number, deltaSeconds: number): number {
    const base = PLAYER_LOCOMOTION_GAIT.controlFollowMaxSpeedMetersPerSecond;
    const bodyTrack =
      Math.abs(planarSpeed) * PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedScale +
      Math.abs(verticalSpeed) * PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedScale +
      PLAYER_LOCOMOTION_GAIT.controlFollowBodySpeedSlackMetersPerSecond;
    return Math.max(base, bodyTrack) * Math.max(0, deltaSeconds);
  }

  /**
   * Follows both feet in world or local space.
   *
   * @param controls Control rig.
   * @param worldLockFeet True for wall plant world locks.
   * @param maxStep Maximum meters this frame.
   */
  private followFeet(controls: PlayerCharacterControlRig, worldLockFeet: boolean, maxStep: number): void {
    if (worldLockFeet) {
      this.followFootWorld(controls, PLAYER_CHARACTER_CONTROL.footLeft, this.smoothFootWorldLeft, maxStep);
      this.followFootWorld(controls, PLAYER_CHARACTER_CONTROL.footRight, this.smoothFootWorldRight, maxStep);
      return;
    }
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.footLeft, maxStep);
    this.followLocal(controls, PLAYER_CHARACTER_CONTROL.footRight, maxStep);
    this.syncFootWorldFromLocal(controls);
  }

  /**
   * Smooths one foot in world space so world plants stay fixed under root
   * motion.
   *
   * @param controls Control rig.
   * @param id Foot control id.
   * @param smoothWorld Previous smoothed world foot position.
   * @param maxStep Maximum meters this frame.
   */
  private followFootWorld(
    controls: PlayerCharacterControlRig,
    id: PlayerCharacterControlId,
    smoothWorld: THREE.Vector3,
    maxStep: number,
  ): void {
    this.localToWorld(controls.get(id), this.scratchWorld);
    this.approachVector(smoothWorld, this.scratchWorld, maxStep);
    this.worldToLocal(smoothWorld, this.scratchLocal);
    controls.get(id).copy(this.scratchLocal);
    const smoothLocal = this.smoothLocal.get(id);
    if (smoothLocal) {
      smoothLocal.copy(this.scratchLocal);
    }
  }

  /**
   * Smooths one control in character-local space.
   *
   * @param controls Control rig.
   * @param id Control id.
   * @param maxStep Maximum meters this frame.
   */
  private followLocal(controls: PlayerCharacterControlRig, id: PlayerCharacterControlId, maxStep: number): void {
    const desired = controls.get(id);
    const smoothed = this.smoothLocal.get(id);
    if (!smoothed) {
      return;
    }
    this.approachVector(smoothed, desired, maxStep);
    desired.copy(smoothed);
  }

  /**
   * Moves current toward target by at most maxStep meters.
   *
   * @param current Live position mutated in place.
   * @param target Desired position.
   * @param maxStep Maximum meters to travel.
   */
  private approachVector(current: THREE.Vector3, target: THREE.Vector3, maxStep: number): void {
    const deltaX = target.x - current.x;
    const deltaY = target.y - current.y;
    const deltaZ = target.z - current.z;
    const distance = Math.hypot(deltaX, deltaY, deltaZ);
    if (distance <= maxStep || distance < 1e-8) {
      current.copy(target);
      return;
    }
    const scale = maxStep / distance;
    current.x += deltaX * scale;
    current.y += deltaY * scale;
    current.z += deltaZ * scale;
  }

  /**
   * Captures character root world pose.
   *
   * @param characterRoot Character root, or null.
   */
  private captureRoot(characterRoot: THREE.Object3D | null): void {
    if (!characterRoot) {
      this.rootWorldPosition.set(0, 0, 0);
      this.rootWorldQuaternion.identity();
      this.rootWorldQuaternionInverse.identity();
      return;
    }
    characterRoot.updateMatrixWorld(true);
    characterRoot.getWorldPosition(this.rootWorldPosition);
    characterRoot.getWorldQuaternion(this.rootWorldQuaternion);
    this.rootWorldQuaternionInverse.copy(this.rootWorldQuaternion).invert();
  }

  /**
   * Converts a character-local point to world space.
   *
   * @param local Local point.
   * @param world Destination.
   */
  private localToWorld(local: THREE.Vector3, world: THREE.Vector3): void {
    world.copy(local).applyQuaternion(this.rootWorldQuaternion);
    world.add(this.rootWorldPosition);
  }

  /**
   * Converts a world point to character-local space.
   *
   * @param world World point.
   * @param local Destination.
   */
  private worldToLocal(world: THREE.Vector3, local: THREE.Vector3): void {
    local.copy(world).sub(this.rootWorldPosition);
    local.applyQuaternion(this.rootWorldQuaternionInverse);
  }
}
