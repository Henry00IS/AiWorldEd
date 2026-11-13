import {
  TOY_FLAG_GROUNDED,
  TOY_FLAG_SLEEPING,
  TOY_TYPE_TENNIS_BALL,
  toyFramePrecision,
  type ToyEntry,
  type ToyFrame,
  type ToySnapshot,
} from '@/collaboration/shared/toy_frame.js';
import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import type { PlayerBallSnapshot, PlayerBallState } from '@/player/ball/player_ball_link.js';

/**
 * Toy type: a soccer ball put down in front of its player (same 7-byte payload
 * as a tennis ball). Toy types are client-side: the relay only checks the
 * envelope.
 */
export const TOY_TYPE_SOCCER_BALL = 2;
/** Toy type: a paper plane (tennis ball payload plus 4 attitude bytes). */
export const TOY_TYPE_PAPER_PLANE = 3;
/**
 * Toy type: the toy its player holds in play mode (1-byte payload: the held
 * toy's type; the position is unused). It takes a free toy id, so it is sent
 * only while fewer than four toys are out.
 */
export const TOY_TYPE_HAND = 4;
/** Bytes of a tennis ball payload: bounce byte and velocity. */
export const TOY_TENNIS_BALL_PAYLOAD_BYTES = 7;
/**
 * Bytes of a paper plane payload: ball payload, heading u16, pitch and bank
 * int8.
 */
export const TOY_PAPER_PLANE_PAYLOAD_BYTES = TOY_TENNIS_BALL_PAYLOAD_BYTES + 4;
/** Bytes of a hand payload: the held toy type. */
export const TOY_HAND_PAYLOAD_BYTES = 1;
/** Pitch and bank units per radian (int8, +-127 is +-PI/2). */
const TOY_PAPER_PLANE_ANGLE_SCALE = 127 / (Math.PI / 2);
/** Toy types of the toy kinds. */
const TOY_TYPES: Readonly<Record<PhysicsToyKind, number>> = {
  tennis: TOY_TYPE_TENNIS_BALL,
  soccer: TOY_TYPE_SOCCER_BALL,
  plane: TOY_TYPE_PAPER_PLANE,
};
/** Toy kinds of the toy types. */
const TOY_KINDS: ReadonlyMap<number, PhysicsToyKind> = new Map(
  Object.entries(TOY_TYPES).map(([kind, type]) => [type, kind as PhysicsToyKind]),
);
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
  const free = [1, 2, 3, 4].find((id) => entries.every((entry) => entry.id !== id));
  if (snapshot.held !== undefined && free !== undefined) {
    const position = entries[0]?.position ?? frame.origin;
    const payload = Uint8Array.of(TOY_TYPES[snapshot.held]);
    entries.push({ type: TOY_TYPE_HAND, id: free, flags: 0, position: [...position], payload });
  }
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
  const kind = ball.kind ?? 'tennis';
  const plane = kind === 'plane';
  const payload = new Uint8Array(plane ? TOY_PAPER_PLANE_PAYLOAD_BYTES : TOY_TENNIS_BALL_PAYLOAD_BYTES);
  const view = new DataView(payload.buffer);
  const step = Math.round(ball.strength / TOY_TENNIS_BALL_STRENGTH_STEP);
  payload[0] = ((ball.bounces & TOY_TENNIS_BALL_NIBBLE) << 4) | Math.max(0, Math.min(TOY_TENNIS_BALL_NIBBLE, step));
  ball.velocity.forEach((value, axis) => view.setInt16(1 + axis * 2, toyTennisBallVelocity(value)));
  if (plane) {
    const [yaw, pitch, roll] = ball.attitude ?? [0, 0, 0];
    const turn = (((yaw / (2 * Math.PI)) % 1) + 1) % 1;
    view.setUint16(TOY_TENNIS_BALL_PAYLOAD_BYTES, Math.round(turn * 0x10000) & 0xffff);
    view.setInt8(TOY_TENNIS_BALL_PAYLOAD_BYTES + 2, toyPaperPlaneAngle(pitch));
    view.setInt8(TOY_TENNIS_BALL_PAYLOAD_BYTES + 3, toyPaperPlaneAngle(roll));
  }
  return { type: TOY_TYPES[kind], id: ball.id, flags, position: [...ball.position], payload };
}

/**
 * Rounds and clamps a pitch or bank angle to int8.
 *
 * @param radians Angle within +-PI/2.
 * @returns Stored value.
 */
function toyPaperPlaneAngle(radians: number): number {
  return Math.max(-127, Math.min(127, Math.round(radians * TOY_PAPER_PLANE_ANGLE_SCALE)));
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
 * Reads the balls and paper planes of a relayed toy frame; hands and unknown
 * toy types are ignored. A malformed payload rejects the whole frame.
 *
 * @param frame Decoded toy frame.
 * @returns Ball snapshot, or null when a ball payload is malformed.
 */
export function toyTennisBallDecode(frame: ToyFrame): PlayerBallSnapshot | null {
  const balls: PlayerBallState[] = [];
  for (const entry of frame.entries) {
    const kind = TOY_KINDS.get(entry.type);
    if (kind === undefined) continue;
    const ball = toyTennisBallRead(entry, kind);
    if (ball === null) return null;
    balls.push(ball);
  }
  return { full: frame.full, tick: frame.tick, balls };
}

/**
 * Reads the held toy a frame announces.
 *
 * @param frame Decoded toy frame.
 * @returns Held kind; undefined when not announced or malformed.
 */
export function toyHandDecode(frame: ToyFrame): PhysicsToyKind | undefined {
  const hand = frame.entries.find((entry) => entry.type === TOY_TYPE_HAND);
  if (hand === undefined || hand.payload.byteLength !== TOY_HAND_PAYLOAD_BYTES) return undefined;
  return toyKindOf(hand.payload[0] ?? 0);
}

/**
 * Returns the toy kind of a toy type.
 *
 * @param type Toy type.
 * @returns Kind, or undefined for hands and unknown types.
 */
export function toyKindOf(type: number): PhysicsToyKind | undefined {
  return TOY_KINDS.get(type);
}

/**
 * Reads one toy payload: exact length for its kind, velocities and angles
 * within range.
 *
 * @param entry Ball or paper plane entry.
 * @param kind Its kind.
 * @returns Toy state, or null when malformed.
 */
function toyTennisBallRead(entry: ToyEntry, kind: PhysicsToyKind = 'tennis'): PlayerBallState | null {
  const plane = kind === 'plane';
  if (entry.payload.byteLength !== (plane ? TOY_PAPER_PLANE_PAYLOAD_BYTES : TOY_TENNIS_BALL_PAYLOAD_BYTES)) return null;
  const view = new DataView(entry.payload.buffer, entry.payload.byteOffset, entry.payload.byteLength);
  const values = [0, 1, 2].map((axis) => view.getInt16(1 + axis * 2));
  if (values.some((value) => value < -TOY_TENNIS_BALL_INT16)) return null;
  const velocity = values.map((value) => value / TOY_TENNIS_BALL_VELOCITY_SCALE);
  const bounce = entry.payload[0] ?? 0;
  const attitude = plane ? toyPaperPlaneAttitude(view) : undefined;
  if (attitude === null) return null;
  return {
    id: entry.id,
    ...(kind === 'tennis' ? {} : { kind }),
    ...(attitude ? { attitude } : {}),
    position: [...entry.position],
    velocity: velocity as [number, number, number],
    sleeping: (entry.flags & TOY_FLAG_SLEEPING) !== 0,
    rolling: (entry.flags & TOY_FLAG_GROUNDED) !== 0,
    bounces: bounce >> 4,
    strength: (bounce & TOY_TENNIS_BALL_NIBBLE) * TOY_TENNIS_BALL_STRENGTH_STEP,
  };
}

/**
 * Reads the attitude bytes of a paper plane payload.
 *
 * @param view Payload view.
 * @returns Heading, pitch and bank, or null when an angle is out of range.
 */
function toyPaperPlaneAttitude(view: DataView): [number, number, number] | null {
  const pitch = view.getInt8(TOY_TENNIS_BALL_PAYLOAD_BYTES + 2);
  const roll = view.getInt8(TOY_TENNIS_BALL_PAYLOAD_BYTES + 3);
  if (pitch < -127 || roll < -127) return null;
  const turn = view.getUint16(TOY_TENNIS_BALL_PAYLOAD_BYTES) / 0x10000;
  const yaw = (turn > 0.5 ? turn - 1 : turn) * 2 * Math.PI;
  return [yaw, pitch / TOY_PAPER_PLANE_ANGLE_SCALE, roll / TOY_PAPER_PLANE_ANGLE_SCALE];
}
