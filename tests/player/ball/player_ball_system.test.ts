import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import {
  PLAYER_BALL_MAXIMUM_PER_MEMBER,
  PLAYER_BALL_OFFLINE_COLOR,
  PLAYER_BALL_RENDER_DELAY_MS,
} from '@/player/ball/player_ball_constants.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
} from '@/player/collision/player_collision_resolve.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { PHYSICS_TOY_SHAPES } from '@/physics/ball/physics_ball_constants.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import {
  PLAYER_BALL_FAKE_FRAME_MS,
  PlayerBallFakeRoom,
  playerBallFakeLevel,
  playerBallFakeShown as shown,
  type PlayerBallFakeClient as FakeClient,
} from './player_ball_fake_room.js';

const OWNER = 1;
const THROWER = 2;
const WATCHER = 3;
const EYE = new THREE.Vector3(0, 1.6, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);

/**
 * Creates a room with an owner, a thrower and a watcher, all playing.
 *
 * @returns Room and clients.
 */
function room(): { room: PlayerBallFakeRoom; owner: FakeClient; thrower: FakeClient; watcher: FakeClient } {
  const fake = new PlayerBallFakeRoom();
  return { room: fake, owner: fake.add(OWNER), thrower: fake.add(THROWER), watcher: fake.add(WATCHER) };
}

/**
 * Returns the first shown ball of a client.
 *
 * @param client Client.
 * @returns Position, or undefined.
 */
function firstShown(client: FakeClient): THREE.Vector3 | undefined {
  return [...shown(client).values()][0];
}

describe('PlayerBallSystem', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('simulates its own throws without a room, as a helper that is never picked or part of the world', () => {
    const world = playerBallFakeLevel();
    const collision = new PlayerCollisionWorld();
    collision.activate();
    collision.setWorldRoot(world);
    const helpers = new THREE.Group();
    const system = new PlayerBallSystem({
      view: { helperAdd: (object) => helpers.add(object), helperRemove: (object) => helpers.remove(object) },
      collisionWorld: collision,
      isPlaying: () => true,
      schedule: () => undefined,
      sound: () => undefined,
    });
    expect(system.throwFrom(EYE, FORWARD)).toBe(true);
    system.update(0);
    system.update(100);
    const mesh = [...system.getMeshes().values()][0];
    expect(mesh?.parent).toBe(helpers);
    expect(world.getObjectById(mesh?.id ?? -1)).toBeUndefined();
    expect(mesh && isEditorHelperObject(mesh)).toBe(true);
    expect((mesh?.material as THREE.MeshStandardMaterial).color.getHex()).toBe(PLAYER_BALL_OFFLINE_COLOR);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(mesh?.position.x, 5, 0), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(helpers, true)).toEqual([]);
    system.dispose();
    expect(helpers.children).toHaveLength(0);
  });

  it('throws from the given hand position, pulled back towards the eye when it would start in a wall', () => {
    const collision = new PlayerCollisionWorld();
    collision.activate();
    collision.setWorldRoot(playerBallFakeLevel());
    const options = { collisionWorld: collision, isPlaying: () => true, schedule: () => undefined };
    const system = new PlayerBallSystem({
      ...options,
      view: { helperAdd: () => undefined, helperRemove: () => undefined },
      sound: () => undefined,
    });
    const start = (): THREE.Vector3 | undefined => system.getAuthority().getBodies().at(-1)?.ball.position.clone();
    const hand = new THREE.Vector3(2.3, 1.4, 0.2);
    system.throwFrom(EYE, FORWARD, 'tennis', hand);
    expect(start()?.distanceTo(hand)).toBeLessThan(1e-4);
    const eye = new THREE.Vector3(8, 1.6, 0);
    system.throwFrom(eye, FORWARD, 'plane', new THREE.Vector3(8.9, 1.4, 0.1));
    const clamped = start() ?? new THREE.Vector3(99, 0, 0);
    expect(clamped.x + PHYSICS_TOY_SHAPES.plane.radius).toBeLessThanOrEqual(8.5);
    expect(clamped.x).toBeGreaterThanOrEqual(eye.x);
    system.dispose();
  });

  it('lets the thrower simulate its ball while everyone else draws it slightly in the past, in its color', () => {
    const { room: fake, thrower, owner, watcher } = room();
    const history = new Map<number, THREE.Vector3>();
    expect(thrower.system.throwFrom(EYE, FORWARD)).toBe(true);
    expect(shown(thrower).size).toBe(0);
    for (let frame = 0; frame < 30; frame++) {
      fake.run(1);
      const own = thrower.system.getAuthority().getBodies()[0]?.ball.position.clone();
      if (own) history.set(fake.now, own);
    }
    expect(owner.system.getAuthority().getBodies()).toHaveLength(0);
    const lag = PLAYER_BALL_RENDER_DELAY_MS + fake.latencyMs;
    const past = history.get(fake.now - Math.round(lag / PLAYER_BALL_FAKE_FRAME_MS) * PLAYER_BALL_FAKE_FRAME_MS);
    [owner, watcher].forEach((client) => {
      expect(firstShown(client)?.distanceTo(past ?? new THREE.Vector3())).toBeLessThan(0.15);
      const mesh = [...client.system.getMeshes().values()][0];
      expect((mesh?.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x100000 * THROWER);
    });
  });

  it('keeps at most four own balls with ids 1..4, a fifth throw replacing the oldest', () => {
    const { room: fake, thrower, watcher } = room();
    for (let index = 0; index < PLAYER_BALL_MAXIMUM_PER_MEMBER + 1; index++) {
      thrower.system.throwFrom(EYE, FORWARD);
      fake.run(2);
    }
    fake.run(40);
    expect(
      thrower.system
        .getAuthority()
        .getBodies()
        .map((body) => body.id),
    ).toEqual([2, 3, 4, 1]);
    expect(shown(watcher).size).toBe(PLAYER_BALL_MAXIMUM_PER_MEMBER);
  });

  it('removes balls when their thrower leaves play mode or the room', () => {
    const { room: fake, owner, thrower, watcher } = room();
    [owner, thrower, watcher].forEach((client) => client.system.throwFrom(EYE, FORWARD));
    fake.run(30);
    expect(shown(watcher).size).toBe(3);
    fake.setPlaying(thrower, false);
    fake.setPlaying(owner, false);
    fake.run(30);
    expect(thrower.system.getAuthority().getBodies()).toHaveLength(0);
    expect([...shown(watcher).keys()]).toEqual(['own:1']);
    expect(shown(owner).size).toBe(1);
    owner.listener?.memberLeft(WATCHER);
    fake.run(2);
    expect(shown(owner).size).toBe(0);
  });

  it("gives a client that does not play no physics at all while it draws the others' balls", () => {
    const { room: fake, owner, thrower, watcher } = room();
    fake.setPlaying(owner, false);
    thrower.system.throwFrom(EYE, FORWARD);
    watcher.system.throwFrom(EYE, new THREE.Vector3(0.6, 0.2, 0.3).normalize());
    fake.run(200);
    expect(owner.syncs).toBe(0);
    expect(owner.collision.isActive()).toBe(false);
    expect(owner.collision.getSceneSync()).toBeNull();
    expect(owner.system.throwFrom(EYE, FORWARD)).toBe(false);
    expect(shown(owner).size).toBe(2);
    expect(thrower.syncs).toBeGreaterThan(0);
  });

  it('plays bounces on the thrower and its receivers, and goes quiet once the balls rest', () => {
    const { room: fake, thrower, watcher } = room();
    thrower.system.throwFrom(EYE, new THREE.Vector3(0.2, -0.3, 0).normalize());
    fake.run(2000);
    expect(thrower.sounds.length).toBeGreaterThan(1);
    expect(watcher.sounds.length).toBeGreaterThan(0);
    expect(watcher.sounds.length).toBeLessThanOrEqual(thrower.sounds.length);
    expect(thrower.system.getAuthority().isAwake()).toBe(false);
    const sent = fake.frames.length;
    fake.run(60);
    expect(fake.frames.length).toBe(sent);
    expect(fake.frames.at(-1)?.full).toBe(true);
    expect(watcher.system.update(fake.now + 16)).toBe(false);
    fake.setPlaying(thrower, false);
    fake.run(30);
    expect(thrower.system.update(fake.now + 16)).toBe(false);
    expect(shown(watcher).size).toBe(0);
  });

  it('sends resting balls once, as a full snapshot, when a member joins, so the joiner sees them at once', () => {
    const { room: fake, thrower, owner } = room();
    fake.setPlaying(owner, false);
    thrower.system.throwFrom(EYE, new THREE.Vector3(0.2, -0.3, 0).normalize());
    fake.run(2000);
    const rest = thrower.system.getAuthority().getBodies()[0]?.ball.position.clone() ?? new THREE.Vector3();
    const sent = fake.frames.length;
    fake.run(120);
    expect(fake.frames.length).toBe(sent);
    const joiner = fake.join(4);
    fake.run(Math.ceil((PLAYER_BALL_RENDER_DELAY_MS + fake.latencyMs) / PLAYER_BALL_FAKE_FRAME_MS) + 2);
    expect(fake.frames.slice(sent).map((frame) => [frame.sender, frame.full, frame.entries])).toEqual([
      [THROWER, true, 1],
      [WATCHER, true, 0],
    ]);
    expect(fake.frames.slice(sent).map((frame) => frame.held)).toEqual(['tennis', 'tennis']);
    expect(firstShown(joiner)?.distanceTo(rest)).toBeLessThan(5e-3);
    fake.run(120);
    expect(fake.frames.length).toBe(sent + 2);
  });

  it('bounces own balls off the drawn balls of others, which never move for it', () => {
    const { room: fake, owner, thrower } = room();
    owner.system.getAuthority().spawn(new THREE.Vector3(3, 0.04, 0), new THREE.Vector3());
    fake.run(120);
    const resting = owner.system.getAuthority().getBodies()[0]?.ball.position.clone();
    thrower.system.getAuthority().spawn(new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(4, 0, 0));
    fake.run(120);
    const own = thrower.system.getAuthority().getBodies()[0]?.ball;
    expect(own?.position.x).toBeLessThan(3 - 0.06);
    expect(
      owner.system
        .getAuthority()
        .getBodies()[0]
        ?.ball.position.distanceTo(resting ?? new THREE.Vector3()),
    ).toBe(0);
  });

  it('removes everything when the room link changes', () => {
    const { room: fake, owner, thrower } = room();
    thrower.system.throwFrom(EYE, FORWARD);
    fake.run(40);
    owner.system.setLink(null);
    thrower.system.setLink(null);
    expect(shown(owner).size).toBe(0);
    expect(shown(thrower).size).toBe(0);
    expect(owner.helpers.children).toHaveLength(0);
  });
});

/**
 * Walks a player along +X at 3 m/s on a collision world, frame by frame.
 *
 * @param collision Player collision.
 * @param feet Feet (moved).
 * @param frames Frames of 16 ms.
 * @param onFrame Called after each frame.
 * @returns Feet after each frame.
 */
function walk(collision: PlayerCollisionWorld, feet: THREE.Vector3, frames: number, onFrame: () => void): number[] {
  const scratch = createPlayerCollisionScratch();
  const path: number[] = [];
  let vertical = 0;
  for (let frame = 0; frame < frames; frame++) {
    const step = new THREE.Vector3(3 * 0.016, 0, 0);
    const direction = new THREE.Vector3(1, 0, 0);
    const grounded = scratch.result.isGrounded;
    const result = playerCollisionIntegrateStep(
      collision,
      feet,
      step,
      vertical - 0.16,
      0.016,
      scratch,
      direction,
      grounded,
    );
    vertical = result.verticalVelocity;
    path.push(...feet.toArray());
    onFrame();
  }
  return path;
}

describe('PlayerBallSystem players', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('lets the thrower push its balls with walking players while the players walk exactly as without balls', () => {
    const { room: fake, owner, thrower: member, watcher } = room();
    member.feet.set(0, 0, 0);
    member.velocity.set(3, 0, 0);
    const authority = owner.system.getAuthority();
    authority.spawn(new THREE.Vector3(1.2, 0.04, 0), new THREE.Vector3());
    fake.run(120);
    expect(authority.isAwake()).toBe(false);
    const reference = playerBallFakeLevel();
    const referenceCollision = new PlayerCollisionWorld();
    referenceCollision.activate();
    referenceCollision.setWorldRoot(reference);
    const expected = walk(referenceCollision, new THREE.Vector3(0, 0, 0), 60, () => undefined);
    const walked = walk(member.collision, member.feet, 60, () => fake.run(1));
    expect(walked).toEqual(expected);
    const ball = authority.getBodies()[0]?.ball;
    expect(ball?.position.x).toBeGreaterThan(member.feet.x + 0.35);
    fake.run(240);
    [member, watcher].forEach((client) => {
      const drawn = [...shown(client).values()][0];
      expect(drawn?.distanceTo(ball?.position ?? new THREE.Vector3())).toBeLessThan(0.3);
    });
  });

  it('bounces own balls off each other', () => {
    const { room: fake, owner } = room();
    const authority = owner.system.getAuthority();
    authority.spawn(new THREE.Vector3(-1, 1, 5), new THREE.Vector3(4, 0, 0));
    authority.spawn(new THREE.Vector3(1, 1, 5), new THREE.Vector3(-4, 0, 0));
    fake.run(20);
    const [left, right] = authority.getBodies();
    expect(left?.ball.velocity.x).toBeLessThan(0);
    expect(right?.ball.velocity.x).toBeGreaterThan(0);
  });
});
