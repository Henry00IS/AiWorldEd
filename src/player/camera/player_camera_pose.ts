import * as THREE from 'three';
import {
  PLAYER_CAMERA_COLLISION_MIN_DISTANCE_METERS,
  PLAYER_CAMERA_COLLISION_RADIUS_METERS,
  PLAYER_CAMERA_EASE_OUT_RATE_PER_SECOND,
  PLAYER_CAMERA_FLOOR_NORMAL_Y_MIN,
  PLAYER_CAMERA_FLOOR_SKIN_METERS,
  PLAYER_CAMERA_WALL_SKIN_METERS,
  PLAYER_THIRD_PERSON_DISTANCE_DEFAULT,
  PLAYER_THIRD_PERSON_DISTANCE_MAX,
  PLAYER_THIRD_PERSON_DISTANCE_MIN,
} from '@/player/player_constants.js';
import type { PlayerViewMode } from '@/player/player_mode.js';
import type { PlayerLookState } from '@/player/look/player_look_state.js';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { playerEyePositionFromFeet } from '@/player/collision/player_capsule_collider.js';

/**
 * Owns third-person zoom distance and applies FP/TP camera poses. The
 * third-person camera sweeps a sphere from the head toward its orbit position
 * so it stops in front of walls, slides up over floors, snaps in immediately
 * when blocked, and eases back out when the view clears.
 */
export class PlayerCameraPoseApplier {
  private thirdPersonDistance: number;
  private smoothedDistance: number;
  private readonly scratchEye: THREE.Vector3;
  private readonly scratchForward: THREE.Vector3;
  private readonly scratchDesired: THREE.Vector3;
  private readonly scratchDirection: THREE.Vector3;
  private readonly scratchLookAt: THREE.Vector3;

  /** Creates an applier with the default third-person distance. */
  constructor() {
    this.thirdPersonDistance = PLAYER_THIRD_PERSON_DISTANCE_DEFAULT;
    this.smoothedDistance = PLAYER_THIRD_PERSON_DISTANCE_DEFAULT;
    this.scratchEye = new THREE.Vector3();
    this.scratchForward = new THREE.Vector3();
    this.scratchDesired = new THREE.Vector3();
    this.scratchDirection = new THREE.Vector3();
    this.scratchLookAt = new THREE.Vector3();
  }

  /**
   * Adjusts third-person orbit distance from a wheel delta.
   *
   * @param wheelDeltaY Wheel delta Y (positive typically zooms out).
   */
  applyWheelZoom(wheelDeltaY: number): void {
    const zoomStep = wheelDeltaY > 0 ? 0.45 : -0.45;
    this.thirdPersonDistance = THREE.MathUtils.clamp(
      this.thirdPersonDistance + zoomStep,
      PLAYER_THIRD_PERSON_DISTANCE_MIN,
      PLAYER_THIRD_PERSON_DISTANCE_MAX,
    );
  }

  /**
   * Returns the current third-person distance.
   *
   * @returns Distance in meters.
   */
  getThirdPersonDistance(): number {
    return this.thirdPersonDistance;
  }

  /**
   * Returns the eased camera distance actually used last frame.
   *
   * @returns Distance from the head in meters.
   */
  getSmoothedDistance(): number {
    return this.smoothedDistance;
  }

  /**
   * Writes the camera pose for the active view mode.
   *
   * @param camera Perspective camera to drive.
   * @param feetPosition Player feet world position.
   * @param look Look state for orientation.
   * @param viewMode First- or third-person mode.
   * @param collisionWorld World used for third-person wall avoidance.
   * @param deltaSeconds Frame time used to ease the camera back out.
   */
  apply(
    camera: THREE.PerspectiveCamera,
    feetPosition: THREE.Vector3,
    look: PlayerLookState,
    viewMode: PlayerViewMode,
    collisionWorld: PlayerCollisionWorld,
    deltaSeconds: number = 1 / 60,
  ): void {
    playerEyePositionFromFeet(feetPosition, this.scratchEye);
    look.copyLookForwardTo(this.scratchForward);
    if (viewMode === 'first_person') {
      this.applyFirstPerson(camera);
      return;
    }
    this.applyThirdPerson(camera, collisionWorld, deltaSeconds);
  }

  /**
   * Places the camera at the eye and looks along the look forward.
   *
   * @param camera Perspective camera.
   */
  private applyFirstPerson(camera: THREE.PerspectiveCamera): void {
    this.smoothedDistance = this.thirdPersonDistance;
    camera.position.copy(this.scratchEye);
    camera.up.set(0, 1, 0);
    this.scratchLookAt.copy(this.scratchEye).add(this.scratchForward);
    camera.lookAt(this.scratchLookAt);
    camera.updateMatrixWorld(true);
  }

  /**
   * Places the camera behind the player, kept out of level geometry.
   *
   * @param camera Perspective camera.
   * @param collisionWorld Collision world for the sphere sweeps.
   * @param deltaSeconds Frame time.
   */
  private applyThirdPerson(
    camera: THREE.PerspectiveCamera,
    collisionWorld: PlayerCollisionWorld,
    deltaSeconds: number,
  ): void {
    this.scratchDesired.copy(this.scratchEye).addScaledVector(this.scratchForward, -this.thirdPersonDistance);
    this.liftDesiredAboveFloor(collisionWorld);
    const clearDistance = this.resolveClearDistance(collisionWorld);
    this.easeDistanceToward(clearDistance, deltaSeconds);
    camera.position.copy(this.scratchEye).addScaledVector(this.scratchDirection, this.smoothedDistance);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.scratchEye);
    camera.updateMatrixWorld(true);
  }

  /**
   * Writes the unit direction and length from the eye to the desired spot.
   *
   * @returns Distance from the eye to the desired camera position.
   */
  private measureDesiredDirection(): number {
    this.scratchDirection.subVectors(this.scratchDesired, this.scratchEye);
    const distance = this.scratchDirection.length();
    if (distance < 1e-6) {
      this.scratchDirection.copy(this.scratchForward).negate();
      return 0;
    }
    this.scratchDirection.multiplyScalar(1 / distance);
    return distance;
  }

  /**
   * Raises the desired position over a floor the orbit dips through, so the
   * camera slides along the floor instead of diving under it.
   *
   * @param collisionWorld Collision world.
   */
  private liftDesiredAboveFloor(collisionWorld: PlayerCollisionWorld): void {
    const distance = this.measureDesiredDirection();
    const hit = this.castFromEye(collisionWorld, distance);
    if (!hit || hit.normal.y < PLAYER_CAMERA_FLOOR_NORMAL_Y_MIN) {
      return;
    }
    const minimumY = hit.point.y + Math.max(PLAYER_CAMERA_COLLISION_RADIUS_METERS, PLAYER_CAMERA_FLOOR_SKIN_METERS);
    this.scratchDesired.y = Math.max(this.scratchDesired.y, minimumY);
  }

  /**
   * Returns how far the camera can sit along the desired direction before its
   * sphere would touch level geometry.
   *
   * @param collisionWorld Collision world.
   * @returns Clear distance from the eye.
   */
  private resolveClearDistance(collisionWorld: PlayerCollisionWorld): number {
    const desiredDistance = this.measureDesiredDirection();
    const hit = this.castFromEye(collisionWorld, desiredDistance);
    if (!hit) {
      return desiredDistance;
    }
    return Math.max(PLAYER_CAMERA_COLLISION_MIN_DISTANCE_METERS, hit.distance - PLAYER_CAMERA_WALL_SKIN_METERS);
  }

  /**
   * Sweeps the camera sphere from the eye along the current direction.
   *
   * @param collisionWorld Collision world.
   * @param distance Sweep length.
   * @returns Hit, or null when clear.
   */
  private castFromEye(
    collisionWorld: PlayerCollisionWorld,
    distance: number,
  ): ReturnType<PlayerCollisionWorld['castSphere']> {
    if (distance < 1e-6) {
      return null;
    }
    return collisionWorld.castSphere(
      this.scratchEye,
      this.scratchDirection,
      PLAYER_CAMERA_COLLISION_RADIUS_METERS,
      distance,
      false,
    );
  }

  /**
   * Snaps the distance in when blocked and eases it out when clear.
   *
   * @param clearDistance Largest unobstructed distance this frame.
   * @param deltaSeconds Frame time.
   */
  private easeDistanceToward(clearDistance: number, deltaSeconds: number): void {
    if (clearDistance <= this.smoothedDistance) {
      this.smoothedDistance = clearDistance;
      return;
    }
    const blend = 1 - Math.exp(-PLAYER_CAMERA_EASE_OUT_RATE_PER_SECOND * Math.max(0, deltaSeconds));
    this.smoothedDistance += (clearDistance - this.smoothedDistance) * blend;
  }
}
