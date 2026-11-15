import type { PhysicsShatterSimulation } from './physics_shatter_sim.js';
import { PHYSICS_SHATTER_SIM_STEP_SECONDS } from './physics_shatter_sim.js';
import type { PhysicsShatterPreview } from './physics_shatter_preview.js';

/**
 * Most fixed steps taken per drawn frame, so a slow frame slows the playback
 * instead of stalling it.
 */
const PHYSICS_SHATTER_PLAYBACK_MAX_STEPS_PER_FRAME = 4;

/** Timing of one played simulation. */
export interface PhysicsShatterPlaybackTiming {
  /** Milliseconds spent inside physics steps. */
  physicsMilliseconds: number;
  /** Milliseconds from the first to the last drawn frame. */
  wallMilliseconds: number;
  /** Frames drawn. */
  frames: number;
}

/**
 * Waits for the next drawn frame.
 *
 * @returns Frame timestamp in milliseconds.
 */
function physicsShatterPlaybackFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Plays a simulation in real time: each drawn frame takes the fixed steps that
 * are due and shows the pieces where they are, until it finishes.
 *
 * @param simulation Simulation to step.
 * @param preview Preview to move.
 * @param onProgress Receives the simulated seconds after each frame.
 * @returns Timing of the playback.
 */
export async function physicsShatterPlaybackRun(
  simulation: PhysicsShatterSimulation,
  preview: PhysicsShatterPreview,
  onProgress: (simulatedSeconds: number) => void,
): Promise<PhysicsShatterPlaybackTiming> {
  const timing: PhysicsShatterPlaybackTiming = { physicsMilliseconds: 0, wallMilliseconds: 0, frames: 0 };
  const start = await physicsShatterPlaybackFrame();
  while (!simulation.isFinished()) {
    const now = await physicsShatterPlaybackFrame();
    const due = Math.floor((now - start) / 1000 / PHYSICS_SHATTER_SIM_STEP_SECONDS) - simulation.getStepsTaken();
    timing.physicsMilliseconds += physicsShatterPlaybackSteps(simulation, due);
    preview.show(simulation.transformsCurrent());
    timing.frames++;
    timing.wallMilliseconds = now - start;
    onProgress(simulation.getStepsTaken() * PHYSICS_SHATTER_SIM_STEP_SECONDS);
  }
  return timing;
}

/**
 * Takes the steps due in one frame, at least one and at most the frame cap.
 *
 * @param simulation Simulation to step.
 * @param due Steps due by the clock.
 * @returns Milliseconds spent stepping.
 */
function physicsShatterPlaybackSteps(simulation: PhysicsShatterSimulation, due: number): number {
  const count = Math.min(PHYSICS_SHATTER_PLAYBACK_MAX_STEPS_PER_FRAME, Math.max(1, due));
  const before = performance.now();
  for (let index = 0; index < count; index++) simulation.step();
  return performance.now() - before;
}
