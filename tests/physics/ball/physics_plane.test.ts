import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsBall } from '@/physics/ball/physics_ball.js';
import { PHYSICS_BALL_STEP_SECONDS, PHYSICS_TOY_SHAPES } from '@/physics/ball/physics_ball_constants.js';
import type { PhysicsBallMover } from '@/physics/ball/physics_ball_contacts.js';
import { PhysicsBallWorld } from '@/physics/ball/physics_ball_world.js';
import { PhysicsPlane, physicsPlaneAngle } from '@/physics/ball/physics_plane.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PhysicsRapierRuntime, type PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import { physicsBallTestWorld, type BoxSpec } from './physics_ball_test_world.js';

/** A wide floor whose top is at y = 0. */
const FLOOR: BoxSpec = {
  key: 'floor',
  center: new THREE.Vector3(0, -0.5, 0),
  size: new THREE.Vector3(200, 1, 200),
  yaw: 0,
};
/** A deck whose top is at y = 6 and whose edge is at z = 0 (it spans z 0..10). */
const DECK: BoxSpec = { key: 'deck', center: new THREE.Vector3(0, 5.5, 5), size: new THREE.Vector3(4, 1, 10), yaw: 0 };
const PLANE_RADIUS = PHYSICS_TOY_SHAPES.plane.radius;

/** One recorded step of a plane. */
interface PlaneStep {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  pitch: number;
  skidding: boolean;
  resting: boolean;
}

/**
 * Flies a plane until it rests or the step budget runs out.
 *
 * @param plane Plane.
 * @param world Level collision.
 * @param seconds Longest simulated time.
 * @returns Every step.
 */
function fly(plane: PhysicsPlane, world: PhysicsLevelWorld, seconds: number): PlaneStep[] {
  const path: PlaneStep[] = [];
  for (let step = 0; step < seconds / PHYSICS_BALL_STEP_SECONDS && !plane.isResting; step++) {
    plane.advance(world);
    path.push({
      position: plane.position.clone(),
      velocity: plane.velocity.clone(),
      pitch: plane.pitch,
      skidding: plane.isSkidding(),
      resting: plane.isResting,
    });
  }
  return path;
}

describe('PhysicsPlane', () => {
  let rapier: PhysicsRapierModule;

  beforeAll(async () => {
    rapier = await PhysicsRapierRuntime.ensureLoaded();
  });

  it('glides in a gentle arc much farther than a thrown ball, nose along the path', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const path = fly(new PhysicsPlane(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -6)), world, 10);
    const touchdown = path.findIndex((step) => step.skidding);
    expect(touchdown).toBeGreaterThan(0);
    const air = path.slice(0, touchdown);
    const top = Math.max(...air.map((step) => step.position.y));
    expect(top).toBeGreaterThan(1.8);
    expect(top).toBeLessThan(2.6);
    expect(-air.at(-1)!.position.z).toBeGreaterThan(8);
    expect(Math.min(...air.map((step) => step.velocity.y))).toBeGreaterThan(-3);
    air.forEach((step) => {
      const climb = Math.atan2(step.velocity.y, Math.hypot(step.velocity.x, step.velocity.z));
      expect(Math.abs(step.pitch - climb)).toBeLessThan(0.25);
    });
    const ball = new PhysicsBall(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -6));
    while (ball.position.y > 0.2) ball.advance(world);
    expect(-ball.position.z).toBeLessThan(4);
  });

  it('skids over the floor on landing and comes to a halt flat on it', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const path = fly(new PhysicsPlane(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -6)), world, 10);
    const touchdown = path.findIndex((step) => step.skidding);
    const ground = path.slice(touchdown);
    const slide = ground[0]!.position.distanceTo(ground.at(-1)!.position);
    expect(slide).toBeGreaterThan(0.5);
    expect(slide).toBeLessThan(3);
    ground.forEach((step) => expect(step.position.y).toBeLessThan(PLANE_RADIUS + 0.01));
    expect(path.at(-1)!.resting).toBe(true);
    expect(Math.abs(path.at(-1)!.pitch)).toBeLessThan(0.02);
    const speeds = ground.map((step) => Math.hypot(step.velocity.x, step.velocity.z));
    speeds.slice(1).forEach((speed, index) => expect(speed).toBeLessThanOrEqual(speeds[index]! + 1e-9));
  });

  it('flies on after sliding off a ledge instead of dropping like a stone', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR, DECK]);
    const plane = new PhysicsPlane(new THREE.Vector3(0, 6 + PLANE_RADIUS, 1.2), new THREE.Vector3(0, 0, -4));
    const path = fly(plane, world, 10);
    const skid = path.findIndex((step) => step.skidding);
    const leave = path.findIndex((step, index) => index > skid && !step.skidding && step.position.z < 0);
    expect(skid).toBeGreaterThanOrEqual(0);
    expect(leave).toBeGreaterThan(skid);
    const edgeSpeed = Math.abs(path[leave]!.velocity.z);
    const landing = path.findIndex((step, index) => index > leave && step.position.y < 0.5);
    const flown = -path[landing]!.position.z;
    const dropTime = Math.sqrt((2 * 6) / 9.81);
    expect(flown).toBeGreaterThan(3 * edgeSpeed * dropTime);
    const after = path.slice(leave, landing);
    const lowest = after.findIndex((step) => step.velocity.y === Math.min(...after.map((s) => s.velocity.y)));
    expect(after.slice(lowest).some((step) => step.velocity.y > 0)).toBe(true);
  });

  it('recovers from a steep dive in a down-then-upward arch and settles into a glide', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const plane = new PhysicsPlane(new THREE.Vector3(0, 40, 0), new THREE.Vector3(0, -2, -0.3));
    const path = fly(plane, world, 8);
    expect(path[0]!.pitch).toBeLessThan(-1.2);
    const bottom = path.findIndex((step) => step.velocity.y > 0);
    expect(bottom).toBeGreaterThan(0);
    expect(path.slice(0, bottom).some((step) => step.velocity.y < -3.5)).toBe(true);
    expect(path[bottom + 30]!.pitch).toBeGreaterThan(0);
    const late = path.slice(-120);
    late.forEach((step) => {
      expect(step.velocity.y).toBeLessThan(0);
      expect(step.velocity.y).toBeGreaterThan(-1.5);
    });
    expect(path.at(-1)!.position.y).toBeGreaterThan(25);
  });

  it('turns to its new heading and banks into the turn after hitting a wall', () => {
    const wall: BoxSpec = {
      key: 'wall',
      center: new THREE.Vector3(0, 2, -3),
      size: new THREE.Vector3(10, 4, 0.5),
      yaw: 0,
    };
    const world = physicsBallTestWorld(rapier, [FLOOR, wall]);
    const plane = new PhysicsPlane(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(-1.5, 0, -5.5));
    const thrown = plane.yaw;
    let bank = 0;
    for (let step = 0; step < 360 && !plane.isResting; step++) {
      plane.advance(world);
      bank = Math.max(bank, Math.abs(plane.roll));
    }
    expect(Math.abs(physicsPlaneAngle(plane.yaw - thrown))).toBeGreaterThan(Math.PI / 2);
    expect(bank).toBeGreaterThan(0.05);
  });

  it('is swatted by a moving player and pushes a soccer ball far less than a tennis ball does', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const balls = new PhysicsBallWorld();
    const plane = new PhysicsPlane(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 0, -4.5));
    balls.set('plane', plane);
    const player: PhysicsBallMover = {
      feet: new THREE.Vector3(0, 0, -0.6),
      velocity: new THREE.Vector3(0, 0, 3),
      radius: 0.35,
      height: 1.75,
    };
    balls.advance(world, [player], 0.2);
    expect(plane.velocity.z).toBeGreaterThan(0);
  });
});

describe('Soccer ball', () => {
  let rapier: PhysicsRapierModule;

  beforeAll(async () => {
    rapier = await PhysicsRapierRuntime.ensureLoaded();
  });

  /**
   * Places a soccer ball at rest on the floor at the origin.
   *
   * @returns Ball.
   */
  function placed(): PhysicsBall {
    const shape = PHYSICS_TOY_SHAPES.soccer;
    const ball = new PhysicsBall(new THREE.Vector3(0, shape.radius + 0.0005, 0), new THREE.Vector3(), shape);
    ball.rest();
    return ball;
  }

  it('stays exactly where it was placed, silently, while nobody touches it', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const balls = new PhysicsBallWorld();
    const ball = placed();
    balls.set('soccer', ball);
    const bystander: PhysicsBallMover = {
      feet: new THREE.Vector3(0.35 + PHYSICS_TOY_SHAPES.soccer.radius + 0.0002, 0, 0),
      velocity: new THREE.Vector3(),
      radius: 0.35,
      height: 1.75,
    };
    const start = ball.position.clone();
    let changed = 0;
    let impacts = 0;
    for (let frame = 0; frame < 300; frame++) {
      const events = balls.advance(world, [bystander], 1 / 60);
      changed += events.changed.size;
      impacts += events.impacts.length;
    }
    expect(ball.position.equals(start)).toBe(true);
    expect(ball.isResting).toBe(true);
    expect(changed).toBe(0);
    expect(impacts).toBe(0);
  });

  it('rolls away when a player runs into it and comes to rest again', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const balls = new PhysicsBallWorld();
    const ball = placed();
    balls.set('soccer', ball);
    const runner: PhysicsBallMover = {
      feet: new THREE.Vector3(-0.5, 0, 0),
      velocity: new THREE.Vector3(5, 0, 0),
      radius: 0.35,
      height: 1.75,
    };
    for (let step = 0; step < 6; step++) {
      runner.feet.x += 5 * (1 / 60);
      balls.advance(world, [runner], 1 / 60);
    }
    expect(ball.velocity.x).toBeGreaterThan(5);
    expect(ball.position.y).toBeLessThan(PHYSICS_TOY_SHAPES.soccer.radius + 0.01);
    for (let frame = 0; frame < 60 * 30 && !ball.isResting; frame++) balls.advance(world, [], 1 / 60);
    expect(ball.isResting).toBe(true);
    expect(ball.position.x).toBeGreaterThan(3);
  });

  it('barely moves when a tennis ball hits it', () => {
    const world = physicsBallTestWorld(rapier, [FLOOR]);
    const balls = new PhysicsBallWorld();
    const soccer = placed();
    const r = PHYSICS_TOY_SHAPES.soccer.radius;
    const tennis = new PhysicsBall(new THREE.Vector3(-1, r, 0), new THREE.Vector3(10, 0.4, 0));
    balls.set('soccer', soccer);
    balls.set('tennis', tennis);
    balls.advance(world, [], 0.2);
    expect(soccer.velocity.x).toBeGreaterThan(0);
    expect(soccer.velocity.x).toBeLessThan(2.5);
    expect(tennis.velocity.x).toBeLessThan(0);
  });
});
