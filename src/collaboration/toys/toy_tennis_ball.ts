import {
  TOY_FLAG_GROUNDED,
  TOY_FLAG_SLEEPING,
  TOY_TYPE_TENNIS_BALL,
  toyFramePrecision,
  type ToyEntry,
  type ToyFrame,
  type ToySnapshot,
} from '@/collaboration/shared/toy_frame.js';
import type { PlayerBallSnapshot, PlayerBallState } from '@/player/ball/player_ball_link.js';

/** Bytes of a tennis ball payload: bounce byte and velocity. */
export const TOY_TENNIS_BALL_PAYLOAD_BYTES = 7;
/** Velocity units per meter per second (about 2 mm/s, up to 64 m/s). */
export const TOY_TENNIS_BALL_VELOCITY_SCALE = 512;
/** Meters per second per strength step (up to 30 m/s). */
export const TOY_TENNIS_BALL_STRENGTH_STEP = 2;
/** Largest bounce counter and strength step (one nibble each). */
const TOY_TENNIS_BALL_NIBBLE = 15;
/** Largest stored velocity magnitude (int16, keeping -32768 unused). */
const TOY_TENNIS_BALL_INT16 = 32767;

/**
 * Turns the thrower's ball snapshot into a toy snapshot.
 *
 * @param snapshot Own balls.
 * @returns Toy snapshot with tennis ball entries.
 */
export function toyTennisBallEncode(snapshot: PlayerBallSnapshot): ToySnapshot {
  const frame = toyFramePrecision(snapshot.balls.map((ball) => ball.position));
  const entries = snapshot.balls.map((ball) => toyTennisBallEntry(ball));
  return { full: snapshot.full, tick: snapshot.tick, ...frame, entries };
}

/**
 * Builds the toy entry of one ball.
 *
 * @param ball Ball state.
 * @returns Entry.
 */
function toyTennisBallEntry(ball: PlayerBallState): ToyEntry {
  const flags = (ball.sleeping ? TOY_FLAG_SLEEPING : 0) | (ball.rolling ? TOY_FLAG_GROUNDED : 0);
  const payload = new Uint8Array(TOY_TENNIS_BALL_PAYLOAD_BYTES);
  const view = new DataView(payload.buffer);
  const step = Math.round(ball.strength / TOY_TENNIS_BALL_STRENGTH_STEP);
  payload[0] = ((ball.bounces & TOY_TENNIS_BALL_NIBBLE) << 4) | Math.max(0, Math.min(TOY_TENNIS_BALL_NIBBLE, step));
  ball.velocity.forEach((value, axis) => view.setInt16(1 + axis * 2, toyTennisBallVelocity(value)));
  return { type: TOY_TYPE_TENNIS_BALL, id: ball.id, flags, position: [...ball.position], payload };
}

/**
 * Rounds and clamps a velocity to the stored int16 range.
 *
 * @param value Velocity in meters per second.
 * @returns Stored value.
 */
function toyTennisBallVelocity(value: number): number {
  const units = Math.round(value * TOY_TENNIS_BALL_VELOCITY_SCALE);
  return Math.max(-TOY_TENNIS_BALL_INT16, Math.min(TOY_TENNIS_BALL_INT16, units));
}

/**
 * Reads the tennis balls of a relayed toy frame; other toy types are ignored. A
 * malformed ball payload rejects the whole frame.
 *
 * @param frame Decoded toy frame.
 * @returns Ball snapshot, or null when a ball payload is malformed.
 */
export function toyTennisBallDecode(frame: ToyFrame): PlayerBallSnapshot | null {
  const balls: PlayerBallState[] = [];
  for (const entry of frame.entries) {
    if (entry.type !== TOY_TYPE_TENNIS_BALL) continue;
    const ball = toyTennisBallRead(entry);
    if (ball === null) return null;
    balls.push(ball);
  }
  return { full: frame.full, tick: frame.tick, balls };
}

/**
 * Reads one ball payload: exact length and velocities within range.
 *
 * @param entry Tennis ball entry.
 * @returns Ball state, or null when malformed.
 */
function toyTennisBallRead(entry: ToyEntry): PlayerBallState | null {
  if (entry.payload.byteLength !== TOY_TENNIS_BALL_PAYLOAD_BYTES) return null;
  const view = new DataView(entry.payload.buffer, entry.payload.byteOffset, entry.payload.byteLength);
  const values = [0, 1, 2].map((axis) => view.getInt16(1 + axis * 2));
  if (values.some((value) => value < -TOY_TENNIS_BALL_INT16)) return null;
  const velocity = values.map((value) => value / TOY_TENNIS_BALL_VELOCITY_SCALE);
  const bounce = entry.payload[0] ?? 0;
  return {
    id: entry.id,
    position: [...entry.position],
    velocity: velocity as [number, number, number],
    sleeping: (entry.flags & TOY_FLAG_SLEEPING) !== 0,
    rolling: (entry.flags & TOY_FLAG_GROUNDED) !== 0,
    bounces: bounce >> 4,
    strength: (bounce & TOY_TENNIS_BALL_NIBBLE) * TOY_TENNIS_BALL_STRENGTH_STEP,
  };
}
