import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import {
  createPlayerCollisionScratch,
  playerCollisionIntegrateStep,
} from '@/player/collision/player_collision_resolve.js';
import {
  playerCollisionCapsuleCenterBuried,
  playerCollisionPoseIsFree,
} from '@/player/collision/player_collision_depenetration.js';
import {
  PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED,
  PLAYER_JUMP_SPEED_METERS_PER_SECOND,
  PLAYER_WALK_SPEED_METERS_PER_SECOND,
} from '@/player/player_constants.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';

const BENCH_ENABLED = process.env['AIWORLDED_PHYSICS_BENCH'] === '1';
const BENCH_SCENES = (process.env['AIWORLDED_PHYSICS_BENCH_SCENES'] ?? '').split(',').filter((path) => path.length > 0);
const BENCH_OUT = process.env['AIWORLDED_PHYSICS_BENCH_OUT'] ?? '';
const FRAME_SECONDS = 1 / 60;
const WALK_FRAMES = 600;
const SPAWN_COUNT = 6;
const EDIT_COUNT = 12;

/** Measured numbers for one scene. */
interface BenchSceneResult {
  scene: string;
  brushCount: number;
  csgLoadMilliseconds: number;
  colliderCount: number;
  triangleCount: number;
  initialSyncMilliseconds: number;
  rssDeltaMegabytes: number;
  rescanMilliseconds: number;
  edits: { csgMilliseconds: number; collisionMilliseconds: number; changedColliders: number }[];
  walkers: {
    spawn: number[];
    steps: number;
    meanStepMilliseconds: number;
    maxStepMilliseconds: number;
    buriedFrames: number;
    insideFrames: number;
    firstInside: number[] | null;
    floorCrossings: number;
    firstCrossing: number[] | null;
    minFeetY: number;
    endFeet: number[];
  }[];
  sceneMinY: number;
}

/**
 * Returns the median of a list of numbers.
 *
 * @param values Numbers.
 * @returns Median, or zero when empty.
 */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Loads a VMF or scene JSON file into a world group and returns its solid
 * models with the CSG load time.
 *
 * @param path File path.
 * @returns World group, solid models, and load milliseconds.
 */
async function loadBenchScene(
  path: string,
): Promise<{ world: THREE.Group; models: SolidModel[]; milliseconds: number }> {
  const world = new THREE.Group();
  const start = performance.now();
  if (path.endsWith('.vmf')) {
    const result = await new HandlerSceneIo().importVmfFromText(readFileSync(path, 'utf8'), basename(path), null);
    if (result) {
      world.add(result.model.root);
    }
  } else {
    new SceneDeserializer().deserialize(JSON.parse(readFileSync(path, 'utf8')), world);
  }
  const models = collectSolidModels(world);
  world.updateMatrixWorld(true);
  return { world, models, milliseconds: performance.now() - start };
}

/**
 * Finds every registered solid model under a root, rebuilding any that have no
 * result geometry yet.
 *
 * @param root Scene root.
 * @returns Solid models.
 */
function collectSolidModels(root: THREE.Object3D): SolidModel[] {
  const models: SolidModel[] = [];
  root.traverse((object) => {
    const model = SolidModelRegistry.get(object);
    if (model && !models.includes(model)) {
      models.push(model);
    }
  });
  for (const model of models) {
    if ((model.getResultMesh().geometry.getAttribute('position')?.count ?? 0) === 0) {
      model.rebuild(true);
    }
  }
  return models;
}

/**
 * Finds walkable spawn poses spread over the scene: downward rays on a grid,
 * keeping enclosed, walkable, free poses.
 *
 * @param world Collision world.
 * @param bounds Scene bounds.
 * @returns Feet positions.
 */
function findSpawns(world: PlayerCollisionWorld, bounds: THREE.Box3): THREE.Vector3[] {
  const spawns: THREE.Vector3[] = [];
  const grid = 9;
  for (let index = 0; index < grid * grid && spawns.length < SPAWN_COUNT * 4; index++) {
    const x = bounds.min.x + ((index % grid) + 0.5) * ((bounds.max.x - bounds.min.x) / grid);
    const z = bounds.min.z + (Math.floor(index / grid) + 0.5) * ((bounds.max.z - bounds.min.z) / grid);
    collectSpawnsOnColumn(world, x, z, bounds, spawns);
  }
  const stride = Math.max(1, Math.floor(spawns.length / SPAWN_COUNT));
  return spawns.filter((_, index) => index % stride === 0).slice(0, SPAWN_COUNT);
}

/**
 * Walks a vertical ray down one column and records free walkable poses that
 * have a roof above them.
 *
 * @param world Collision world.
 * @param x Column X.
 * @param z Column Z.
 * @param bounds Scene bounds.
 * @param spawns Output list.
 */
function collectSpawnsOnColumn(
  world: PlayerCollisionWorld,
  x: number,
  z: number,
  bounds: THREE.Box3,
  spawns: THREE.Vector3[],
): void {
  const levelWorld = world.syncLevelWorld();
  const rig = world.getCharacterRig();
  const origin = new THREE.Vector3(x, bounds.max.y - 0.01, z);
  const down = new THREE.Vector3(0, -1, 0);
  for (let guard = 0; guard < 16 && levelWorld && rig; guard++) {
    const hit = world.raycastNearest(origin, down, origin.y - bounds.min.y + 1);
    if (!hit) {
      return;
    }
    const feet = hit.point.clone();
    const hasRoof = world.raycastNearest(feet.clone().setY(feet.y + 2), new THREE.Vector3(0, 1, 0), 200) !== null;
    if (hit.normal.y > 0.7 && hasRoof && playerCollisionPoseIsFree(levelWorld, rig, feet.clone().setY(feet.y + 0.05))) {
      spawns.push(feet);
    }
    origin.copy(hit.point).setY(hit.point.y - 0.02);
  }
}

/**
 * Walks one player for a fixed number of frames with turns and jumps, timing
 * each step and counting frames with the capsule inside geometry.
 *
 * @param world Collision world.
 * @param spawn Spawn feet.
 * @param seed Turn pattern seed.
 * @returns Walk statistics.
 */
function walkPlayer(
  world: PlayerCollisionWorld,
  spawn: THREE.Vector3,
  seed: number,
): BenchSceneResult['walkers'][number] {
  const feet = spawn.clone();
  const scratch = createPlayerCollisionScratch();
  const timings: number[] = [];
  let verticalVelocity = 0;
  let buriedFrames = 0;
  let minFeetY = feet.y;
  let floorCrossings = 0;
  let insideFrames = 0;
  let firstInside: number[] | null = null;
  let firstCrossing: number[] | null = null;
  const previous = feet.clone();
  for (let frame = 0; frame < WALK_FRAMES; frame++) {
    const heading = seed + Math.floor(frame / 90) * 2.1;
    const intent = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const jump = scratch.result.isGrounded && frame % 120 === 60;
    verticalVelocity = jump
      ? PLAYER_JUMP_SPEED_METERS_PER_SECOND
      : verticalVelocity - PLAYER_GRAVITY_METERS_PER_SECOND_SQUARED * FRAME_SECONDS;
    const start = performance.now();
    const result = playerCollisionIntegrateStep(
      world,
      feet,
      intent.clone().multiplyScalar(PLAYER_WALK_SPEED_METERS_PER_SECOND * FRAME_SECONDS),
      verticalVelocity,
      FRAME_SECONDS,
      scratch,
      intent,
      scratch.result.isGrounded && !jump,
    );
    timings.push(performance.now() - start);
    verticalVelocity = result.verticalVelocity;
    buriedFrames += countBuried(world, feet);
    const inside = countInside(world, feet);
    insideFrames += inside;
    if (inside > 0) {
      firstInside ??= [frame, ...feet.toArray(), scratch.result.isGrounded ? 1 : 0];
    }
    if (crossedFloor(world, previous, feet)) {
      floorCrossings++;
      firstCrossing ??= [...previous.toArray(), ...feet.toArray()];
    }
    previous.copy(feet);
    minFeetY = Math.min(minFeetY, feet.y);
  }
  const mean = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  return {
    spawn: spawn.toArray(),
    steps: WALK_FRAMES,
    meanStepMilliseconds: mean,
    maxStepMilliseconds: Math.max(...timings),
    buriedFrames,
    insideFrames,
    firstInside,
    floorCrossings,
    firstCrossing,
    minFeetY,
    endFeet: feet.toArray(),
  };
}

/**
 * Returns whether the feet moved down through a walkable surface this frame (a
 * fall-through), using a ray down the new column from just above the old
 * height.
 *
 * @param world Collision world.
 * @param previous Feet before the step.
 * @param feet Feet after the step.
 * @returns True when a floor lies between the two heights.
 */
function crossedFloor(world: PlayerCollisionWorld, previous: THREE.Vector3, feet: THREE.Vector3): boolean {
  if (feet.y >= previous.y - 0.02) {
    return false;
  }
  const origin = new THREE.Vector3(feet.x, previous.y + 0.05, feet.z);
  const hit = world.raycastNearest(origin, new THREE.Vector3(0, -1, 0), origin.y - feet.y - 0.02);
  return hit !== null && hit.normal.y > 0.5;
}

/**
 * Returns one when the capsule at the feet is inside or overlapping geometry.
 *
 * @param world Collision world.
 * @param feet Feet position.
 * @returns One when buried, else zero.
 */
function countBuried(world: PlayerCollisionWorld, feet: THREE.Vector3): number {
  const levelWorld = world.syncLevelWorld();
  const rig = world.getCharacterRig();
  if (!levelWorld || !rig) {
    return 0;
  }
  return playerCollisionPoseIsFree(levelWorld, rig, feet) ? 0 : 1;
}

/**
 * Returns one when the capsule center is inside closed geometry.
 *
 * @param world Collision world.
 * @param feet Feet position.
 * @returns One when inside, else zero.
 */
function countInside(world: PlayerCollisionWorld, feet: THREE.Vector3): number {
  const levelWorld = world.syncLevelWorld();
  return levelWorld && playerCollisionCapsuleCenterBuried(levelWorld, feet) ? 1 : 0;
}

/**
 * Moves a spread of brushes one at a time and times the CSG rebuild and the
 * collision update separately.
 *
 * @param world Collision world.
 * @param model Largest solid model.
 * @returns Per-edit timings.
 */
function benchEdits(world: PlayerCollisionWorld, model: SolidModel): BenchSceneResult['edits'] {
  const brushes = model.getBrushes();
  const edits: BenchSceneResult['edits'] = [];
  for (let index = 0; index < EDIT_COUNT && brushes.length > 0; index++) {
    const brush = brushes[Math.floor((index * brushes.length) / EDIT_COUNT)];
    if (!brush) {
      continue;
    }
    const csgStart = performance.now();
    model.setBrushTransform(brush.id, brush.position.clone().add(new THREE.Vector3(0.25, 0, 0)));
    const csgMilliseconds = performance.now() - csgStart;
    const collisionStart = performance.now();
    const report = world.getSceneSync()?.sync();
    edits.push({
      csgMilliseconds,
      collisionMilliseconds: performance.now() - collisionStart,
      changedColliders: report?.changedColliderCount ?? 0,
    });
  }
  return edits;
}

/**
 * Builds collision for a scene and measures build, rescan, edits and walking.
 *
 * @param path Scene file path.
 * @returns Measurements.
 */
async function benchScene(path: string): Promise<BenchSceneResult> {
  const loaded = await loadBenchScene(path);
  const rssBefore = process.memoryUsage().rss;
  const world = new PlayerCollisionWorld();
  world.setWorldRoot(loaded.world);
  const syncStart = performance.now();
  world.syncLevelWorld();
  const initialSyncMilliseconds = performance.now() - syncStart;
  const rssDeltaMegabytes = (process.memoryUsage().rss - rssBefore) / 1_048_576;
  const stats = world.syncLevelWorld()?.getStats();
  const bounds = new THREE.Box3().setFromObject(loaded.world);
  const rescanStart = performance.now();
  world.invalidateMeshCache();
  world.syncLevelWorld();
  const rescanMilliseconds = performance.now() - rescanStart;
  const walkers = findSpawns(world, bounds).map((spawn, index) => walkPlayer(world, spawn, index * 1.3));
  const largest = [...loaded.models].sort((a, b) => b.getBrushCount() - a.getBrushCount())[0];
  const edits = largest ? benchEdits(world, largest) : [];
  return {
    scene: basename(path),
    brushCount: loaded.models.reduce((sum, model) => sum + model.getBrushCount(), 0),
    csgLoadMilliseconds: loaded.milliseconds,
    colliderCount: stats?.colliderCount ?? 0,
    triangleCount: stats?.triangleCount ?? 0,
    initialSyncMilliseconds,
    rssDeltaMegabytes,
    rescanMilliseconds,
    edits,
    walkers,
    sceneMinY: bounds.min.y,
  };
}

describe.skipIf(!BENCH_ENABLED)('physics level scene benchmark', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  it('builds, edits and walks the configured scenes', async () => {
    const results: BenchSceneResult[] = [];
    for (const path of BENCH_SCENES.filter((scene) => existsSync(scene))) {
      const result = await benchScene(path);
      results.push(result);
      console.info(
        `[physics bench] ${result.scene}: ${result.brushCount} brushes, ${result.colliderCount} colliders, ${result.triangleCount} tris, build ${result.initialSyncMilliseconds.toFixed(1)} ms, edit collision median ${median(result.edits.map((edit) => edit.collisionMilliseconds)).toFixed(2)} ms, step mean ${median(result.walkers.map((walker) => walker.meanStepMilliseconds)).toFixed(3)} ms`,
      );
    }
    if (BENCH_OUT) {
      writeFileSync(BENCH_OUT, JSON.stringify(results, null, 2));
    }
    for (const result of results) {
      expect(result.colliderCount).toBeGreaterThan(0);
    }
  }, 1_800_000);
});
