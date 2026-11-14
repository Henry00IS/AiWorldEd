import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsBall } from '@/physics/ball/physics_ball.js';
import { PHYSICS_BALL_RADIUS_METERS, PHYSICS_BALL_STEP_SECONDS } from '@/physics/ball/physics_ball_constants.js';
import type { PhysicsBallMover } from '@/physics/ball/physics_ball_contacts.js';
import { PhysicsBallWorld, type PhysicsBallEvents } from '@/physics/ball/physics_ball_world.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PHYSICS_BALL_TEST_ROOM as ROOM, physicsBallTestWorld as buildWorld } from './physics_ball_test_world.js';

let level: PhysicsLevelWorld;

/**
 * Creates empty step events.
 *
 * @returns Events.
 */
function events(): PhysicsBallEvents {
  return { impacts: [], changed: new Set() };
}

/**
 * Creates a ball resting on the floor.
 *
 * @param x Position x.
 * @param z Position z.
 * @returns Resting ball.
 */
function resting(x: number, z = 0): PhysicsBall {
  const ball = new PhysicsBall(new THREE.Vector3(x, PHYSICS_BALL_RADIUS_METERS + 0.0004, z), new THREE.Vector3());
  ball.rest();
  return ball;
}

/**
 * Creates a player capsule at the origin walking along +X.
 *
 * @param speed Walking speed.
 * @returns Capsule.
 */
function walker(speed: number): PhysicsBallMover {
  return { feet: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(speed, 0, 0), radius: 0.35, height: 1.75 };
}

describe('PhysicsBallWorld', () => {
  beforeAll(async () => {
    level = buildWorld(await PhysicsRapierRuntime.ensureLoaded(), ROOM.slice(0, 1));
  });

  it('bounces balls off each other, exchanging most of their momentum', () => {
    const world = new PhysicsBallWorld();
    const moving = new PhysicsBall(new THREE.Vector3(-1, 1, 0), new THREE.Vector3(5, 0, 0));
    const still = new PhysicsBall(new THREE.Vector3(-0.5, 1, 0), new THREE.Vector3(0, 0, 0));
    world.set('a', moving);
    world.set('b', still);
    const seen = events();
    for (let step = 0; step < 15; step++) world.step(level, [], seen);
    expect(still.velocity.x).toBeGreaterThan(4);
    expect(moving.velocity.x).toBeLessThan(1);
    expect(moving.position.distanceTo(still.position)).toBeGreaterThanOrEqual(2 * PHYSICS_BALL_RADIUS_METERS);
    expect([...seen.changed].sort()).toEqual(['a', 'b']);
    expect(seen.impacts.map((impact) => impact.key)).toContain('a');
  });

  it('lets a walking player push a resting ball without being slowed', () => {
    const world = new PhysicsBallWorld();
    const ball = resting(0.6);
    world.set('ball', ball);
    const player = walker(3);
    const seen = events();
    for (let step = 0; step < 60; step++) {
      player.feet.addScaledVector(player.velocity, PHYSICS_BALL_STEP_SECONDS);
      world.step(level, [player], seen);
    }
    expect(player.velocity.toArray()).toEqual([3, 0, 0]);
    expect(player.feet.x).toBeCloseTo(1.5, 6);
    expect(ball.position.x).toBeGreaterThan(player.feet.x + 0.35);
    expect(ball.velocity.x).toBeGreaterThan(3);
    expect(seen.changed.has('ball')).toBe(true);
  });

  it('bounces a ball off a standing player', () => {
    const world = new PhysicsBallWorld();
    const ball = new PhysicsBall(new THREE.Vector3(-1, 1, 0), new THREE.Vector3(6, 0, 0));
    world.set('ball', ball);
    for (let step = 0; step < 30; step++) world.step(level, [walker(0)], events());
    expect(ball.velocity.x).toBeLessThan(-2);
    expect(ball.position.x).toBeLessThan(-0.35);
  });

  it('reports nothing for balls resting against each other', () => {
    const world = new PhysicsBallWorld();
    world.set('a', resting(0));
    world.set('b', resting(2 * PHYSICS_BALL_RADIUS_METERS + 0.0002));
    const seen = events();
    for (let step = 0; step < 120; step++) world.step(level, [walker(0)].slice(1), seen);
    expect(seen.changed.size).toBe(0);
    expect(world.isAwake()).toBe(false);
  });

  it('gives the same result for the same input', () => {
    const run = (): number[] => {
      const world = new PhysicsBallWorld();
      const balls = [0, 1, 2, 3, 4, 5].map((index) => {
        const velocity = new THREE.Vector3(Math.cos(index) * 4, 1, Math.sin(index) * 4);
        return new PhysicsBall(new THREE.Vector3(index * 0.05, 0.5, 0), velocity);
      });
      balls.forEach((ball, index) => world.set(`b${index}`, ball));
      for (let step = 0; step < 240; step++) world.step(level, [walker(1)], events());
      return balls.flatMap((ball) => ball.position.toArray());
    };
    expect(run()).toEqual(run());
  });
});
