import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import {
  PLAYER_BALL_FAKE_FRAME_MS,
  PlayerBallFakeRoom,
  type PlayerBallFakeClient,
  type PlayerBallFakeFrame,
} from './player_ball_fake_room.js';

/** Members that receive each thrower's snapshots in the measured room of four. */
const RECEIVERS = 3;
/** Most bytes per second one member may send: 5 frames of at most 148 bytes. */
const TOY_UP_MAXIMUM = 5 * 148;
/**
 * Presence of one play-mode member: 5 frames per second of 8 + 18 bytes to each
 * other member.
 */
const PRESENCE_ROOM_DOWN = 4 * RECEIVERS * 5 * (8 + 18);
const EYE = new THREE.Vector3(0, 1.6, 0);

/** Traffic of one scenario. */
interface BallTraffic {
  scenario: string;
  seconds: number;
  frames: number;
  fullFrames: number;
  upBytesPerSecond: number;
  roomDownBytesPerSecond: number;
  presenceRoomDownBytesPerSecond: number;
}

/**
 * Sums a window of frames into bytes per second for the room.
 *
 * @param scenario Name.
 * @param frames Frames sent in the window.
 * @param seconds Window length.
 * @returns Traffic.
 */
function traffic(scenario: string, frames: readonly PlayerBallFakeFrame[], seconds: number): BallTraffic {
  const up = frames.reduce((sum, frame) => sum + frame.upBytes, 0);
  const down = frames.reduce((sum, frame) => sum + frame.downBytes, 0) * RECEIVERS;
  return {
    ...{ scenario, seconds, frames: frames.length, fullFrames: frames.filter((frame) => frame.full).length },
    upBytesPerSecond: Math.round(up / seconds),
    roomDownBytesPerSecond: Math.round(down / seconds),
    presenceRoomDownBytesPerSecond: PRESENCE_ROOM_DOWN,
  };
}

/**
 * Builds a room of four players.
 *
 * @returns Room and clients.
 */
function room(): { fake: PlayerBallFakeRoom; clients: PlayerBallFakeClient[] } {
  const fake = new PlayerBallFakeRoom();
  return { fake, clients: [1, 2, 3, 4].map((user) => fake.add(user)) };
}

/**
 * Runs a room until a thrower's balls rest or a time limit passes.
 *
 * @param fake Room.
 * @param thrower Thrower.
 * @param limitSeconds Time limit.
 * @returns Seconds run.
 */
function runUntilRest(fake: PlayerBallFakeRoom, thrower: PlayerBallFakeClient, limitSeconds: number): number {
  const start = fake.now;
  while (thrower.system.getAuthority().isAwake() && fake.now - start < limitSeconds * 1000) fake.run(1);
  return (fake.now - start) / 1000;
}

/**
 * Moves every player around its own circle at 3 m/s for a while.
 *
 * @param fake Room.
 * @param clients Players.
 * @param seconds Time to run.
 */
function circle(fake: PlayerBallFakeRoom, clients: readonly PlayerBallFakeClient[], seconds: number): void {
  const frames = Math.round((seconds * 1000) / PLAYER_BALL_FAKE_FRAME_MS);
  for (let frame = 0; frame < frames; frame++) {
    const angle = (fake.now / 1000) * 2;
    clients.forEach((client, index) => {
      const phase = angle + (index * Math.PI) / 2;
      client.feet.set(2 + 1.5 * Math.cos(phase), 0, 1.5 * Math.sin(phase));
      client.velocity.set(-3 * Math.sin(phase), 0, 3 * Math.cos(phase));
    });
    fake.run(1);
  }
}

describe('ball network traffic', () => {
  const results: BallTraffic[] = [];

  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('one thrown ball costs a few frames until it rests and nothing afterwards', () => {
    const { fake, clients } = room();
    const thrower = clients[1];
    if (!thrower) throw new Error('missing thrower');
    thrower.system.throwFrom(EYE, new THREE.Vector3(1, -0.2, 0.3).normalize());
    const seconds = runUntilRest(fake, thrower, 40);
    const flight = traffic('1 ball, throw until rest', fake.frames, seconds);
    const sent = fake.frames.length;
    fake.run(Math.round(10_000 / PLAYER_BALL_FAKE_FRAME_MS));
    results.push(flight, traffic('everything asleep (10 s)', fake.frames.slice(sent), 10));
    expect(fake.frames.length).toBe(sent);
    expect(flight.roomDownBytesPerSecond).toBeLessThan(PRESENCE_ROOM_DOWN / 4);
  });

  it('16 balls of 4 throwers bouncing between the moving players stay within the relay rate', () => {
    const { fake, clients } = room();
    clients.forEach((client, index) => {
      for (let ball = 0; ball < 4; ball++) {
        const angle = index * 1.6 + ball * 0.4;
        client.system.throwFrom(EYE, new THREE.Vector3(Math.cos(angle), -0.4, Math.sin(angle)).normalize());
        fake.run(8);
      }
    });
    const start = fake.frames.length;
    circle(fake, clients, 10);
    const balls = clients.reduce((sum, client) => sum + client.system.getAuthority().getBodies().length, 0);
    results.push(traffic('4 players x 4 balls, players running through them (10 s)', fake.frames.slice(start), 10));
    const busy = results.at(-1);
    expect(balls).toBe(16);
    expect(busy?.upBytesPerSecond).toBeLessThanOrEqual(4 * TOY_UP_MAXIMUM);
    expect(busy?.roomDownBytesPerSecond).toBeLessThan(2 * PRESENCE_ROOM_DOWN);
    const out = process.env['AIWORLDED_BALL_BANDWIDTH_OUT'];
    if (out) writeFileSync(out, JSON.stringify(results, null, 2));
  });
});
