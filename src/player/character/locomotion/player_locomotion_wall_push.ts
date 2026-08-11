import * as THREE from 'three';
import { PLAYER_COLLIDER_RADIUS_METERS, PLAYER_WALL_SKIN_METERS } from '@/player/player_constants.js';
import { PLAYER_CHARACTER_CONTROL } from '@/player/character/player_character_control_ids.js';
import type { PlayerCharacterControlRig } from '@/player/character/player_character_control_rig.js';
import { PLAYER_LOCOMOTION_GAIT } from './player_locomotion_gait_config.js';
import { playerLocomotionClamp01, playerLocomotionLerp } from './player_locomotion_math.js';

/**
 * Places arm controls flat against a wall and can blend them over free-space
 * arm targets by wall weight.
 */
export class PlayerLocomotionWallPush {
  private readonly normalLocalOut: THREE.Vector3;
  private readonly cachedWallNormalWorld: THREE.Vector3;
  private readonly targetWallNormalWorld: THREE.Vector3;
  private readonly intoWall: THREE.Vector3;
  private readonly characterLeft: THREE.Vector3;
  private readonly scratch: THREE.Vector3;
  private readonly rootWorldQuaternionInverse: THREE.Quaternion;

  /** Creates a wall-push control writer. */
  constructor() {
    this.normalLocalOut = new THREE.Vector3();
    this.cachedWallNormalWorld = new THREE.Vector3();
    this.targetWallNormalWorld = new THREE.Vector3();
    this.intoWall = new THREE.Vector3();
    this.characterLeft = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.rootWorldQuaternionInverse = new THREE.Quaternion();
  }

  /**
   * Returns the character-local outward wall normal for palm orientation.
   *
   * @returns Unit normal in character space.
   */
  getWallNormalLocalOut(): THREE.Vector3 {
    return this.normalLocalOut;
  }

  /**
   * Writes full wall-palm desired arm targets for an exclusive wall state.
   *
   * Live wall normals are rate-limited so corner switches do not teleport
   * palms. Control follow owns temporal interpolation into the live rig.
   *
   * @param controls Control rig to receive desired wall arm targets.
   * @param root Character root.
   * @param wallNormalWorld World outward wall normal.
   * @param deltaSeconds Frame delta for wall-normal follow.
   */
  writeDesired(
    controls: PlayerCharacterControlRig,
    root: THREE.Object3D,
    wallNormalWorld: THREE.Vector3,
    deltaSeconds: number = 1 / 60,
  ): void {
    this.followWallNormal(wallNormalWorld, deltaSeconds);
    if (this.cachedWallNormalWorld.lengthSq() < 1e-8) {
      return;
    }
    this.writeLocalNormal(root, this.cachedWallNormalWorld);
    this.writeHandControl(controls, true);
    this.writeHandControl(controls, false);
    this.writeElbowControl(controls, true);
    this.writeElbowControl(controls, false);
  }

  /**
   * Legacy blend path kept for unit tests that assert weighted palm approach.
   *
   * @param controls Control rig already holding free-space arm targets.
   * @param root Character root.
   * @param wallNormalWorld World outward wall normal.
   * @param wallWeight Wall overlay weight in [0, 1].
   * @param deltaSeconds Frame delta for wall-normal follow.
   */
  blendOnto(
    controls: PlayerCharacterControlRig,
    root: THREE.Object3D,
    wallNormalWorld: THREE.Vector3,
    wallWeight: number,
    deltaSeconds: number = 1 / 60,
  ): void {
    const weight = playerLocomotionClamp01(wallWeight);
    if (weight <= 1e-4) {
      return;
    }
    if (weight >= 1 - 1e-4) {
      this.writeDesired(controls, root, wallNormalWorld, deltaSeconds);
      return;
    }
    this.followWallNormal(wallNormalWorld, deltaSeconds);
    if (this.cachedWallNormalWorld.lengthSq() < 1e-8) {
      return;
    }
    this.writeLocalNormal(root, this.cachedWallNormalWorld);
    this.blendHand(controls, true, weight);
    this.blendHand(controls, false, weight);
    this.blendElbow(controls, true, weight);
    this.blendElbow(controls, false, weight);
  }

  /**
   * Writes one hand control to its full wall palm target.
   *
   * @param controls Control rig.
   * @param isLeft Left hand.
   */
  private writeHandControl(controls: PlayerCharacterControlRig, isLeft: boolean): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.handLeft : PLAYER_CHARACTER_CONTROL.handRight;
    this.writeHandTarget(isLeft, this.scratch);
    controls.set(id, this.scratch.x, this.scratch.y, this.scratch.z);
  }

  /**
   * Writes one elbow pole to its full wall target.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   */
  private writeElbowControl(controls: PlayerCharacterControlRig, isLeft: boolean): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.elbowPoleLeft : PLAYER_CHARACTER_CONTROL.elbowPoleRight;
    this.writeElbowTarget(isLeft, this.scratch);
    controls.set(id, this.scratch.x, this.scratch.y, this.scratch.z);
  }

  /**
   * Advances the smoothed wall normal toward the live contact normal.
   *
   * @param wallNormalWorld Live world outward normal.
   * @param deltaSeconds Frame delta.
   */
  private followWallNormal(wallNormalWorld: THREE.Vector3, deltaSeconds: number): void {
    if (!this.writePlanarUnitNormal(wallNormalWorld, this.targetWallNormalWorld)) {
      return;
    }
    if (!this.ensureCachedWallNormalSeeded()) {
      return;
    }
    this.advanceCachedWallNormal(deltaSeconds);
  }

  /**
   * Writes a planar unit normal into the destination, or fails when degenerate.
   *
   * @param source Source normal.
   * @param destination Destination vector.
   * @returns True when destination holds a unit planar normal.
   */
  private writePlanarUnitNormal(source: THREE.Vector3, destination: THREE.Vector3): boolean {
    if (source.lengthSq() < 1e-8) {
      return false;
    }
    destination.copy(source);
    destination.y = 0;
    if (destination.lengthSq() < 1e-8) {
      return false;
    }
    destination.normalize();
    return true;
  }

  /**
   * Seeds the cached wall normal on first contact.
   *
   * @returns True when a usable cached normal exists after seeding.
   */
  private ensureCachedWallNormalSeeded(): boolean {
    if (this.cachedWallNormalWorld.lengthSq() >= 1e-8) {
      this.cachedWallNormalWorld.y = 0;
      if (this.cachedWallNormalWorld.lengthSq() < 1e-8) {
        this.cachedWallNormalWorld.copy(this.targetWallNormalWorld);
        return true;
      }
      this.cachedWallNormalWorld.normalize();
      return true;
    }
    this.cachedWallNormalWorld.copy(this.targetWallNormalWorld);
    return true;
  }

  /**
   * Rotates the cached wall normal toward the live target by at most one step.
   *
   * @param deltaSeconds Frame delta.
   */
  private advanceCachedWallNormal(deltaSeconds: number): void {
    const angle = this.cachedWallNormalWorld.angleTo(this.targetWallNormalWorld);
    if (angle < 1e-5) {
      this.cachedWallNormalWorld.copy(this.targetWallNormalWorld);
      return;
    }
    const maxStep = PLAYER_LOCOMOTION_GAIT.wallNormalFollowRadiansPerSecond * Math.max(0, deltaSeconds);
    if (angle <= maxStep) {
      this.cachedWallNormalWorld.copy(this.targetWallNormalWorld);
      return;
    }
    this.cachedWallNormalWorld.lerp(this.targetWallNormalWorld, maxStep / angle);
    if (!this.writePlanarUnitNormal(this.cachedWallNormalWorld, this.cachedWallNormalWorld)) {
      this.cachedWallNormalWorld.copy(this.targetWallNormalWorld);
    }
  }

  /**
   * Converts the world wall normal into character-local planar space.
   *
   * Palm push is always expressed relative to the character facing (+Z local).
   * If the into-wall direction lies behind the character, the normal is flipped
   * so hands never plant behind the back when facing a wall.
   *
   * @param root Character root.
   * @param wallNormalWorld World outward normal.
   */
  private writeLocalNormal(root: THREE.Object3D, wallNormalWorld: THREE.Vector3): void {
    root.getWorldQuaternion(this.rootWorldQuaternionInverse);
    this.rootWorldQuaternionInverse.invert();
    this.normalLocalOut.copy(wallNormalWorld).applyQuaternion(this.rootWorldQuaternionInverse);
    this.normalLocalOut.y = 0;
    this.normalizeOrSetDefault(this.normalLocalOut, 0, 0, -1);
    this.intoWall.copy(this.normalLocalOut).multiplyScalar(-1);
    this.alignIntoWallWithCharacterFacing();
    this.characterLeft.set(0, 1, 0).cross(this.intoWall);
    this.normalizeOrSetDefault(this.characterLeft, 1, 0, 0);
  }

  /**
   * Keeps the palm push direction in front of the character relative to facing.
   *
   * Character forward is +Z local. When the wall lies behind the facing
   * hemisphere, flips into-wall and the outward normal together.
   */
  private alignIntoWallWithCharacterFacing(): void {
    if (this.intoWall.z >= 0) {
      this.biasIntoWallTowardFacing();
      return;
    }
    this.intoWall.multiplyScalar(-1);
    this.normalLocalOut.multiplyScalar(-1);
    this.biasIntoWallTowardFacing();
  }

  /**
   * Softly pulls the into-wall direction toward character forward so palm
   * placement tracks facing rather than a pure world wall axis.
   */
  private biasIntoWallTowardFacing(): void {
    const facingBias = 0.45;
    this.intoWall.x *= 1 - facingBias;
    this.intoWall.z = this.intoWall.z * (1 - facingBias) + facingBias;
    this.intoWall.y = 0;
    this.normalizeOrSetDefault(this.intoWall, 0, 0, 1);
  }

  /**
   * Normalizes a vector or replaces it with a default axis when degenerate.
   *
   * @param vector Vector mutated in place.
   * @param defaultX Fallback X.
   * @param defaultY Fallback Y.
   * @param defaultZ Fallback Z.
   */
  private normalizeOrSetDefault(vector: THREE.Vector3, defaultX: number, defaultY: number, defaultZ: number): void {
    if (vector.lengthSq() < 1e-8) {
      vector.set(defaultX, defaultY, defaultZ);
      return;
    }
    vector.normalize();
  }

  /**
   * Blends one hand control toward its wall palm target.
   *
   * @param controls Control rig.
   * @param isLeft Left hand.
   * @param weight Blend weight.
   */
  private blendHand(controls: PlayerCharacterControlRig, isLeft: boolean, weight: number): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.handLeft : PLAYER_CHARACTER_CONTROL.handRight;
    this.writeHandTarget(isLeft, this.scratch);
    this.blendControl(controls, id, this.scratch, weight);
  }

  /**
   * Blends one elbow pole toward its wall target.
   *
   * @param controls Control rig.
   * @param isLeft Left arm.
   * @param weight Blend weight.
   */
  private blendElbow(controls: PlayerCharacterControlRig, isLeft: boolean, weight: number): void {
    const id = isLeft ? PLAYER_CHARACTER_CONTROL.elbowPoleLeft : PLAYER_CHARACTER_CONTROL.elbowPoleRight;
    this.writeElbowTarget(isLeft, this.scratch);
    this.blendControl(controls, id, this.scratch, weight);
  }

  /**
   * Writes the character-local palm position against the wall plane.
   *
   * @param isLeft Left hand.
   * @param target Destination local point.
   */
  private writeHandTarget(isLeft: boolean, target: THREE.Vector3): void {
    const sideSign = isLeft ? 1 : -1;
    const contactDepth =
      PLAYER_COLLIDER_RADIUS_METERS + PLAYER_WALL_SKIN_METERS - PLAYER_LOCOMOTION_GAIT.wallPalmFreeSpaceMeters;
    target.copy(this.intoWall).multiplyScalar(contactDepth);
    target.addScaledVector(this.characterLeft, sideSign * PLAYER_LOCOMOTION_GAIT.wallHandSideMeters);
    target.y = PLAYER_LOCOMOTION_GAIT.wallHandHeightMeters;
  }

  /**
   * Writes the character-local elbow pole below the palm in free space.
   *
   * @param isLeft Left arm.
   * @param target Destination local point.
   */
  private writeElbowTarget(isLeft: boolean, target: THREE.Vector3): void {
    const sideSign = isLeft ? 1 : -1;
    const contactDepth =
      PLAYER_COLLIDER_RADIUS_METERS + PLAYER_WALL_SKIN_METERS - PLAYER_LOCOMOTION_GAIT.wallPalmFreeSpaceMeters;
    const freeDepth = contactDepth - PLAYER_LOCOMOTION_GAIT.wallElbowFreeSpaceMeters;
    target.copy(this.intoWall).multiplyScalar(freeDepth);
    target.addScaledVector(this.characterLeft, sideSign * PLAYER_LOCOMOTION_GAIT.wallHandSideMeters * 0.85);
    target.y = PLAYER_LOCOMOTION_GAIT.wallHandHeightMeters - PLAYER_LOCOMOTION_GAIT.wallElbowDropMeters;
  }

  /**
   * Lerps one control point toward a target by weight.
   *
   * @param controls Control rig.
   * @param id Control id.
   * @param target Target local point.
   * @param weight Blend weight.
   */
  private blendControl(
    controls: PlayerCharacterControlRig,
    id: (typeof PLAYER_CHARACTER_CONTROL)[keyof typeof PLAYER_CHARACTER_CONTROL],
    target: THREE.Vector3,
    weight: number,
  ): void {
    const point = controls.get(id);
    point.x = playerLocomotionLerp(point.x, target.x, weight);
    point.y = playerLocomotionLerp(point.y, target.y, weight);
    point.z = playerLocomotionLerp(point.z, target.z, weight);
  }
}
