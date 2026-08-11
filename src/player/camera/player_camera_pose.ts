import * as THREE from 'three';
import {
  PLAYER_CAMERA_FLOOR_SKIN_METERS,
  PLAYER_CAMERA_FLOOR_SNAP_BAND_METERS,
  PLAYER_CAMERA_WALL_SKIN_METERS,
  PLAYER_THIRD_PERSON_DISTANCE_DEFAULT,
  PLAYER_THIRD_PERSON_DISTANCE_MAX,
  PLAYER_THIRD_PERSON_DISTANCE_MIN,
} from '@/player/player_constants.js';
import type { PlayerViewMode } from '@/player/player_mode.js';
import type { PlayerLookState } from '@/player/look/player_look_state.js';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { playerEyePositionFromFeet } from '@/player/collision/player_capsule_collider.js';

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);

/** Owns third-person zoom distance and applies FP/TP camera poses. */
export class PlayerCameraPoseApplier {
  private thirdPersonDistance: number;
  private readonly scratchEye: THREE.Vector3;
  private readonly scratchForward: THREE.Vector3;
  private readonly scratchDesired: THREE.Vector3;
  private readonly scratchDirection: THREE.Vector3;
  private readonly scratchLookAt: THREE.Vector3;
  private readonly scratchFloorProbeOrigin: THREE.Vector3;

  /** Creates an applier with the default third-person distance. */
  constructor() {
    this.thirdPersonDistance = PLAYER_THIRD_PERSON_DISTANCE_DEFAULT;
    this.scratchEye = new THREE.Vector3();
    this.scratchForward = new THREE.Vector3();
    this.scratchDesired = new THREE.Vector3();
    this.scratchDirection = new THREE.Vector3();
    this.scratchLookAt = new THREE.Vector3();
    this.scratchFloorProbeOrigin = new THREE.Vector3();
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
   * Writes the camera pose for the active view mode.
   *
   * @param camera Perspective camera to drive.
   * @param feetPosition Player feet world position.
   * @param look Look state for orientation.
   * @param viewMode First- or third-person mode.
   * @param collisionWorld World used for third-person wall avoidance.
   */
  apply(
    camera: THREE.PerspectiveCamera,
    feetPosition: THREE.Vector3,
    look: PlayerLookState,
    viewMode: PlayerViewMode,
    collisionWorld: PlayerCollisionWorld,
  ): void {
    playerEyePositionFromFeet(feetPosition, this.scratchEye);
    look.copyLookForwardTo(this.scratchForward);
    if (viewMode === 'first_person') {
      this.applyFirstPerson(camera);
      return;
    }
    this.applyThirdPerson(camera, collisionWorld);
  }

  /**
   * Places the camera at the eye and looks along the look forward.
   *
   * @param camera Perspective camera.
   */
  private applyFirstPerson(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.scratchEye);
    camera.up.set(0, 1, 0);
    this.scratchLookAt.copy(this.scratchEye).add(this.scratchForward);
    camera.lookAt(this.scratchLookAt);
    camera.updateMatrixWorld(true);
  }

  /**
   * Places the camera behind the player with wall and nearby-floor clamps.
   *
   * @param camera Perspective camera.
   * @param collisionWorld Collision world for pull-in and floor snap.
   */
  private applyThirdPerson(camera: THREE.PerspectiveCamera, collisionWorld: PlayerCollisionWorld): void {
    this.scratchDesired.copy(this.scratchEye).addScaledVector(this.scratchForward, -this.thirdPersonDistance);
    this.clampCameraBehindWalls(collisionWorld);
    this.snapCameraOntoNearbyFloor(collisionWorld);
    camera.position.copy(this.scratchDesired);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.scratchEye);
    camera.updateMatrixWorld(true);
  }

  /**
   * Pulls the desired camera position forward if a wall is between eye and cam.
   *
   * @param collisionWorld Collision world.
   */
  private clampCameraBehindWalls(collisionWorld: PlayerCollisionWorld): void {
    this.scratchDirection.subVectors(this.scratchDesired, this.scratchEye);
    const desiredDistance = this.scratchDirection.length();
    if (desiredDistance < 1e-6) {
      return;
    }
    this.scratchDirection.multiplyScalar(1 / desiredDistance);
    const hit = collisionWorld.raycastNearest(this.scratchEye, this.scratchDirection, desiredDistance);
    if (!hit) {
      return;
    }
    const clamped = Math.max(PLAYER_THIRD_PERSON_DISTANCE_MIN * 0.5, hit.distance - PLAYER_CAMERA_WALL_SKIN_METERS);
    this.scratchDesired.copy(this.scratchEye).addScaledVector(this.scratchDirection, clamped);
  }

  /**
   * Lifts the camera onto nearby floor geometry instead of sinking through it.
   * Distant floors are ignored so high orbits still dive freely through empty
   * air.
   *
   * @param collisionWorld Collision world used for a short downward probe.
   */
  private snapCameraOntoNearbyFloor(collisionWorld: PlayerCollisionWorld): void {
    const band = PLAYER_CAMERA_FLOOR_SNAP_BAND_METERS;
    this.scratchFloorProbeOrigin.set(this.scratchDesired.x, this.scratchDesired.y + band, this.scratchDesired.z);
    const hit = collisionWorld.raycastNearest(this.scratchFloorProbeOrigin, WORLD_DOWN, band * 2);
    if (!hit) {
      return;
    }
    const minCameraY = hit.point.y + PLAYER_CAMERA_FLOOR_SKIN_METERS;
    if (this.scratchDesired.y < minCameraY) {
      this.scratchDesired.y = minCameraY;
    }
  }
}
