import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS,
  PHYSICS_SHATTER_PLAYBACK_MIN_STEPS_PER_FRAME,
  physicsShatterPlaybackSteps,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_playback.js';

/**
 * Fake clock behind performance.now, so step costs do not depend on machine
 * load.
 */
const playbackTestClock = { now: 0 };

/**
 * Builds a stand-in simulation whose steps each take a set time.
 *
 * @param stepMilliseconds Fake clock time per step.
 * @param maximumSteps Steps before it reports finished.
 * @returns Simulation stand-in and its step counter.
 */
function playbackTestSimulation(stepMilliseconds: number, maximumSteps = Infinity) {
  const counter = { steps: 0 };
  const simulation = {
    step: (): boolean => {
      if (counter.steps >= maximumSteps) return false;
      playbackTestClock.now += stepMilliseconds;
      counter.steps++;
      return true;
    },
  };
  return { simulation, counter };
}

describe('physics shatter playback pacing', () => {
  beforeEach(() => {
    playbackTestClock.now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => playbackTestClock.now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes every due step when they fit the frame budget', () => {
    const { simulation, counter } = playbackTestSimulation(0);
    physicsShatterPlaybackSteps(simulation, 30);
    expect(counter.steps).toBe(30);
  });

  it('takes at least one step even when none is due', () => {
    const { simulation, counter } = playbackTestSimulation(0);
    physicsShatterPlaybackSteps(simulation, 0);
    expect(counter.steps).toBe(1);
  });

  it('stops at the frame budget when slow steps fall behind, after the per-frame minimum', () => {
    const { simulation, counter } = playbackTestSimulation(1.5);
    physicsShatterPlaybackSteps(simulation, 100);
    expect(counter.steps).toBeGreaterThan(PHYSICS_SHATTER_PLAYBACK_MIN_STEPS_PER_FRAME);
    expect(counter.steps).toBe(Math.ceil(PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS / 1.5));
  });

  it('takes the per-frame minimum even when each step exceeds the budget', () => {
    const { simulation, counter } = playbackTestSimulation(PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS + 1);
    physicsShatterPlaybackSteps(simulation, 100);
    expect(counter.steps).toBe(PHYSICS_SHATTER_PLAYBACK_MIN_STEPS_PER_FRAME);
  });

  it('takes only the due steps when fewer than the minimum are due', () => {
    const { simulation, counter } = playbackTestSimulation(PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS + 1);
    physicsShatterPlaybackSteps(simulation, 2);
    expect(counter.steps).toBe(2);
  });

  it('stops when the simulation finishes', () => {
    const { simulation, counter } = playbackTestSimulation(0, 5);
    physicsShatterPlaybackSteps(simulation, 100);
    expect(counter.steps).toBe(5);
  });
});
