import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHYSICS_TOY_SHAPES } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_BALL_RENDER_DELAY_MS } from '@/player/ball/player_ball_constants.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PlayerBallFakeRoom, PLAYER_BALL_FAKE_FRAME_MS, type PlayerBallFakeClient } from './player_ball_fake_room.js';

const FORWARD = new THREE.Vector3(1, 0, 0);

/**
 * Returns a client's eye (1.6 m over its feet).
 *
 * @param client Client.
 * @returns Eye position.
 */
function eyeOf(client: PlayerBallFakeClient): THREE.Vector3 {
  return client.feet.clone().setY(client.feet.y + 1.6);
}

/**
 * Returns the only toy mesh a client shows.
 *
 * @param client Client.
 * @returns Mesh.
 */
function onlyMesh(client: PlayerBallFakeClient): THREE.Mesh {
  const meshes = [...client.system.getMeshes().values()];
  if (meshes.length !== 1 || meshes[0] === undefined) throw new Error(`expected one toy, got ${meshes.length}`);
  return meshes[0];
}

describe('PlayerBallSystem toys', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('puts a soccer ball down at rest in front of the player, silently, until another player kicks it', () => {
    const fake = new PlayerBallFakeRoom();
    const kicker = fake.add(1);
    const thrower = fake.add(2);
    const watcher = fake.add(3);
    thrower.system.setHeld('soccer');
    fake.run(20);
    expect(thrower.system.throwFrom(eyeOf(thrower), FORWARD)).toBe(true);
    const body = thrower.system.getAuthority().getBodies()[0];
    expect(body?.kind).toBe('soccer');
    expect(body?.ball.isResting).toBe(true);
    const placed = body?.ball.position.clone() ?? new THREE.Vector3();
    expect(placed.x - thrower.feet.x).toBeCloseTo(1.1, 2);
    expect(placed.y).toBeCloseTo(PHYSICS_TOY_SHAPES.soccer.radius, 2);
    fake.run(Math.ceil((PLAYER_BALL_RENDER_DELAY_MS + fake.latencyMs) / PLAYER_BALL_FAKE_FRAME_MS) + 4);
    [kicker, watcher].forEach((client) => {
      expect(onlyMesh(client).name).toBe('Soccer ball');
      expect(onlyMesh(client).position.distanceTo(placed)).toBeLessThan(5e-3);
    });
    const sent = fake.frames.length;
    fake.run(200);
    expect(fake.frames.length).toBe(sent);
    expect(body?.ball.position.equals(placed)).toBe(true);
    kicker.feet.set(placed.x, 0, placed.z - 1.2);
    kicker.velocity.set(0, 0, 5);
    for (let frame = 0; frame < 30; frame++) {
      kicker.feet.z += 5 * (PLAYER_BALL_FAKE_FRAME_MS / 1000);
      fake.run(1);
    }
    expect(body?.ball.velocity.z).toBeGreaterThan(5);
    kicker.velocity.set(0, 0, 0);
    kicker.feet.x += 3;
    fake.run(1200);
    const rest = body?.ball.position ?? new THREE.Vector3();
    expect(rest.z - placed.z).toBeGreaterThan(10);
    expect(body?.ball.isResting).toBe(true);
    [kicker, watcher].forEach((client) => expect(onlyMesh(client).position.distanceTo(rest)).toBeLessThan(5e-3));
  });

  it('throws a paper plane that the others draw gliding, nose along its path, close to the thrower', () => {
    const fake = new PlayerBallFakeRoom();
    const thrower = fake.add(2);
    const watcher = fake.add(3);
    thrower.system.setHeld('plane');
    thrower.system.throwFrom(eyeOf(thrower), FORWARD);
    const history = new Map<number, THREE.Vector3>();
    let nose = 0;
    for (let frame = 0; frame < 60; frame++) {
      fake.run(1);
      const own = thrower.system.getAuthority().getBodies()[0]?.ball.position.clone();
      if (own) history.set(fake.now, own);
      const mesh = watcher.system.getMeshes().values().next().value;
      if (mesh) nose = Math.max(nose, new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion).x);
    }
    expect(thrower.system.getAuthority().getBodies()[0]?.kind).toBe('plane');
    const mesh = onlyMesh(watcher);
    expect(mesh.name).toBe('Paper plane');
    expect(nose).toBeGreaterThan(0.9);
    const lag = PLAYER_BALL_RENDER_DELAY_MS + fake.latencyMs;
    const past = history.get(fake.now - Math.round(lag / PLAYER_BALL_FAKE_FRAME_MS) * PLAYER_BALL_FAKE_FRAME_MS);
    expect(mesh.position.distanceTo(past ?? new THREE.Vector3())).toBeLessThan(0.15);
    expect(mesh.position.y).toBeGreaterThan(1.2);
  });

  it('announces the held toy alone when it changes, and in full snapshots', () => {
    const fake = new PlayerBallFakeRoom();
    const thrower = fake.add(2);
    fake.add(3);
    fake.run(30);
    const sent = fake.frames.length;
    thrower.system.setHeld('plane');
    fake.run(30);
    expect(fake.frames.slice(sent).map((frame) => [frame.sender, frame.full, frame.entries, frame.held])).toEqual([
      [2, false, 0, 'plane'],
    ]);
    fake.setPlaying(thrower, false);
    thrower.system.setHeld('soccer');
    fake.run(30);
    expect(fake.frames).toHaveLength(sent + 1);
  });

  it('counts every kind toward the four-toy cap, a fifth replacing the oldest', () => {
    const fake = new PlayerBallFakeRoom();
    const thrower = fake.add(2);
    (['tennis', 'plane', 'soccer', 'tennis', 'plane'] as const).forEach((kind) => {
      thrower.system.throwFrom(eyeOf(thrower), FORWARD, kind);
      fake.run(2);
    });
    const bodies = thrower.system.getAuthority().getBodies();
    expect(bodies.map((body) => [body.id, body.kind])).toEqual([
      [2, 'plane'],
      [3, 'soccer'],
      [4, 'tennis'],
      [1, 'plane'],
    ]);
  });
});
