import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  physicsShatterBakeDecode,
  physicsShatterBakeEncode,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_bake.js';
import { PhysicsShatterSimulation } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { physicsShatterTransformIsIdentity } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';
import { SIM_TEST_WALL, simTestRun, simTestSetup } from './physics_shatter_sim_fixture.js';

describe('physics shatter simulation', () => {
  it('blasts glass pieces near the impact along the arrow and gives the same result for the same seed', async () => {
    const setup = simTestSetup({ crackSize: 0.5 });
    const first = await simTestRun(setup);
    const second = await simTestRun(simTestSetup({ crackSize: 0.5 }));
    expect(physicsShatterBakeEncode(second.transforms)).toBe(physicsShatterBakeEncode(first.transforms));
    const moved = first.transforms.filter((transform) => !physicsShatterTransformIsIdentity(transform));
    expect(moved.length).toBeGreaterThan(setup.pieces.length / 4);
    const meanPush = moved.reduce((sum, transform) => sum + transform.translation.z, 0) / moved.length;
    expect(meanPush).toBeGreaterThan(SIM_TEST_WALL.depth);
  });

  it('solves with the iteration count of the setup: the same count repeats, another count differs', async () => {
    const run = async (solverIterations: number): Promise<string> =>
      physicsShatterBakeEncode(
        (await simTestRun({ ...simTestSetup({ crackSize: 0.5 }), solverIterations })).transforms,
      );
    const eight = await run(8);
    expect(await run(8)).toBe(eight);
    expect(await run(1)).not.toBe(eight);
  });

  it('runs at most the duration at 60 steps a second', async () => {
    const rapier = await PhysicsRapierRuntime.ensureLoaded();
    const simulation = new PhysicsShatterSimulation(rapier, simTestSetup({ crackSize: 0.6 }, { duration: 0.5 }));
    expect(simulation.getMaximumSteps()).toBe(30);
    while (simulation.step()) {
      /* steps until finished */
    }
    expect(simulation.getStepsTaken()).toBeLessThanOrEqual(30);
    simulation.dispose();
  });

  it('keeps every piece above a fixed floor slab', async () => {
    const setup = simTestSetup({ crackSize: 0.6 });
    const result = await simTestRun(setup);
    setup.pieces.forEach((piece, index) => {
      const transform = result.transforms[index];
      if (!transform) return;
      const centre = piece.centroid.clone().add(transform.translation).applyMatrix4(setup.frameToWorld);
      expect(centre.y).toBeGreaterThan(1.5 - 0.01);
    });
  });

  it('has no floor or bound: without fixed geometry pieces fall freely for the whole duration', async () => {
    const setup = { ...simTestSetup({ crackSize: 0.6 }, { duration: 10 }), staticHulls: [] };
    const result = await simTestRun(setup);
    expect(result.steps).toBe(600);
    const drops = setup.pieces.map((piece, index) => {
      const translation = result.transforms[index]!.translation;
      expect([translation.x, translation.y, translation.z].every(Number.isFinite)).toBe(true);
      const start = piece.centroid.clone().applyMatrix4(setup.frameToWorld).y;
      return start - piece.centroid.clone().add(translation).applyMatrix4(setup.frameToWorld).y;
    });
    expect(Math.min(...drops)).toBeGreaterThan(400);
    expect(Math.max(...drops)).toBeLessThan(600);
    const decoded = physicsShatterBakeDecode(physicsShatterBakeEncode(result.transforms), setup.pieces.length);
    expect(decoded?.[0]?.translation.y).toBeCloseTo(result.transforms[0]!.translation.y, 1);
  });

  it('leaves bricks outside the blast radius stuck where they were cut', async () => {
    const setup = simTestSetup({ mode: 'bricks' }, { radius: 0.5 });
    const result = await simTestRun(setup);
    const radius = setup.blast.radius;
    setup.pieces.forEach((piece, index) => {
      if (piece.centroid.distanceTo(setup.blast.impactPoint) <= radius) return;
      expect(result.stuck[index]).toBe(true);
      expect(
        physicsShatterTransformIsIdentity(
          result.transforms[index] ?? {
            rotation: new THREE.Quaternion(0, 1, 0, 0),
            translation: new THREE.Vector3(1, 0, 0),
          },
        ),
      ).toBe(true);
    });
    expect(result.stuck.some((stuck) => !stuck)).toBe(true);
  });

  it('blasts bricks out of a wall even when fixed bricks hem them in on both sides', async () => {
    const wall = { width: 3, height: 2, depth: 0.2 };
    const setup = simTestSetup({ mode: 'bricks' }, { radius: 1.2, strength: 7 }, wall);
    const result = await simTestRun(setup);
    const moving = PhysicsShatterSimulation.movingPieceCount(setup);
    const flown = result.transforms.filter((transform) => transform.translation.length() > 0.5);
    expect(moving).toBeLessThan(setup.pieces.length - 10);
    expect(flown.length).toBeGreaterThan(moving / 2);
  });

  it('counts a piece that moved less than a centimetre and turned less than a degree as stuck', () => {
    const turn = (degrees: number): THREE.Quaternion =>
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(degrees));
    const small = { rotation: turn(0.5), translation: new THREE.Vector3(0.005, 0, 0) };
    const moved = { rotation: turn(0.5), translation: new THREE.Vector3(0.02, 0, 0) };
    const turned = { rotation: turn(2), translation: new THREE.Vector3(0.005, 0, 0) };
    expect(PhysicsShatterSimulation.transformIsStuck(small)).toBe(true);
    expect(PhysicsShatterSimulation.transformIsStuck(moved)).toBe(false);
    expect(PhysicsShatterSimulation.transformIsStuck(turned)).toBe(false);
  });

  it('keeps a piece Rapier cannot hull in place instead of failing', async () => {
    const setup = simTestSetup({ crackSize: 0.8 });
    const flat = {
      index: setup.pieces.length,
      hull: new Float32Array([0, 1, 0, 0.1, 1, 0, 0, 1.1, 0]),
      centroid: new THREE.Vector3(0.03, 1.03, 0),
      isBrick: false,
    };
    const result = await simTestRun({ ...setup, pieces: [...setup.pieces, flat] });
    expect(
      physicsShatterTransformIsIdentity(
        result.transforms[flat.index] ?? {
          rotation: new THREE.Quaternion(0, 1, 0, 0),
          translation: new THREE.Vector3(1, 0, 0),
        },
      ),
    ).toBe(true);
  });
});
