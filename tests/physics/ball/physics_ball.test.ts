import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsBall } from '@/physics/ball/physics_ball.js';
import {
  PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND,
  PHYSICS_BALL_RADIUS_METERS,
} from '@/physics/ball/physics_ball_constants.js';
import type { PhysicsLevelWorld } from '@/physics/level/physics_level_world.js';
import { physicsLevelTrimeshBuild, physicsLevelTrimeshExpandGeometry } from '@/physics/level/physics_level_trimesh.js';
import { PhysicsRapierRuntime, type PhysicsRapierModule } from '@/physics/rapier/physics_rapier_runtime.js';
import { PHYSICS_BALL_TEST_ROOM as ROOM, physicsBallTestWorld as buildWorld } from './physics_ball_test_world.js';

/**
 * Simulates a throw and records every position component.
 *
 * @param world Level world.
 * @param steps Steps to simulate.
 * @returns Flat list of x, y, z per step.
 */
function trajectory(world: PhysicsLevelWorld, steps: number): number[] {
  const ball = new PhysicsBall(new THREE.Vector3(-1, 1.6, -0.3), new THREE.Vector3(9.3, 2.4, 0.71));
  const path: number[] = [];
  for (let step = 0; step < steps; step++) {
    ball.advance(world);
    path.push(ball.position.x, ball.position.y, ball.position.z);
  }
  return path;
}

/**
 * Advances a ball until it reaches a step count.
 *
 * @param ball Ball.
 * @param world Level collision.
 * @param targetStep Step to reach.
 */
function advanceTo(ball: PhysicsBall, world: PhysicsLevelWorld, targetStep: number): void {
  while (ball.step < targetStep) ball.advance(world);
}

describe('PhysicsBall', () => {
  let rapier: PhysicsRapierModule;

  beforeAll(async () => {
    rapier = await PhysicsRapierRuntime.ensureLoaded();
  });

  it('bounces on the floor and comes to rest on top of it', () => {
    const world = buildWorld(rapier, ROOM.slice(0, 1));
    const ball = new PhysicsBall(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0.5, 0, 0));
    let lowest = Infinity;
    let rose = false;
    let previousY = ball.position.y;
    for (let step = 0; step < 1200 && !ball.isResting; step++) {
      ball.advance(world);
      lowest = Math.min(lowest, ball.position.y);
      rose ||= ball.position.y > previousY + 1e-6;
      previousY = ball.position.y;
    }
    expect(rose).toBe(true);
    expect(ball.isResting).toBe(true);
    expect(lowest).toBeGreaterThan(PHYSICS_BALL_RADIUS_METERS - 1e-3);
    expect(ball.position.y).toBeCloseTo(PHYSICS_BALL_RADIUS_METERS, 2);
  });

  it('reflects off a wall instead of passing through it', () => {
    const world = buildWorld(rapier, ROOM.slice(0, 2));
    const ball = new PhysicsBall(new THREE.Vector3(4, 1, 0), new THREE.Vector3(30, 0, 0));
    advanceTo(ball, world, 60);
    expect(ball.velocity.x).toBeLessThan(0);
    expect(ball.position.x).toBeLessThan(5.75 - PHYSICS_BALL_RADIUS_METERS + 1e-3);
  });

  it('follows the exact same path when colliders were inserted in another order', () => {
    const forward = trajectory(buildWorld(rapier, ROOM), 900);
    const shuffled = buildWorld(rapier, [...ROOM].reverse());
    shuffled.setTrimesh(
      'temporary',
      physicsLevelTrimeshBuild(physicsLevelTrimeshExpandGeometry(new THREE.BoxGeometry(1, 1, 1))) ?? {
        vertices: new Float32Array(),
        indices: new Uint32Array(),
        triangleCount: 0,
      },
      new THREE.Vector3(50, 0, 50),
      new THREE.Quaternion(),
    );
    shuffled.commit();
    shuffled.removeCollider('temporary');
    shuffled.commit();
    const replay = trajectory(shuffled, 900);
    expect(replay.length).toBe(forward.length);
    const firstDifference = replay.findIndex((value, index) => !Object.is(value, forward[index]));
    expect(firstDifference).toBe(-1);
  });

  it('wakes a resting ball when the ground under it is removed', () => {
    const world = buildWorld(rapier, ROOM.slice(0, 1));
    const ball = new PhysicsBall(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3());
    advanceTo(ball, world, 600);
    expect(ball.isResting).toBe(true);
    world.removeCollider('floor');
    world.commit();
    advanceTo(ball, world, 660);
    expect(ball.isResting).toBe(false);
    expect(ball.position.y).toBeLessThan(-1);
  });

  it('counts audible impacts with their speed and stays silent while rolling', () => {
    const world = buildWorld(rapier, ROOM.slice(0, 1));
    const ball = new PhysicsBall(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0.5, 0, 0));
    let firstImpactSpeed = 0;
    for (let step = 0; step < 1200 && !ball.isResting; step++) {
      ball.advance(world);
      if (ball.impacts === 1 && firstImpactSpeed === 0) firstImpactSpeed = ball.impactSpeed;
    }
    expect(firstImpactSpeed).toBeCloseTo(Math.sqrt(2 * 9.81 * (2 - PHYSICS_BALL_RADIUS_METERS)), 0);
    expect(ball.impacts).toBeGreaterThan(1);
    expect(ball.impactSpeed).toBeGreaterThanOrEqual(PHYSICS_BALL_IMPACT_SPEED_METERS_PER_SECOND);
    const settled = ball.impacts;
    advanceTo(ball, world, ball.step + 240);
    expect(ball.impacts).toBe(settled);
  });
});
