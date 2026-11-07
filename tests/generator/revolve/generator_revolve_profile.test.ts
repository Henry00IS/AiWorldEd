import { describe, expect, it } from 'vitest';
import { generatorRevolveRuns, type GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';

/**
 * Builds evenly spaced stations from radii, with optional vertical steps.
 *
 * @param radii Radius per station; a pair array is a vertical step.
 * @returns Stations.
 */
function stations(radii: readonly (number | readonly [number, number])[]): GeneratorRevolveStation[] {
  return radii.flatMap((radius, index) =>
    typeof radius === 'number'
      ? [{ height: index, radius }]
      : radius.map((value) => ({ height: index, radius: value })),
  );
}

describe('revolve profile runs', () => {
  it('merges a concave run and splits where the slope rises', () => {
    const runs = generatorRevolveRuns(stations([0.5, 0.4, 0.3, 0.2, 0.7]));
    expect(runs).toHaveLength(2);
    expect(runs[0]?.map((station) => station.radius)).toEqual([0.5, 0.2]);
  });

  it('keeps bulges (falling slopes) in one run', () => {
    const runs = generatorRevolveRuns(stations([0.2, 0.6, 0.8, 0.6, 0.2]));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(5);
  });

  it('makes no brush for vertical steps and splits there', () => {
    const runs = generatorRevolveRuns(stations([1, [1, 0.5], 0.5, [0.5, 1], 1]));
    expect(runs).toHaveLength(3);
    expect(runs.every((run) => run.length === 2)).toBe(true);
  });

  it('skips pieces on the axis but keeps cones to an apex', () => {
    const runs = generatorRevolveRuns(stations([0, 0, 0.5, 0]));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.map((station) => station.radius)).toEqual([0, 0.5, 0]);
  });

  it('ignores repeated points', () => {
    const runs = generatorRevolveRuns([
      { height: 0, radius: 1 },
      { height: 1, radius: 0.5 },
      { height: 1, radius: 0.5 },
      { height: 2, radius: 0 },
    ]);
    expect(runs).toHaveLength(1);
  });
});
