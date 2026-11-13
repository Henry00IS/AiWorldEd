import type * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';

/** One toy (a ball or a paper plane) as its thrower publishes it. */
export interface PlayerBallState {
  /** Id, unique among the thrower's toys (1..4). */
  id: number;
  /** Toy kind (a tennis ball when absent). */
  kind?: PhysicsToyKind;
  /** Center position. */
  position: [number, number, number];
  /** Velocity in meters per second. */
  velocity: [number, number, number];
  /** Whether it rests. */
  sleeping: boolean;
  /** Whether it rolls or slides on a surface (no gravity arc). */
  rolling: boolean;
  /** Bounces so far (receivers compare it modulo 16). */
  bounces: number;
  /** Impact speed of the latest bounce in meters per second. */
  strength: number;
  /** Heading, pitch and bank in radians (paper planes only). */
  attitude?: [number, number, number];
}

/** The thrower's balls at one of its simulation ticks. */
export interface PlayerBallSnapshot {
  /** True when every ball is listed (missing ones are gone). */
  full: boolean;
  /** Thrower simulation step the states belong to (wraps at 16 bits). */
  tick: number;
  /** Listed balls. */
  balls: PlayerBallState[];
  /**
   * Toy the thrower holds in play mode, when announced (full snapshots and
   * changes); receivers keep the last one.
   */
  held?: PhysicsToyKind;
}

/** Another member in play mode, as this client shows them. */
export interface PlayerBallPlayer {
  member: number;
  /** Shown feet position. */
  feet: THREE.Vector3;
  /** Smoothed velocity in meters per second. */
  velocity: THREE.Vector3;
}

/** What the room tells the ball system. */
export interface PlayerBallLinkListener {
  /**
   * Another member's latest snapshot of its own balls.
   *
   * @param member Thrower, stamped by the relay.
   * @param snapshot Its balls.
   */
  snapshot(member: number, snapshot: PlayerBallSnapshot): void;
  /**
   * A new member joined the room; a thrower with live balls owes it a full
   * snapshot, since resting balls are never repeated.
   *
   * @param member Member id.
   */
  memberJoined(member: number): void;
  /**
   * A member left the room.
   *
   * @param member Member id.
   */
  memberLeft(member: number): void;
}

/**
 * Room link of the ball system. Present only while in a synced room whose relay
 * supports toy frames; sending is low priority and may drop.
 */
export interface PlayerBallLink {
  /**
   * Returns this client's relay user id.
   *
   * @returns User id.
   */
  self(): number;
  /**
   * Lists the other members in play mode with their shown position and
   * velocity.
   *
   * @returns Players.
   */
  players(): PlayerBallPlayer[];
  /**
   * Returns a member's collaboration color.
   *
   * @param member Member id.
   * @returns Hex color.
   */
  colorOf(member: number): number;
  /**
   * Sends a snapshot of this client's own balls.
   *
   * @param snapshot Every own ball or the ones that changed.
   * @returns True when the snapshot went out.
   */
  publish(snapshot: PlayerBallSnapshot): boolean;
  /**
   * Sets or clears the listener.
   *
   * @param listener Listener, or null.
   */
  listen(listener: PlayerBallLinkListener | null): void;
}
