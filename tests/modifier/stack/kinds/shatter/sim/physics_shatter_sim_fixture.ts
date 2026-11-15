import * as THREE from 'three';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import type { PhysicsShatterSettings } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PhysicsShatterSimulation } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim.js';
import type {
  PhysicsShatterSimResult,
  PhysicsShatterSimSetup,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_types.js';
import {
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from '../fracture/physics_shatter_fixtures.js';

/** Wall size used by the simulation tests: width, height, depth in metres. */
export const SIM_TEST_WALL = { width: 2, height: 2, depth: 0.2 };

/**
 * Fractures a wall standing on the origin and builds a simulation setup that
 * blasts it along +Z from the middle of its front face, with a floor at its
 * foot.
 *
 * @param settings Fracture overrides.
 * @param blast Blast overrides.
 * @param size Wall width, height and depth in metres.
 * @returns Setup in a frame placed and turned away from the world origin.
 */
export function simTestSetup(
  settings: Partial<PhysicsShatterSettings> = {},
  blast: Partial<PhysicsShatterSimSetup['blast']> = {},
  size: typeof SIM_TEST_WALL = SIM_TEST_WALL,
): PhysicsShatterSimSetup {
  const impactPoint = new THREE.Vector3(0, size.height / 2, -size.depth / 2);
  const wall = physicsShatterTestWall(size.width, size.height, size.depth);
  const fracture = physicsShatterFracture(
    physicsShatterTestInputs(wall),
    physicsShatterTestSettings({ impactPoint, ...settings }),
  );
  const frameToWorld = new THREE.Matrix4().compose(
    new THREE.Vector3(3, 1.5, -2),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7),
    new THREE.Vector3(1, 1, 1),
  );
  return {
    pieces: fracture.pieces,
    frameToWorld,
    blast: { impactPoint, direction: new THREE.Vector3(0, 0, 1), strength: 8, radius: 1.5, duration: 3, ...blast },
    seed: 7,
    staticHulls: [SIM_TEST_FLOOR],
    solverIterations: 8,
  };
}

/**
 * A 100 m square, 1 m thick fixed slab in the world whose top is the bottom of
 * the test wall, at world height 1.5.
 */
export const SIM_TEST_FLOOR = new Float32Array(
  [0, 1, 2, 3, 4, 5, 6, 7].flatMap((corner) => [corner & 1 ? 50 : -50, corner & 2 ? 1.5 : 0.5, corner & 4 ? 50 : -50]),
);

/**
 * Runs a setup to the end.
 *
 * @param setup Simulation setup.
 * @returns Result.
 */
export async function simTestRun(setup: PhysicsShatterSimSetup): Promise<PhysicsShatterSimResult> {
  const rapier = await PhysicsRapierRuntime.ensureLoaded();
  const simulation = new PhysicsShatterSimulation(rapier, setup);
  while (simulation.step()) {
    /* steps until finished */
  }
  const result = simulation.result();
  simulation.dispose();
  return result;
}
