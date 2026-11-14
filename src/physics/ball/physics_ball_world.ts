import type * as THREE from 'three';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import type { PhysicsBall } from './physics_ball.js';
import {
  PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND,
  PHYSICS_BALL_MAX_STEPS_PER_FRAME,
  PHYSICS_BALL_STEP_SECONDS,
} from './physics_ball_constants.js';
import { physicsBallMoverResolve, physicsBallPairResolve, type PhysicsBallMover } from './physics_ball_contacts.js';

/** A bounce loud enough to be heard. */
export interface PhysicsBallImpact {
  readonly key: string;
  readonly position: THREE.Vector3;
  readonly speed: number;
}

/** What happened during one or more steps. */
export interface PhysicsBallEvents {
  /** Audible bounces off the level, players and other balls. */
  readonly impacts: PhysicsBallImpact[];
  /**
   * Balls whose motion changed in a way level collision alone does not predict:
   * touched by a player or another ball, woken up or put to rest.
   */
  readonly changed: Set<string>;
}

/**
 * A set of balls stepped together at a fixed rate: each ball sweeps against the
 * level, then balls are pushed by player capsules and bounce off each other.
 * Each thrower runs one for its own balls.
 */
export class PhysicsBallWorld {
  private readonly balls: Map<string, PhysicsBall>;
  private remainderSeconds: number;
  /** Steps taken so far. */
  tick: number;

  /** Creates an empty world. */
  constructor() {
    this.balls = new Map();
    this.remainderSeconds = 0;
    this.tick = 0;
  }

  /**
   * Adds or replaces a ball.
   *
   * @param key Ball key.
   * @param ball Ball.
   */
  set(key: string, ball: PhysicsBall): void {
    this.balls.set(key, ball);
  }

  /**
   * Removes a ball.
   *
   * @param key Ball key.
   * @returns True when it existed.
   */
  delete(key: string): boolean {
    return this.balls.delete(key);
  }

  /**
   * Returns whether any ball still moves.
   *
   * @returns True while a ball is awake.
   */
  isAwake(): boolean {
    return [...this.balls.values()].some((ball) => !ball.isResting);
  }

  /**
   * Advances by elapsed time in fixed steps (at most a frame's worth).
   *
   * @param levelWorld Level collision.
   * @param movers Player capsules.
   * @param seconds Elapsed time.
   * @returns Events of every step taken.
   */
  advance(levelWorld: PhysicsLevelWorld, movers: readonly PhysicsBallMover[], seconds: number): PhysicsBallEvents {
    this.remainderSeconds += Math.max(0, seconds);
    const steps = Math.min(
      PHYSICS_BALL_MAX_STEPS_PER_FRAME,
      Math.floor(this.remainderSeconds / PHYSICS_BALL_STEP_SECONDS),
    );
    const capped = steps === PHYSICS_BALL_MAX_STEPS_PER_FRAME;
    this.remainderSeconds = capped ? 0 : this.remainderSeconds - steps * PHYSICS_BALL_STEP_SECONDS;
    const events: PhysicsBallEvents = { impacts: [], changed: new Set() };
    for (let step = 0; step < steps; step++) this.step(levelWorld, movers, events);
    return events;
  }

  /**
   * Takes one fixed step.
   *
   * @param levelWorld Level collision.
   * @param movers Player capsules.
   * @param events Receives what happened.
   */
  step(levelWorld: PhysicsLevelWorld, movers: readonly PhysicsBallMover[], events: PhysicsBallEvents): void {
    this.tick++;
    const entries = [...this.balls];
    const resting = entries.map(([, ball]) => ball.isResting);
    entries.forEach(([key, ball]) => {
      const before = ball.impacts;
      ball.advance(levelWorld);
      if (ball.impacts !== before)
        events.impacts.push({ key, position: ball.position.clone(), speed: ball.impactSpeed });
    });
    entries.forEach((entry) =>
      movers.forEach((mover) => physicsBallWorldTouch(entry, physicsBallMoverResolve(entry[1], mover), events)),
    );
    this.collidePairs(entries, events);
    entries.forEach(([key, ball], index) => {
      if (ball.isResting !== resting[index]) events.changed.add(key);
    });
  }

  /**
   * Bounces every pair of balls that overlap; pairs that both rest are skipped.
   *
   * @param entries Balls of this step.
   * @param events Receives what happened.
   */
  private collidePairs(entries: [string, PhysicsBall][], events: PhysicsBallEvents): void {
    for (let first = 0; first < entries.length; first++) {
      for (let second = first + 1; second < entries.length; second++) {
        const a = entries[first];
        const b = entries[second];
        if (!a || !b || (a[1].isResting && b[1].isResting)) continue;
        const closing = physicsBallPairResolve(a[1], b[1]);
        physicsBallWorldTouch(a, closing, events);
        if (closing >= 0) events.changed.add(b[0]);
      }
    }
  }
}

/**
 * Records a contact: the ball changed, and a fast one is heard.
 *
 * @param entry Key and ball.
 * @param closing Closing speed of the contact, or -1 without contact.
 * @param events Receives what happened.
 */
function physicsBallWorldTouch(entry: [string, PhysicsBall], closing: number, events: PhysicsBallEvents): void {
  if (closing < 0) return;
  const [key, ball] = entry;
  events.changed.add(key);
  if (closing < PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND) return;
  ball.countImpact(closing);
  events.impacts.push({ key, position: ball.position.clone(), speed: closing });
}
