import * as THREE from 'three';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import type { PhysicsBallImpact } from '@/physics/ball/physics_ball_world.js';
import { PlayerBallClock } from './player_ball_clock.js';
import {
  PLAYER_BALL_BLEND_MS,
  PLAYER_BALL_BOUNCE_RANGE,
  PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS,
  PLAYER_BALL_HERMITE_SLACK_METERS_PER_SECOND,
  PLAYER_BALL_RENDER_DELAY_MS,
  PLAYER_BALL_SAMPLES_MAXIMUM,
  PLAYER_BALL_SNAP_METERS,
} from './player_ball_constants.js';
import type { PlayerBallSnapshot, PlayerBallState } from './player_ball_link.js';
import { playerBallMotionPosition, playerBallMotionVelocity, type PlayerBallSample } from './player_ball_motion.js';

/** Another member's ball as this client draws it. */
export interface PlayerBallShown {
  readonly key: string;
  readonly member: number;
  readonly kind: PhysicsToyKind;
  /** Orientation (paper planes). */
  readonly quaternion: THREE.Quaternion;
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
  /** Where the ball was drawn last, or null before it was drawn. */
  shown: THREE.Vector3 | null;
  /** When it was drawn last. */
  shownAt: number;
  /** Drawn minus sampled position, fading out (blending back after a jump). */
  readonly offset: THREE.Vector3;
  /** Sample the last frame extrapolated from, or null when it interpolated. */
  extrapolatedFrom: PlayerBallSample | null;
}

/** A ball placed at a render time from its samples. */
export interface PlayerBallPlaced {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** Sample extrapolated from (past the newest one), or null. */
  readonly extrapolatedFrom: PlayerBallSample | null;
}

const scratchChord = new THREE.Vector3();
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Other members' balls, drawn only from their throwers' snapshots: no physics
 * world, no prediction (snapshot interpolation, as in Source). Each snapshot is
 * placed on this client's timeline by the thrower's tick, and balls are drawn
 * PLAYER_BALL_RENDER_DELAY_MS in the past, between the two snapshots around
 * that time: along a cubic Hermite curve through their positions and
 * velocities, or a straight line when the velocities do not fit the way between
 * them (a bounce or a push). When the snapshots run dry the ball flies on for
 * at most PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS, then waits; the next snapshot is
 * blended in instead of jumped to. New balls and large errors snap. A bounce is
 * played when the drawn time passes a snapshot whose bounce counter moved.
 * Paper planes are drawn the same way, their attitude slerped between
 * snapshots, and glide straight on (no gravity arc) when extrapolated.
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
      else this.trackFrame(track, now, time, balls, impacts);
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
   * Tells whether nothing is left to animate: every ball rests, its last
   * snapshot has been drawn and it has blended back.
   *
   * @param now Current time in milliseconds.
   * @returns True when settled.
   */
  isSettled(now: number): boolean {
    const time = now - PLAYER_BALL_RENDER_DELAY_MS;
    return [...this.tracks.values()].every((track) => {
      const last = track.samples.at(-1);
      return (
        track.goneAt === null &&
        last !== undefined &&
        last.sleeping &&
        last.time <= time &&
        track.offset.lengthSq() === 0
      );
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
   * Adds a ball state; a ball id seen again after it was gone, or now naming
   * another toy kind, starts afresh.
   *
   * @param member Thrower.
   * @param ball Ball state.
   * @param time Local time of the state.
   */
  private sampleAdd(member: number, ball: PlayerBallState, time: number): void {
    const key = `${member}:${ball.id}`;
    let track = this.tracks.get(key);
    if (track === undefined || (track.goneAt !== null && time >= track.goneAt)) {
      track = {
        key,
        member,
        samples: [],
        goneAt: null,
        shown: null,
        shownAt: 0,
        offset: new THREE.Vector3(),
        extrapolatedFrom: null,
      };
      this.tracks.set(key, track);
    }
    const last = this.sampleLastOfKind(track, ball.kind ?? 'tennis');
    if (last !== undefined && time <= last.time) return;
    track.samples.push(playerBallSampleOf(ball, time, last));
    if (track.samples.length > PLAYER_BALL_SAMPLES_MAXIMUM) track.samples.shift();
  }

  /**
   * Returns a track's newest sample, first clearing the track when that sample
   * shows another toy kind.
   *
   * @param track Track.
   * @param kind Toy kind of the incoming state.
   * @returns Newest sample of that kind, if any.
   */
  private sampleLastOfKind(track: PlayerBallTrack, kind: PhysicsToyKind): PlayerBallSample | undefined {
    const last = track.samples.at(-1);
    if (last === undefined || last.kind === kind) return last;
    track.samples = [];
    track.shown = null;
    return undefined;
  }

  /**
   * Draws one ball and collects its bounces; a ball whose first snapshot lies
   * after the render time is not shown yet.
   *
   * @param track Ball.
   * @param now Current time.
   * @param time Render time.
   * @param balls Receives the shown ball.
   * @param impacts Receives bounces passed since the last frame.
   */
  private trackFrame(
    track: PlayerBallTrack,
    now: number,
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
    const placed = playerBallPlace(track.samples, time);
    this.blend(track, placed, now);
    track.extrapolatedFrom = placed.extrapolatedFrom;
    track.shown = placed.position.clone().add(track.offset);
    track.shownAt = now;
    const { kind } = track.samples[0] as PlayerBallSample;
    const shown = { key: track.key, member: track.member, kind, quaternion: placed.quaternion };
    balls.push({ ...shown, position: track.shown.clone(), velocity: placed.velocity });
  }

  /**
   * Updates the drawn offset: a jump of the sampled position (leaving or
   * changing an extrapolation) becomes an offset that fades out, unless it is
   * large or the ball is new, which snap.
   *
   * @param track Ball.
   * @param placed Sampled position this frame.
   * @param now Current time.
   */
  private blend(track: PlayerBallTrack, placed: PlayerBallPlaced, now: number): void {
    if (track.shown === null) {
      track.offset.set(0, 0, 0);
      return;
    }
    const from = track.extrapolatedFrom;
    if (from !== null && placed.extrapolatedFrom !== from) track.offset.subVectors(track.shown, placed.position);
    else track.offset.multiplyScalar(Math.exp(-Math.max(0, now - track.shownAt) / PLAYER_BALL_BLEND_MS));
    if (track.offset.length() > PLAYER_BALL_SNAP_METERS || track.offset.lengthSq() < 1e-8) track.offset.set(0, 0, 0);
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
  const attitude = ball.attitude ?? [0, 0, 0];
  return {
    time,
    kind: ball.kind ?? 'tennis',
    quaternion: new THREE.Quaternion().setFromEuler(scratchEuler.set(attitude[1], attitude[0], attitude[2])),
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
 * or before that time): interpolated towards the next sample, or past the
 * newest one extrapolated without collision for at most
 * PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS.
 *
 * @param samples Samples, the first at or before the time.
 * @param time Render time.
 * @returns Position, velocity and the sample extrapolated from.
 */
export function playerBallPlace(samples: readonly PlayerBallSample[], time: number): PlayerBallPlaced {
  const [from, to] = samples as [PlayerBallSample, PlayerBallSample | undefined];
  if (to !== undefined) {
    const s = Math.min(1, Math.max(0, (time - from.time) / (to.time - from.time)));
    const quaternion = from.quaternion.clone().slerp(to.quaternion, s);
    return { ...playerBallInterpolate(from, to, time), quaternion, extrapolatedFrom: null };
  }
  const elapsed = Math.min(time - from.time, PLAYER_BALL_EXTRAPOLATE_MAXIMUM_MS) / 1000;
  return {
    quaternion: from.quaternion.clone(),
    position: playerBallMotionPosition(from, elapsed, new THREE.Vector3()),
    velocity: playerBallMotionVelocity(from, elapsed, new THREE.Vector3()),
    extrapolatedFrom: from.sleeping || elapsed <= 0 ? null : from,
  };
}

/**
 * Interpolates between two samples: cubic Hermite through both positions and
 * velocities, or linear when a velocity does not fit the average velocity
 * between them.
 *
 * @param from Sample at or before the time.
 * @param to Next sample.
 * @param time Render time between them.
 * @returns Position and velocity.
 */
export function playerBallInterpolate(
  from: PlayerBallSample,
  to: PlayerBallSample,
  time: number,
): { position: THREE.Vector3; velocity: THREE.Vector3 } {
  const span = (to.time - from.time) / 1000;
  const s = Math.min(1, Math.max(0, (time - from.time) / (to.time - from.time)));
  const chord = scratchChord.subVectors(to.position, from.position).divideScalar(span);
  const slack = PLAYER_BALL_HERMITE_SLACK_METERS_PER_SECOND;
  const fits = from.velocity.distanceTo(chord) <= slack && to.velocity.distanceTo(chord) <= slack;
  if (!fits) return { position: from.position.clone().lerp(to.position, s), velocity: chord.clone() };
  const s2 = s * s;
  const s3 = s2 * s;
  const position = from.position
    .clone()
    .multiplyScalar(2 * s3 - 3 * s2 + 1)
    .addScaledVector(from.velocity, (s3 - 2 * s2 + s) * span)
    .addScaledVector(to.position, -2 * s3 + 3 * s2)
    .addScaledVector(to.velocity, (s3 - s2) * span);
  const velocity = from.position
    .clone()
    .multiplyScalar((6 * s2 - 6 * s) / span)
    .addScaledVector(from.velocity, 3 * s2 - 4 * s + 1)
    .addScaledVector(to.position, (-6 * s2 + 6 * s) / span)
    .addScaledVector(to.velocity, 3 * s2 - 2 * s);
  return { position, velocity };
}
