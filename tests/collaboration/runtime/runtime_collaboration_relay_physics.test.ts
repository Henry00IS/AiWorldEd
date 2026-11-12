import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
} from '@/player/collision/player_collision_resolve.js';
import { playerCollisionPoseIsFree } from '@/player/collision/player_collision_depenetration.js';
import { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import { PLAYER_BALL_MAXIMUM_PER_MEMBER } from '@/player/ball/player_ball_constants.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
  await PhysicsRapierRuntime.ensureLoaded();
});

const ballSystems: PlayerBallSystem[] = [];
const EYE = new THREE.Vector3(0, 1.6, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);

afterEach(async () => {
  ballSystems.splice(0).forEach((system) => system.dispose());
  await harnessRelayClose();
});

/** A client's ball system, its collision world and the bounces it played. */
interface BallClient {
  system: PlayerBallSystem;
  collision: PlayerCollisionWorld;
  sounds: number[];
}

/**
 * Gives a client a ball system bound to the room's toy link, over a collision
 * world that stays inactive until the client enters play mode.
 *
 * @param client Client.
 * @returns Ball system and its bounce log.
 */
function ballsOf(client: HarnessCollaborationEditor): BallClient {
  const sounds: number[] = [];
  const collision = new PlayerCollisionWorld();
  collision.setWorldRoot(client.world);
  const system = new PlayerBallSystem({
    view: {
      helperAdd: (object) => client.helpers.add(object),
      helperRemove: (object) => client.helpers.remove(object),
    },
    collisionWorld: collision,
    isPlaying: () => client.player !== null,
    localPlayer: () => (client.player ? { feet: client.player.feet, velocity: new THREE.Vector3() } : null),
    schedule: (callback) => setTimeout(callback, 16),
    sound: (_position, speed) => sounds.push(speed),
  });
  client.toyLinkChanged = (link) => system.setLink(link);
  system.setLink(client.toyLink);
  ballSystems.push(system);
  return { system, collision, sounds };
}

/**
 * Puts a member in play mode at the origin, activating its collision, and waits
 * until the owner sees it.
 *
 * @param owner Owner client.
 * @param member Member client.
 * @param balls The member's ball client.
 * @returns The member's user id.
 */
async function playing(
  owner: HarnessCollaborationEditor,
  member: HarnessCollaborationEditor,
  balls: BallClient,
): Promise<number> {
  balls.collision.activate();
  member.player = {
    feet: new THREE.Vector3(0, 0, 0),
    yawRadians: 0,
    lookYawRadians: 0,
    pitchRadians: 0,
    grounded: true,
    wallPushing: false,
    running: false,
    camera: null,
  };
  await harnessCollaborationUntil(() => member.toyLink !== null && owner.toyLink !== null, 5000, 'links');
  const user = member.toyLink?.self() ?? 0;
  const seen = (): boolean => owner.toyLink?.players().some((player) => player.member === user) === true;
  await harnessCollaborationUntil(seen, 5000, 'owner sees play mode');
  return user;
}

/**
 * Waits until the watchers draw the thrower's resting ball where the thrower
 * does (within the snapshot's millimeter quantization).
 *
 * @param thrower Thrower's ball client.
 * @param members Watchers' ball clients.
 */
async function restAgreed(thrower: BallClient, members: readonly BallClient[]): Promise<void> {
  const rest = onlyBall(thrower).position.clone();
  const agreed = (): boolean => members.every((balls) => onlyBall(balls).position.distanceTo(rest) < 5e-3);
  await harnessCollaborationUntil(agreed, 5000, 'members show the rest position');
}

/**
 * Walks a play-mode member at 3 m/s from where it stands to 1 m past a point,
 * moving its presence feet every frame.
 *
 * @param member Member in play mode.
 * @param target Point to walk through (only x and z count).
 */
async function walkThrough(member: HarnessCollaborationEditor, target: THREE.Vector3): Promise<void> {
  const feet = member.player?.feet;
  if (!feet) throw new Error('member is not playing');
  const goal = new THREE.Vector3(target.x, feet.y, target.z);
  const direction = goal.clone().sub(feet).normalize();
  goal.addScaledVector(direction, 1);
  while (feet.distanceTo(goal) > 0.05) {
    feet.addScaledVector(direction, Math.min(3 * 0.016, feet.distanceTo(goal)));
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/**
 * Returns the only shown ball mesh of a client.
 *
 * @param balls Ball client.
 * @returns Mesh.
 */
function onlyBall(balls: BallClient): THREE.Mesh {
  const mesh = [...balls.system.getMeshes().values()][0];
  if (!mesh) throw new Error('no ball shown');
  return mesh;
}

/**
 * Tells whether a client shows exactly one ball within the snapshot's
 * millimeter quantization of a point.
 *
 * @param balls Ball client.
 * @param point Expected position.
 * @returns True when shown there.
 */
function onlyBallNear(balls: BallClient, point: THREE.Vector3): boolean {
  const meshes = [...balls.system.getMeshes().values()];
  return meshes.length === 1 && (meshes[0]?.position.distanceTo(point) ?? Infinity) < 5e-3;
}

/**
 * Returns the sorted ids of the balls a thrower simulates.
 *
 * @param balls Thrower ball client.
 * @returns Ids.
 */
function ownIds(balls: BallClient): number[] {
  return balls.system
    .getAuthority()
    .getBodies()
    .map((body) => body.id)
    .sort();
}

/**
 * Builds a wide owner level for balls: a 60 m floor whose top is y=0 and a
 * wall.
 *
 * @param client Owner before the room exists.
 */
function ballLevelBuild(client: HarnessCollaborationEditor): void {
  const model = client.solidAdd('Level');
  for (const brush of model.getBrushes()) model.removeBrush(brush.id, true, false);
  brushAdd(model, 60, new THREE.Vector3(0, -30, 0));
  brushAdd(model, 4, new THREE.Vector3(8, 2, 0));
}

/**
 * Adds one box brush to a solid model at a position.
 *
 * @param model Solid model.
 * @param size Cube edge length.
 * @param position Brush center.
 * @param operation CSG operation.
 * @returns Brush id.
 */
function brushAdd(
  model: SolidModel,
  size: number,
  position: THREE.Vector3,
  operation: SolidOperation = SolidOperation.Additive,
): string {
  const brush = model.addBoxBrush(size, operation, null, false);
  brush.mesh?.position.copy(position);
  model.syncBrushOrderFromScene();
  model.markBrushesDirty([brush.id]);
  model.rebuild(true);
  return brush.id;
}

/**
 * Builds the owner level: a floor whose top is y=0, a wall, a pillar and a
 * carved pit.
 *
 * @param client Owner before the room exists.
 */
function levelBuild(client: HarnessCollaborationEditor): void {
  const model = client.solidAdd('Level');
  for (const brush of model.getBrushes()) model.removeBrush(brush.id, true, false);
  brushAdd(model, 20, new THREE.Vector3(0, -10, 0));
  brushAdd(model, 4, new THREE.Vector3(8, 2, 0));
  brushAdd(model, 1, new THREE.Vector3(3, 0.5, 2.5));
  brushAdd(model, 2, new THREE.Vector3(-4, -0.5, -3), SolidOperation.Subtractive);
}

/**
 * Creates a collision world over a client's scene.
 *
 * @param client Client.
 * @returns Collision world.
 */
function collisionOf(client: HarnessCollaborationEditor): PlayerCollisionWorld {
  const world = new PlayerCollisionWorld();
  world.activate();
  world.setWorldRoot(client.world);
  return world;
}

/**
 * Waits one frame of wall time.
 *
 * @returns Resolves after about 16 ms.
 */
function frame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

/** What the walking member saw. */
interface WalkLog {
  blockedFrames: number;
  lowestFeetY: number;
  feetAfterEdits: number[];
}

/**
 * Walks back and forth on a member until stopped, logging blocked poses.
 *
 * @param world Member collision world.
 * @param feet Feet position (mutated).
 * @param isRunning Returns false to stop.
 * @returns Walk log.
 */
async function walk(world: PlayerCollisionWorld, feet: THREE.Vector3, isRunning: () => boolean): Promise<WalkLog> {
  const scratch = createPlayerCollisionScratch();
  const log: WalkLog = { blockedFrames: 0, lowestFeetY: feet.y, feetAfterEdits: [] };
  let velocity = 0;
  for (let index = 0; isRunning(); index++) {
    const direction = Math.floor(index / 40) % 2 === 0 ? 1 : -1;
    const step = new THREE.Vector3(direction * 0.03, 0, 0);
    const result = playerCollisionIntegrateStep(
      world,
      feet,
      step,
      velocity - 16 / 60,
      1 / 60,
      scratch,
      step.clone().normalize(),
      scratch.result.isGrounded,
    );
    velocity = result.verticalVelocity;
    const levelWorld = world.syncLevelWorld();
    const rig = world.getCharacterRig();
    if (levelWorld && rig && !playerCollisionPoseIsFree(levelWorld, rig, feet)) log.blockedFrames++;
    log.lowestFeetY = Math.min(log.lowestFeetY, feet.y);
    await frame();
  }
  return log;
}

/**
 * Runs the owner's edits around the walker, waiting for each to reach the
 * member before the next.
 *
 * @param owner Owner client.
 * @param member Member client.
 * @param walkerFeet Live walker feet on the member.
 * @param log Walk log receiving the feet after each edit settles.
 */
async function editAroundWalker(
  owner: HarnessCollaborationEditor,
  member: HarnessCollaborationEditor,
  walkerFeet: THREE.Vector3,
  log: WalkLog,
): Promise<void> {
  await owner.select('Level');
  const model = owner.solid('Level');
  const count = (): number => member.solid('Level').getBrushCount();
  const edits: (() => void)[] = [
    () => void brushAdd(model, 4, new THREE.Vector3(0, -1.75, 0)),
    () => void brushAdd(model, 6, new THREE.Vector3(0, 2, 0)),
    () =>
      model
        .getBrushes()
        .slice(4)
        .forEach((brush) => model.removeBrush(brush.id)),
    () => void brushAdd(model, 6, new THREE.Vector3(0, -3, 0), SolidOperation.Subtractive),
  ];
  for (const edit of edits) {
    const before = model.getBrushCount();
    edit();
    owner.commit();
    await harnessCollaborationUntil(
      () => count() === model.getBrushCount() && count() !== before,
      5000,
      'edit reached member',
    );
    for (let wait = 0; wait < 90; wait++) await frame();
    log.feetAfterEdits.push(walkerFeet.y);
  }
}

describe('collaboration relay physics', { timeout: 60000 }, () => {
  it('keeps a walking member on top of geometry the owner edits around and under them', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('Physics walk', levelBuild);
    const member = await harnessRelayJoin(room, 'Walker');
    const world = collisionOf(member);
    const feet = new THREE.Vector3(0, 0.05, 0);
    let running = true;
    const walking = walk(world, feet, () => running);
    const log: WalkLog = { blockedFrames: 0, lowestFeetY: 0, feetAfterEdits: [] };
    await editAroundWalker(owner, member, feet, log);
    running = false;
    const walked = await walking;
    console.info(
      `[relay physics] feet after edits ${log.feetAfterEdits.map((y) => y.toFixed(3)).join(', ')}; blocked frames ${walked.blockedFrames}; lowest ${walked.lowestFeetY.toFixed(3)}`,
    );
    expect(walked.blockedFrames).toBe(0);
    expect(log.feetAfterEdits[0]).toBeCloseTo(0.25, 1);
    expect(log.feetAfterEdits[1]).toBeCloseTo(5, 1);
    expect(log.feetAfterEdits[2]).toBeCloseTo(0, 1);
    expect(log.feetAfterEdits[3]).toBeCloseTo(-6, 1);
    expect(walked.lowestFeetY).toBeGreaterThan(-6.05);
  });

  it('lets the thrower simulate its ball, drawn in its color everywhere, with no physics outside play mode', async ({
    skip,
  }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('Physics ball', ballLevelBuild);
    const thrower = await harnessRelayJoin(room, 'Thrower');
    const watcher = await harnessRelayJoin(room, 'Watcher');
    const [ownerBalls, throwerBalls, watcherBalls] = [owner, thrower, watcher].map((client) => ballsOf(client));
    if (!ownerBalls || !throwerBalls || !watcherBalls) throw new Error('missing systems');
    const throwerId = await playing(owner, thrower, throwerBalls);
    expect(throwerBalls.system.throwFrom(EYE, new THREE.Vector3(1, -0.3, 0).normalize())).toBe(true);
    const all = [ownerBalls, throwerBalls, watcherBalls];
    await harnessCollaborationUntil(() => all.every((balls) => balls.system.getMeshes().size === 1), 5000, 'shown');
    await harnessCollaborationUntil(() => !throwerBalls.system.getAuthority().isAwake(), 30000, 'ball rests');
    const rest = onlyBall(throwerBalls).position.clone();
    await restAgreed(throwerBalls, [ownerBalls, watcherBalls]);
    const color = (onlyBall(watcherBalls).material as THREE.MeshStandardMaterial).color.getHex();
    expect(color).toBe(watcher.toyLink?.colorOf(throwerId));
    expect(ownerBalls.sounds.length).toBeGreaterThan(0);
    expect(watcherBalls.sounds.length).toBeGreaterThan(0);
    await walkThrough(thrower, rest);
    await harnessCollaborationUntil(() => onlyBall(throwerBalls).position.distanceTo(rest) > 0.5, 5000, 'pushed');
    await harnessCollaborationUntil(() => !throwerBalls.system.getAuthority().isAwake(), 30000, 'ball rests again');
    await restAgreed(throwerBalls, [ownerBalls, watcherBalls]);
    [ownerBalls, watcherBalls].forEach((balls) => expect(balls.collision.getSceneSync()).toBeNull());
    [ownerBalls, watcherBalls].forEach((balls) => expect(balls.system.getAuthority().getBodies()).toHaveLength(0));
    thrower.player = null;
    await harnessCollaborationUntil(() => all.every((balls) => balls.system.getMeshes().size === 0), 5000, 'gone');
  });

  it('shows a resting ball to a late joiner right after the join, from the full frame its thrower sends', async ({
    skip,
  }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('Physics late join', ballLevelBuild);
    const thrower = await harnessRelayJoin(room, 'Thrower');
    const [ownerBalls, throwerBalls] = [owner, thrower].map((client) => ballsOf(client));
    if (!ownerBalls || !throwerBalls) throw new Error('missing systems');
    await playing(owner, thrower, throwerBalls);
    throwerBalls.system.throwFrom(EYE, new THREE.Vector3(1, -0.3, 0).normalize());
    await harnessCollaborationUntil(() => !throwerBalls.system.getAuthority().isAwake(), 30000, 'ball rests');
    await restAgreed(throwerBalls, [ownerBalls]);
    const link = thrower.toyLink;
    if (!link) throw new Error('missing link');
    const publish = vi.spyOn(link, 'publish');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(publish).not.toHaveBeenCalled();
    const joinedAt = performance.now();
    const late = await harnessRelayJoin(room, 'Late');
    const lateBalls = ballsOf(late);
    const rest = onlyBall(throwerBalls).position.clone();
    await harnessCollaborationUntil(() => onlyBallNear(lateBalls, rest), 3000, 'late joiner sees the ball');
    console.info(
      `[relay physics] late joiner saw the resting ball ${(performance.now() - joinedAt).toFixed(0)} ms after joining`,
    );
    expect(publish.mock.calls.map(([snapshot]) => [snapshot.full, snapshot.balls.length])).toEqual([[true, 1]]);
  });

  it('ignores throws outside play mode, caps four balls per thrower and clears a leaver', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('Physics balls', ballLevelBuild);
    const thrower = await harnessRelayJoin(room, 'Thrower');
    const watcher = await harnessRelayJoin(room, 'Watcher');
    const [ownerBalls, throwerBalls, watcherBalls] = [owner, thrower, watcher].map((client) => ballsOf(client));
    if (!ownerBalls || !throwerBalls || !watcherBalls) throw new Error('missing systems');
    await harnessCollaborationUntil(() => thrower.toyLink !== null, 5000, 'link');
    expect(throwerBalls.system.throwFrom(EYE, FORWARD)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 500));
    [ownerBalls, throwerBalls, watcherBalls].forEach((balls) => expect(balls.system.getMeshes().size).toBe(0));
    await playing(owner, thrower, throwerBalls);
    for (let index = 1; index <= PLAYER_BALL_MAXIMUM_PER_MEMBER + 1; index++) {
      expect(throwerBalls.system.throwFrom(EYE, FORWARD)).toBe(true);
    }
    expect(ownIds(throwerBalls)).toEqual([1, 2, 3, 4]);
    const four = (): boolean => [ownerBalls, watcherBalls].every((balls) => balls.system.getMeshes().size === 4);
    await harnessCollaborationUntil(four, 5000, 'watchers see four');
    await thrower.runtime.leave();
    await harnessCollaborationUntil(
      () => [ownerBalls, watcherBalls].every((balls) => balls.system.getMeshes().size === 0),
      5000,
      'leaver cleared',
    );
  });
});
