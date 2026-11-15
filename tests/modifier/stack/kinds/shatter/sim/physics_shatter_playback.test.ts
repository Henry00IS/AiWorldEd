import { describe, expect, it } from 'vitest';
import {
  PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS,
  physicsShatterPlaybackSteps,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_playback.js';

/**
 * Builds a stand-in simulation whose steps each take a set time.
 *
 * @param stepMilliseconds Busy time per step.
 * @param maximumSteps Steps before it reports finished.
 * @returns Simulation stand-in and its step counter.
 */
function playbackTestSimulation(stepMilliseconds: number, maximumSteps = Infinity) {
  const counter = { steps: 0 };
  const simulation = {
    step: (): boolean => {
      if (counter.steps >= maximumSteps) return false;
      const end = performance.now() + stepMilliseconds;
      while (performance.now() < end) {
        /* busy step */
      }
      counter.steps++;
      return true;
    },
  };
  return { simulation, counter };
}

describe('physics shatter playback pacing', () => {
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

  it('stops at the frame budget when slow steps fall behind', () => {
    const { simulation, counter } = playbackTestSimulation(3);
    physicsShatterPlaybackSteps(simulation, 100);
    expect(counter.steps).toBeGreaterThanOrEqual(1);
    expect(counter.steps).toBeLessThanOrEqual(Math.ceil(PHYSICS_SHATTER_PLAYBACK_FRAME_BUDGET_MILLISECONDS / 3) + 1);
  });

  it('stops when the simulation finishes', () => {
    const { simulation, counter } = playbackTestSimulation(0, 5);
    physicsShatterPlaybackSteps(simulation, 100);
    expect(counter.steps).toBe(5);
  });
});
