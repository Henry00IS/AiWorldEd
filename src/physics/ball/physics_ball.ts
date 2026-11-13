import * as THREE from 'three';
import type { PhysicsLevelQueryHit } from '@/physics/level/physics_level_query_hit.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import {
  PHYSICS_BALL_CONTACT_SKIN_METERS,
  PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED,
  PHYSICS_BALL_GROUND_NORMAL_Y,
  PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND,
  PHYSICS_BALL_MAX_CONTACTS_PER_STEP,
  PHYSICS_BALL_REST_SPEED_METERS_PER_SECOND,
  PHYSICS_BALL_STEP_SECONDS,
  PHYSICS_TOY_SHAPES,
  type PhysicsToyShape,
} from './physics_ball_constants.js';

const scratchMove = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * One thrown ball, simulated in fixed steps with sphere sweeps against static
 * level colliders. It bounces, rolls, comes to rest, wakes up when its support
 * disappears and counts audible impacts.
 */
export class PhysicsBall {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  step: number;
  isResting: boolean;
  impacts: number;
  impactSpeed: number;
  /** Size and contact behaviour (a tennis ball unless given). */
  readonly shape: PhysicsToyShape;
  protected isOnGround: boolean;

  /**
   * Creates a ball at its throw state.
   *
   * @param origin Throw origin.
   * @param velocity Throw velocity.
   * @param shape Size and contact behaviour.
   */
  constructor(origin: THREE.Vector3, velocity: THREE.Vector3, shape: PhysicsToyShape = PHYSICS_TOY_SHAPES.tennis) {
    this.shape = shape;
    this.position = origin.clone();
    this.velocity = velocity.clone();
    this.step = 0;
    this.isResting = false;
    this.impacts = 0;
    this.impactSpeed = 0;
    this.isOnGround = false;
  }

  /** Puts the ball to rest where it is. */
  rest(): void {
    this.velocity.set(0, 0, 0);
    this.isOnGround = true;
    this.isResting = true;
  }

  /**
   * Returns whether the ball rolls or slides on a surface (moving without a
   * gravity arc).
   *
   * @returns True while rolling.
   */
  isRolling(): boolean {
    return this.isOnGround && this.isResting === false;
  }

  /** Wakes a resting ball (something touched it). */
  wake(): void {
    this.isResting = false;
  }

  /**
   * Advances one fixed step: gravity or rolling drag, then the swept move.
   *
   * @param levelWorld Level collision.
   */
  advance(levelWorld: PhysicsLevelWorld): void {
    this.step++;
    if (this.isResting && this.isSupported(levelWorld)) {
      return;
    }
    this.isResting = false;
    if (this.isOnGround) {
      this.applyRollingDamping();
    } else {
      this.applyAirForces();
    }
    this.isOnGround = false;
    scratchMove.copy(this.velocity).multiplyScalar(PHYSICS_BALL_STEP_SECONDS);
    this.sweep(levelWorld, scratchMove);
    this.pushOutOfSurfaces(levelWorld);
    this.settleWhenSlow();
  }

  /**
   * Returns whether ground still lies right under a resting ball (an edit may
   * have removed it).
   *
   * @param levelWorld Level collision.
   * @returns True when supported.
   */
  private isSupported(levelWorld: PhysicsLevelWorld): boolean {
    const reach = PHYSICS_BALL_CONTACT_SKIN_METERS * 4;
    return levelWorld.castSphere(this.position, DOWN, this.shape.radius, reach, false) !== null;
  }

  /** Accelerates a flying ball: gravity only. */
  protected applyAirForces(): void {
    this.velocity.y -= PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED * PHYSICS_BALL_STEP_SECONDS;
  }

  /** Slows a rolling ball. */
  protected applyRollingDamping(): void {
    const keep = 1 - this.shape.rollDamping * PHYSICS_BALL_STEP_SECONDS;
    this.velocity.x *= keep;
    this.velocity.z *= keep;
    this.velocity.y -= PHYSICS_BALL_GRAVITY_METERS_PER_SECOND_SQUARED * PHYSICS_BALL_STEP_SECONDS;
  }

  /**
   * Moves along a displacement, bouncing off each surface it meets.
   *
   * @param levelWorld Level collision.
   * @param move Displacement for this step (consumed).
   */
  private sweep(levelWorld: PhysicsLevelWorld, move: THREE.Vector3): void {
    for (let contact = 0; contact < PHYSICS_BALL_MAX_CONTACTS_PER_STEP; contact++) {
      const distance = move.length();
      if (distance <= 0) {
        return;
      }
      scratchDirection.copy(move).divideScalar(distance);
      const hit = levelWorld.castSphere(this.position, scratchDirection, this.shape.radius, distance, false);
      if (!hit) {
        this.position.add(move);
        return;
      }
      const normal = this.hitNormal(levelWorld, hit);
      if (hit.distance <= PHYSICS_BALL_CONTACT_SKIN_METERS && this.velocity.dot(normal) >= 0) {
        this.position.add(move);
        return;
      }
      const travel = Math.max(0, hit.distance - PHYSICS_BALL_CONTACT_SKIN_METERS);
      this.position.addScaledVector(scratchDirection, travel);
      this.bounce(normal);
      move.copy(this.velocity).multiplyScalar(PHYSICS_BALL_STEP_SECONDS * ((distance - travel) / distance));
    }
  }

  /**
   * Returns the normal of a sweep hit. A sweep that starts already touching a
   * surface reports an unreliable normal (it made rolling balls hop sideways),
   * so the contact query's normal is used then.
   *
   * @param levelWorld Level collision.
   * @param hit Sweep hit.
   * @returns Surface normal facing the ball.
   */
  private hitNormal(levelWorld: PhysicsLevelWorld, hit: PhysicsLevelQueryHit): THREE.Vector3 {
    if (hit.distance > PHYSICS_BALL_CONTACT_SKIN_METERS) return hit.normal;
    const reach = PHYSICS_BALL_CONTACT_SKIN_METERS * 2;
    return levelWorld.findSphereContact(this.position, this.shape.radius, reach)?.normal ?? hit.normal;
  }

  /**
   * Reflects the velocity off a surface: bounces when fast, rolls when slow.
   *
   * @param normal Surface normal facing the ball.
   */
  protected bounce(normal: THREE.Vector3): void {
    const normalSpeed = this.velocity.dot(normal);
    if (normalSpeed >= 0) {
      return;
    }
    this.velocity.addScaledVector(normal, -normalSpeed);
    const isGround = normal.y >= PHYSICS_BALL_GROUND_NORMAL_Y;
    if (isGround && -normalSpeed < this.shape.rollNormalSpeed) {
      this.isOnGround = true;
      return;
    }
    this.velocity.multiplyScalar(this.shape.bounceFriction);
    this.velocity.addScaledVector(normal, -normalSpeed * this.shape.restitution);
    this.countImpact(-normalSpeed);
  }

  /**
   * Counts a bounce that is fast enough to be heard.
   *
   * @param speed Speed into the surface in meters per second.
   */
  countImpact(speed: number): void {
    if (speed < PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND) {
      return;
    }
    this.impacts++;
    this.impactSpeed = speed;
  }

  /**
   * Pushes the ball back to the contact skin when a sweep ended slightly inside
   * a surface, and treats that surface as a contact.
   *
   * @param levelWorld Level collision.
   */
  private pushOutOfSurfaces(levelWorld: PhysicsLevelWorld): void {
    for (let pass = 0; pass < PHYSICS_BALL_MAX_CONTACTS_PER_STEP; pass++) {
      const contact = levelWorld.findSphereContact(this.position, this.shape.radius, PHYSICS_BALL_CONTACT_SKIN_METERS);
      if (!contact || contact.distance >= 0) {
        return;
      }
      this.position.addScaledVector(contact.normal, PHYSICS_BALL_CONTACT_SKIN_METERS - contact.distance);
      this.bounce(contact.normal);
    }
  }

  /** Stops a ball that rolls slower than the rest speed. */
  private settleWhenSlow(): void {
    if (!this.isOnGround) {
      return;
    }
    if (
      this.velocity.lengthSq() <
      PHYSICS_BALL_REST_SPEED_METERS_PER_SECOND * PHYSICS_BALL_REST_SPEED_METERS_PER_SECOND
    ) {
      this.rest();
    }
  }
}
