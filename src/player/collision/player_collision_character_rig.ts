import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PHYSICS_LEVEL_GROUPS_CHARACTER_COLLIDER } from '@/physics/level/physics_level_collision_groups.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import {
  PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS,
  PLAYER_CHARACTER_SNAP_TO_GROUND_METERS,
  PLAYER_COLLIDER_HEIGHT_METERS,
  PLAYER_COLLIDER_RADIUS_METERS,
  PLAYER_MAX_WALKABLE_SLOPE_DEGREES,
  PLAYER_STEP_HEIGHT_METERS,
  PLAYER_STEP_MIN_REQUIRED_DEPTH_METERS,
} from '@/player/player_constants.js';

/** Half the straight segment length of the player capsule. */
export const PLAYER_CAPSULE_HALF_SEGMENT_METERS = PLAYER_COLLIDER_HEIGHT_METERS * 0.5 - PLAYER_COLLIDER_RADIUS_METERS;

/** Height of the capsule center above the feet, controller gap included. */
export const PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS =
  PLAYER_COLLIDER_HEIGHT_METERS * 0.5 + PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS;

/** One obstacle the controller touched while moving. */
export interface PlayerCharacterMoveCollision {
  /** World outward normal of the obstacle at the contact. */
  normal: THREE.Vector3;
}

/**
 * The Rapier kinematic character controller and the capsule probe collider it
 * moves, shared by every player body of one collision world.
 */
export class PlayerCollisionCharacterRig {
  private readonly levelWorld: PhysicsLevelWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly collider: RAPIER.Collider;
  private readonly capsuleShape: RAPIER.Capsule;
  private readonly collisions: PlayerCharacterMoveCollision[];
  private collisionCount: number;
  private readonly computedMovement: THREE.Vector3;

  /**
   * Creates the controller and capsule collider inside a level world.
   *
   * @param levelWorld Level world that holds the geometry.
   */
  constructor(levelWorld: PhysicsLevelWorld) {
    this.levelWorld = levelWorld;
    const rapier = levelWorld.getRapier();
    this.capsuleShape = new rapier.Capsule(PLAYER_CAPSULE_HALF_SEGMENT_METERS, PLAYER_COLLIDER_RADIUS_METERS);
    this.collider = levelWorld
      .getRapierWorld()
      .createCollider(
        rapier.ColliderDesc.capsule(PLAYER_CAPSULE_HALF_SEGMENT_METERS, PLAYER_COLLIDER_RADIUS_METERS)
          .setCollisionGroups(PHYSICS_LEVEL_GROUPS_CHARACTER_COLLIDER)
          .setSensor(true),
      );
    this.controller = this.createController();
    this.collisions = [];
    this.collisionCount = 0;
    this.computedMovement = new THREE.Vector3();
  }

  /**
   * Builds and configures the kinematic character controller.
   *
   * @returns Configured controller.
   */
  private createController(): RAPIER.KinematicCharacterController {
    const controller = this.levelWorld
      .getRapierWorld()
      .createCharacterController(PLAYER_CHARACTER_CONTROLLER_OFFSET_METERS);
    const slopeRadians = THREE.MathUtils.degToRad(PLAYER_MAX_WALKABLE_SLOPE_DEGREES);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.setMaxSlopeClimbAngle(slopeRadians);
    controller.setMinSlopeSlideAngle(slopeRadians);
    controller.enableAutostep(PLAYER_STEP_HEIGHT_METERS, PLAYER_STEP_MIN_REQUIRED_DEPTH_METERS, false);
    controller.enableSnapToGround(PLAYER_CHARACTER_SNAP_TO_GROUND_METERS);
    controller.setApplyImpulsesToDynamicBodies(false);
    return controller;
  }

  /**
   * Returns the capsule shape for custom queries.
   *
   * @returns Capsule shape.
   */
  getCapsuleShape(): RAPIER.Capsule {
    return this.capsuleShape;
  }

  /**
   * Returns the capsule probe collider.
   *
   * @returns Capsule collider.
   */
  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  /**
   * Places the capsule probe so its feet sit at a position.
   *
   * @param feetPosition World feet position.
   */
  placeAtFeet(feetPosition: THREE.Vector3): void {
    this.collider.setTranslation({
      x: feetPosition.x,
      y: feetPosition.y + PLAYER_CAPSULE_CENTER_ABOVE_FEET_METERS,
      z: feetPosition.z,
    });
  }

  /**
   * Computes a collision-aware move from feet by a desired translation.
   *
   * @param feetPosition World feet position at the start.
   * @param desiredTranslation Desired world translation this frame.
   * @param snapToGround True to keep the feet glued to ground below.
   * @returns Allowed translation (reused vector).
   */
  move(feetPosition: THREE.Vector3, desiredTranslation: THREE.Vector3, snapToGround: boolean): THREE.Vector3 {
    this.placeAtFeet(feetPosition);
    if (snapToGround) {
      this.controller.enableSnapToGround(PLAYER_CHARACTER_SNAP_TO_GROUND_METERS);
    } else {
      this.controller.disableSnapToGround();
    }
    this.controller.computeColliderMovement(this.collider, {
      x: desiredTranslation.x,
      y: desiredTranslation.y,
      z: desiredTranslation.z,
    });
    const movement = this.controller.computedMovement();
    this.computedMovement.set(movement.x, movement.y, movement.z);
    this.captureCollisions();
    return this.computedMovement;
  }

  /**
   * Returns whether the last move ended on walkable ground.
   *
   * @returns True when grounded.
   */
  wasLastMoveGrounded(): boolean {
    return this.controller.computedGrounded();
  }

  /**
   * Returns the obstacles touched during the last move.
   *
   * @returns Collision list (only the first getLastCollisionCount() are valid).
   */
  getLastCollisions(): readonly PlayerCharacterMoveCollision[] {
    return this.collisions;
  }

  /**
   * Returns how many obstacles the last move touched.
   *
   * @returns Collision count.
   */
  getLastCollisionCount(): number {
    return this.collisionCount;
  }

  /** Copies the controller's collision normals into reusable records. */
  private captureCollisions(): void {
    this.collisionCount = this.controller.numComputedCollisions();
    for (let index = 0; index < this.collisionCount; index++) {
      const collision = this.controller.computedCollision(index);
      const record = this.collisions[index] ?? { normal: new THREE.Vector3() };
      this.collisions[index] = record;
      if (collision) {
        record.normal.set(collision.normal1.x, collision.normal1.y, collision.normal1.z);
      } else {
        record.normal.set(0, 0, 0);
      }
    }
  }
}
