import type * as THREE from 'three';
import type { PlayerBallState } from './player_ball_link.js';
import { PhysicsBall } from '@/physics/ball/physics_ball.js';
import type { PhysicsBallMover } from '@/physics/ball/physics_ball_contacts.js';
import { PhysicsBallWorld, type PhysicsBallImpact } from '@/physics/ball/physics_ball_world.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PLAYER_BALL_KILL_DEPTH_METERS, PLAYER_BALL_MAXIMUM_PER_MEMBER } from './player_ball_constants.js';

/** One ball of the local thrower. */
export interface PlayerBallBody {
  readonly key: string;
  readonly id: number;
  readonly ball: PhysicsBall;
  readonly startY: number;
}

/** What changed since the publisher last asked. */
export interface PlayerBallChanges {
  /** Balls thrown or whose motion changed unpredictably. */
  readonly keys: Set<string>;
  /** True when a ball disappeared. */
  readonly removed: boolean;
}

/**
 * The thrower's own balls: this client alone simulates them (at most four, ids
 * 1..4, a fifth throw removes the oldest) against level collision, the players
 * and the other members' balls, and remembers what changed for the next
 * snapshot.
 */
export class PlayerBallAuthority {
  private readonly world: PhysicsBallWorld;
  private readonly bodies: PlayerBallBody[];
  private changedKeys: Set<string>;
  private removedAny: boolean;

  /** Creates an empty simulation. */
  constructor() {
    this.world = new PhysicsBallWorld();
    this.bodies = [];
    this.changedKeys = new Set();
    this.removedAny = false;
  }

  /**
   * Throws a ball, removing the oldest when four are out already.
   *
   * @param position Start position.
   * @param velocity Start velocity.
   * @returns The new ball.
   */
  spawn(position: THREE.Vector3, velocity: THREE.Vector3): PlayerBallBody {
    const surplus = this.bodies.length - PLAYER_BALL_MAXIMUM_PER_MEMBER + 1;
    const oldest = new Set(this.bodies.slice(0, Math.max(0, surplus)));
    this.removeWhere((body) => oldest.has(body));
    const id = this.idFree();
    const body = { key: String(id), id, ball: new PhysicsBall(position, velocity), startY: position.y };
    this.bodies.push(body);
    this.world.set(body.key, body.ball);
    this.changedKeys.add(body.key);
    return body;
  }

  /**
   * Removes the balls a predicate selects.
   *
   * @param predicate Selects balls to remove.
   * @returns True when any was removed.
   */
  removeWhere(predicate: (body: PlayerBallBody) => boolean): boolean {
    const before = this.bodies.length;
    for (let index = this.bodies.length - 1; index >= 0; index--) {
      const body = this.bodies[index];
      if (!body || !predicate(body)) continue;
      this.bodies.splice(index, 1);
      this.world.delete(body.key);
    }
    const removed = this.bodies.length !== before;
    this.removedAny ||= removed;
    return removed;
  }

  /**
   * Advances every ball by elapsed time in fixed steps and removes balls that
   * fell out of the world.
   *
   * @param levelWorld Level collision.
   * @param movers Player capsules and the other members' balls.
   * @param seconds Elapsed time.
   * @returns Audible impacts.
   */
  advance(levelWorld: PhysicsLevelWorld, movers: readonly PhysicsBallMover[], seconds: number): PhysicsBallImpact[] {
    const events = this.world.advance(levelWorld, movers, seconds);
    events.changed.forEach((key) => this.changedKeys.add(key));
    this.removeWhere((body) => body.ball.position.y < body.startY - PLAYER_BALL_KILL_DEPTH_METERS);
    return events.impacts;
  }

  /**
   * Hands over what changed since the last call.
   *
   * @returns Changed keys and whether a ball disappeared.
   */
  takeChanges(): PlayerBallChanges {
    const changes = { keys: this.changedKeys, removed: this.removedAny };
    this.changedKeys = new Set();
    this.removedAny = false;
    return changes;
  }

  /**
   * Returns the balls, oldest first.
   *
   * @returns Bodies.
   */
  getBodies(): readonly PlayerBallBody[] {
    return this.bodies;
  }

  /**
   * Returns whether any ball still moves.
   *
   * @returns True while awake.
   */
  isAwake(): boolean {
    return this.world.isAwake();
  }

  /**
   * Returns the simulation step count.
   *
   * @returns Tick.
   */
  getTick(): number {
    return this.world.tick;
  }

  /**
   * Describes balls for a snapshot.
   *
   * @param select Picks the balls to list.
   * @returns States.
   */
  states(select: (body: PlayerBallBody) => boolean = () => true): PlayerBallState[] {
    return this.bodies.filter(select).map((body) => ({
      id: body.id,
      position: [body.ball.position.x, body.ball.position.y, body.ball.position.z],
      velocity: [body.ball.velocity.x, body.ball.velocity.y, body.ball.velocity.z],
      sleeping: body.ball.isResting,
      rolling: body.ball.isRolling(),
      bounces: body.ball.impacts,
      strength: body.ball.impactSpeed,
    }));
  }

  /**
   * Picks the lowest id no ball uses.
   *
   * @returns Id 1..4.
   */
  private idFree(): number {
    let id = 1;
    while (this.bodies.some((body) => body.id === id)) id++;
    return id;
  }
}

/**
 * Builds the start of a throw from the eye along the look direction.
 *
 * @param eye Eye position.
 * @param forward Unit look direction.
 * @param forwardMeters Distance in front of the eye.
 * @param speed Throw speed.
 * @param lift Extra upward speed.
 * @returns Start position and velocity.
 */
export function playerBallThrowStart(
  eye: THREE.Vector3,
  forward: THREE.Vector3,
  forwardMeters: number,
  speed: number,
  lift: number,
): { position: THREE.Vector3; velocity: THREE.Vector3 } {
  const position = eye.clone().addScaledVector(forward, forwardMeters);
  const velocity = forward.clone().multiplyScalar(speed);
  velocity.y += lift;
  return { position, velocity };
}
