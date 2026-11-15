import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  physicsShatterLastRunOf,
  type PhysicsShatterLastRun,
} from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import {
  PHYSICS_SHATTER_BAKE_HASH_KEY,
  PHYSICS_SHATTER_BAKE_KEY,
} from '@/modifier/stack/kinds/shatter/physics_shatter_bake_state.js';
import { physicsShatterBakeEncode } from './physics_shatter_bake.js';
import { physicsShatterBakeParameters } from '@/modifier/stack/kinds/shatter/physics_shatter_format_version.js';
import { PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES, PhysicsShatterSimulation } from './physics_shatter_sim.js';
import type { PhysicsShatterSimResult, PhysicsShatterSimSetup } from './physics_shatter_sim_types.js';
import { physicsShatterStaticsGather } from './physics_shatter_sim_statics.js';
import { physicsShatterSimWarnThin } from './physics_shatter_sim_thin.js';
import { PhysicsShatterPreview } from './physics_shatter_preview.js';
import { physicsShatterPlaybackRun, type PhysicsShatterPlaybackTiming } from './physics_shatter_playback.js';
import { physicsShatterCommitParameters, physicsShatterCommitParametersRead } from './physics_shatter_commit.js';
import {
  PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT,
  PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY,
  PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX,
} from '@/modifier/stack/kinds/shatter/physics_shatter_action_fields.js';

/** Modifiers with a simulation playing, so a second press waits its turn. */
const physicsShatterSimulationsRunning = new Set<string>();

/**
 * Simulates the blast of one Physics Shatter modifier while the user watches,
 * then stores where the pieces landed as one undoable edit.
 *
 * @param target Action target.
 */
export async function physicsShatterSimulateAction(target: ModifierStackActionTarget): Promise<void> {
  const key = `${target.volume.uuid}/${target.stepId}`;
  const run = physicsShatterLastRunOf(target.volume.uuid, target.stepId);
  if (physicsShatterSimulationsRunning.has(key)) return;
  if (run?.status === 'unsupported')
    return target.status('Saved By A Newer Editor: update before simulating, so its rubble is not overwritten.');
  if (!run || run.fracture.pieces.length === 0)
    return target.status('Nothing To Shatter: no brush is inside the volume.');
  physicsShatterSimulationsRunning.add(key);
  try {
    await physicsShatterSimulateRun(target, run);
  } finally {
    physicsShatterSimulationsRunning.delete(key);
  }
}

/**
 * Clears the stored rubble of one Physics Shatter modifier as one undoable
 * edit.
 *
 * @param target Action target.
 */
export function physicsShatterResetAction(target: ModifierStackActionTarget): void {
  const patch = {
    [PHYSICS_SHATTER_BAKE_KEY]: '',
    [PHYSICS_SHATTER_BAKE_HASH_KEY]: '',
  };
  physicsShatterCommitParameters(target.volume, target.stepId, patch, target.commandStack);
  target.status('');
}

/**
 * Builds the setup, plays the simulation and stores its result.
 *
 * @param target Action target.
 * @param run Last evaluation of the modifier.
 */
async function physicsShatterSimulateRun(target: ModifierStackActionTarget, run: PhysicsShatterLastRun): Promise<void> {
  const rapier = await PhysicsRapierRuntime.ensureLoaded();
  const setup = physicsShatterSimulateSetup(target, run);
  const crackSize = physicsShatterCommitParametersRead(target.volume, target.stepId)?.['crackSize'];
  physicsShatterSimWarnThin(run.fracture.pieces, typeof crackSize === 'number' ? crackSize : 0.5);
  const moving = PhysicsShatterSimulation.movingPieceCount(setup);
  if (moving > PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES)
    return target.status(`Too Many Pieces: ${moving} would move, at most ${PHYSICS_SHATTER_SIM_MAX_MOVING_PIECES}.`);
  const played = await physicsShatterSimulatePlay(target, run, new PhysicsShatterSimulation(rapier, setup));
  physicsShatterSimulateStore(target, run, played.result, played.timing);
}

/**
 * Plays a simulation in the viewport while the modifier's own pieces step
 * aside, then frees it and lets the modifier draw again.
 *
 * @param target Action target.
 * @param run Last evaluation of the modifier.
 * @param simulation Simulation to play.
 * @returns Result and playback timing.
 */
async function physicsShatterSimulatePlay(
  target: ModifierStackActionTarget,
  run: PhysicsShatterLastRun,
  simulation: PhysicsShatterSimulation,
): Promise<{ result: PhysicsShatterSimResult; timing: PhysicsShatterPlaybackTiming }> {
  const sceneRoot = modifierVolumeSceneRoot(target.volume);
  const pieces = run.fracture.pieces;
  const preview = new PhysicsShatterPreview(sceneRoot, target.volume.uuid, target.stepId, pieces, run.frameToWorld);
  modifierBevelRefreshScene(sceneRoot);
  try {
    const timing = await physicsShatterPlaybackRun(simulation, preview, (seconds) =>
      target.status(`Simulating… ${seconds.toFixed(1)} s`),
    );
    return { result: simulation.result(), timing };
  } finally {
    simulation.dispose();
    preview.dispose();
    modifierBevelRefreshScene(sceneRoot);
  }
}

/**
 * Builds the simulation setup from the last run and the scene around it.
 *
 * @param target Action target.
 * @param run Last evaluation of the modifier.
 * @returns Setup.
 */
function physicsShatterSimulateSetup(
  target: ModifierStackActionTarget,
  run: PhysicsShatterLastRun,
): PhysicsShatterSimSetup {
  const statics = physicsShatterStaticsGather(
    modifierVolumeSceneRoot(target.volume),
    run.fracture.pieces,
    run.frameToWorld,
    run.inputBrushIds,
  );
  return {
    pieces: run.fracture.pieces,
    frameToWorld: run.frameToWorld,
    blast: run.blast,
    seed: run.fracture.pieces[0]?.seed ?? 0,
    staticHulls: statics.hulls,
    floorHeight: statics.floorHeight,
    solverIterations: physicsShatterSimulateSolverIterations(target),
  };
}

/**
 * Reads the solver iteration count of the modifier, whole and within range.
 *
 * @param target Action target.
 * @returns Solver iterations per step.
 */
function physicsShatterSimulateSolverIterations(target: ModifierStackActionTarget): number {
  const value = physicsShatterCommitParametersRead(target.volume, target.stepId)?.[
    PHYSICS_SHATTER_SOLVER_ITERATIONS_KEY
  ];
  if (typeof value !== 'number' || !Number.isFinite(value)) return PHYSICS_SHATTER_SOLVER_ITERATIONS_DEFAULT;
  return Math.min(PHYSICS_SHATTER_SOLVER_ITERATIONS_MAX, Math.max(1, Math.round(value)));
}

/**
 * Stores a simulation result with the input hash it was made from and reports
 * what happened.
 *
 * @param target Action target.
 * @param run Last evaluation the simulation started from.
 * @param result Simulation result.
 * @param timing Playback timing.
 */
function physicsShatterSimulateStore(
  target: ModifierStackActionTarget,
  run: PhysicsShatterLastRun,
  result: PhysicsShatterSimResult,
  timing: PhysicsShatterPlaybackTiming,
): void {
  const bake = physicsShatterBakeEncode(result.transforms);
  const patch = physicsShatterBakeParameters(bake, run.bakeKey);
  if (!physicsShatterCommitParameters(target.volume, target.stepId, patch, target.commandStack))
    return target.status('The modifier was removed while it simulated.');
  const stuck = result.stuck.filter(Boolean).length;
  const seconds = (result.steps / 60).toFixed(1);
  target.status(
    `Simulated ${seconds} s: ${result.stuck.length - stuck} pieces moved, ${stuck} stuck · ` +
      `${timing.physicsMilliseconds.toFixed(0)} ms physics · ${(bake.length / 1024).toFixed(1)} KB stored.`,
  );
}
