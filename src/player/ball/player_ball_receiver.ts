import * as THREE from 'three';
import type { PhysicsBallImpact } from '@/physics/ball/physics_ball_world.js';
import { PlayerBallClock } from './player_ball_clock.js';
import {
  PLAYER_BALL_BOUNCE_RANGE,
  PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS,
  PLAYER_BALL_RENDER_DELAY_MS,
  PLAYER_BALL_SAMPLES_MAXIMUM,
} from './player_ball_constants.js';
import type { PlayerBallSnapshot, PlayerBallState } from './player_ball_link.js';
import { playerBallMotionPosition, playerBallMotionVelocity, type PlayerBallSample } from './player_ball_motion.js';

/** Another member's ball as this client draws it. */
export interface PlayerBallShown {
  readonly key: string;
  readonly member: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

/** What one receiver frame shows and plays. */
export interface PlayerBallReceiverFrame {
  readonly balls: PlayerBallShown[];
  readonly impacts: PhysicsBallImpact[];
}

/** The received states of one remote ball. */
interface PlayerBallTrack {
  readonly key: string;
  readonly member: number;
  samples: PlayerBallSample[];
  /** Local time from which the ball is gone (a full snapshot left it out). */
  goneAt: number | null;
}

const scratchFrom = new THREE.Vector3();

/**
 * Other members' balls, drawn only from their throwers' snapshots: no physics
 * world, no simulation. Each snapshot is placed on this client's timeline by
 * the thrower's tick, and balls are drawn PLAYER_BALL_RENDER_DELAY_MS in the
 * past: between two snapshots along the first one's arc, blended to meet the
 * second; past the newest one extrapolated for a short while. A bounce is
 * played when the drawn time passes a snapshot whose bounce counter moved.
 */
export class PlayerBallReceiver {
  private readonly tracks: Map<string, PlayerBallTrack>;
  private readonly clocks: Map<number, PlayerBallClock>;
  private renderedAt: number;

  /** Creates an empty receiver. */
  constructor() {
    this.tracks = new Map();
    this.clocks = new Map();
    this.renderedAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Takes a thrower's snapshot.
   *
   * @param member Thrower.
   * @param snapshot Its balls.
   * @param now Arrival time in milliseconds.
   */
  snapshot(member: number, snapshot: PlayerBallSnapshot, now: number): void {
    let clock = this.clocks.get(member);
    if (clock === undefined) this.clocks.set(member, (clock = new PlayerBallClock()));
    const time = clock.timeOf(snapshot.tick, now);
    if (snapshot.full) this.markGone(member, snapshot, time);
    snapshot.balls.forEach((ball) => this.sampleAdd(member, ball, time));
  }

  /**
   * Draws every ball at the render time and collects the bounces passed.
   *
   * @param now Current time in milliseconds.
   * @returns Shown balls and bounces to play.
   */
  frame(now: number): PlayerBallReceiverFrame {
    const time = now - PLAYER_BALL_RENDER_DELAY_MS;
    const balls: PlayerBallShown[] = [];
    const impacts: PhysicsBallImpact[] = [];
    for (const track of [...this.tracks.values()]) {
      if (track.goneAt !== null && time >= track.goneAt) this.tracks.delete(track.key);
      else this.trackFrame(track, time, balls, impacts);
    }
    this.renderedAt = time;
    return { balls, impacts };
  }

  /**
   * Removes the balls of members a predicate rejects.
   *
   * @param keep Tells whether a member's balls stay.
   */
  keepMembers(keep: (member: number) => boolean): void {
    for (const track of [...this.tracks.values()]) if (keep(track.member) === false) this.tracks.delete(track.key);
    for (const member of [...this.clocks.keys()]) if (keep(member) === false) this.clocks.delete(member);
  }

  /** Removes every ball. */
  clear(): void {
    this.tracks.clear();
    this.clocks.clear();
    this.renderedAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Tells whether nothing is left to animate: every ball rests and its last
   * snapshot has been drawn.
   *
   * @param now Current time in milliseconds.
   * @returns True when settled.
   */
  isSettled(now: number): boolean {
    const time = now - PLAYER_BALL_RENDER_DELAY_MS;
    return [...this.tracks.values()].every((track) => {
      const last = track.samples.at(-1);
      return track.goneAt === null && last !== undefined && last.sleeping && last.time <= time;
    });
  }

  /**
   * Marks the member's balls a full snapshot leaves out as gone from its time.
   *
   * @param member Thrower.
   * @param snapshot Full snapshot.
   * @param time Local time of the snapshot.
   */
  private markGone(member: number, snapshot: PlayerBallSnapshot, time: number): void {
    const listed = new Set(snapshot.balls.map((ball) => `${member}:${ball.id}`));
    for (const track of this.tracks.values()) {
      if (track.member === member && track.goneAt === null && listed.has(track.key) === false) track.goneAt = time;
    }
  }

  /**
   * Adds a ball state; a ball id seen again after it was gone starts afresh.
   *
   * @param member Thrower.
   * @param ball Ball state.
   * @param time Local time of the state.
   */
  private sampleAdd(member: number, ball: PlayerBallState, time: number): void {
    const key = `${member}:${ball.id}`;
    let track = this.tracks.get(key);
    if (track === undefined || (track.goneAt !== null && time >= track.goneAt)) {
      track = { key, member, samples: [], goneAt: null };
      this.tracks.set(key, track);
    }
    const last = track.samples.at(-1);
    if (last !== undefined && time <= last.time) return;
    track.samples.push(playerBallSampleOf(ball, time, last));
    if (track.samples.length > PLAYER_BALL_SAMPLES_MAXIMUM) track.samples.shift();
  }

  /**
   * Draws one ball and collects its bounces; a ball whose first snapshot lies
   * after the render time is not shown yet.
   *
   * @param track Ball.
   * @param time Render time.
   * @param balls Receives the shown ball.
   * @param impacts Receives bounces passed since the last frame.
   */
  private trackFrame(
    track: PlayerBallTrack,
    time: number,
    balls: PlayerBallShown[],
    impacts: PhysicsBallImpact[],
  ): void {
    for (const sample of track.samples) {
      if (sample.bounced && sample.time > this.renderedAt && sample.time <= time)
        impacts.push({ key: track.key, position: sample.position.clone(), speed: sample.strength });
    }
    const index = track.samples.filter((sample) => sample.time <= time).length - 1;
    if (index < 0) return;
    track.samples.splice(0, index);
    balls.push({ key: track.key, member: track.member, ...playerBallInterpolate(track.samples, time) });
  }
}

/**
 * Builds a sample, noting whether the bounce counter moved since the previous
 * one (the counter wraps at 16).
 *
 * @param ball Ball state.
 * @param time Local time.
 * @param previous Previous sample of the ball, if any.
 * @returns Sample.
 */
function playerBallSampleOf(
  ball: PlayerBallState,
  time: number,
  previous: PlayerBallSample | undefined,
): PlayerBallSample {
  const moved = previous !== undefined && (ball.bounces - previous.bounces) % PLAYER_BALL_BOUNCE_RANGE !== 0;
  return {
    time,
    position: new THREE.Vector3(...ball.position),
    velocity: new THREE.Vector3(...ball.velocity),
    sleeping: ball.sleeping,
    rolling: ball.rolling,
    bounces: ball.bounces,
    strength: ball.strength,
    bounced: moved,
  };
}

/**
 * Places a ball at a render time from its samples (the first is the latest at
 * or before that time): along its arc blended to meet the next sample, or
 * extrapolated for at most PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS.
 *
 * @param samples Samples, the first at or before the time.
 * @param time Render time.
 * @returns Position and velocity.
 */
function playerBallInterpolate(
  samples: readonly PlayerBallSample[],
  time: number,
): { position: THREE.Vector3; velocity: THREE.Vector3 } {
  const [from, to] = samples as [PlayerBallSample, PlayerBallSample | undefined];
  const reach = to === undefined ? PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS : to.time - from.time;
  const elapsed = Math.min(time - from.time, reach) / 1000;
  const position = playerBallMotionPosition(from, elapsed, new THREE.Vector3());
  const velocity = playerBallMotionVelocity(from, elapsed, new THREE.Vector3());
  if (to === undefined) return { position, velocity };
  const share = (time - from.time) / reach;
  playerBallMotionPosition(from, reach / 1000, scratchFrom);
  position.addScaledVector(scratchFrom.subVectors(to.position, scratchFrom), share);
  return { position, velocity };
}
