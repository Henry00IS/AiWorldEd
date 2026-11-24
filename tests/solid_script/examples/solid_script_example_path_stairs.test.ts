import { describe, expect, it } from 'vitest';
import { pathAssetEncode, type PathAsset, type PathAssetPoint } from '@/path/model/path_asset.js';
import { pathAssetScriptPath } from '@/path/model/path_asset_script.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLE_PATH_STAIRS } from '@/solid_script/examples/solid_script_examples_geometry.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** Width of the stairs the tests build. */
const WIDTH = 1.2;

/** A plan point: x and z. */
type Plan = readonly [number, number];

/**
 * A flight up along x, a level landing to the side and a flight back up the
 * other way.
 */
const TURNING_RUN: PathAsset = {
  points: [
    [-3, -1.2, 0],
    [0, 0, 0],
    [0, 0, 1.5],
    [-3, 1.2, 1.5],
  ],
  segments: [{ kind: 'Straight' }, { kind: 'Straight' }, { kind: 'Straight' }],
  closed: false,
};

/**
 * Builds a spiral run: a turn and a half about the up axis, climbing as it
 * goes.
 *
 * @param kind Kind of every stretch.
 * @returns Path.
 */
function spiralRun(kind: 'Straight' | 'Smooth'): PathAsset {
  const points = Array.from({ length: 19 }, (_, index): PathAssetPoint => {
    const angle = (index / 12) * Math.PI;
    return [2.5 * Math.cos(angle), index * 0.18, 2.5 * Math.sin(angle)];
  });
  return { points, segments: points.slice(1).map(() => ({ kind })), closed: false };
}

/**
 * Runs Path Stairs along a run and gives the plan outline of every solid.
 *
 * @param run Path.
 * @returns Plan outlines, each the convex hull of a solid seen from above.
 */
function footprints(run: PathAsset): Plan[][] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate([...SOLID_SCRIPT_EXAMPLE_PATH_STAIRS]), {
    inputs: { Run: pathAssetEncode(run), Width: String(WIDTH) },
  });
  expect(result.error).toBeNull();
  return solidScriptGeometryLeaves(result.shapes).map((leaf) => hull(leaf.points.map((point) => [point.x, point.z])));
}

/**
 * Convex hull of plan points, counter-clockwise.
 *
 * @param points Points.
 * @returns Hull.
 */
function hull(points: readonly Plan[]): Plan[] {
  const sorted = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const turn = (o: Plan, a: Plan, b: Plan): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: readonly Plan[]): Plan[] =>
    list.reduce<Plan[]>((kept, point) => {
      while (kept.length > 1 && turn(kept[kept.length - 2]!, kept[kept.length - 1]!, point) <= 1e-9) kept.pop();
      return [...kept, point];
    }, []);
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

/**
 * True when a plan point lies inside a convex outline, or on its edge.
 *
 * @param outline Counter-clockwise outline.
 * @param point Point.
 * @returns Whether it is covered.
 */
function covers(outline: readonly Plan[], point: Plan): boolean {
  return outline.every((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-6;
  });
}

/**
 * Plan points across the stairs all along a run, just inside both sides, and
 * round every bend, where a turning step would leave a wedge open.
 *
 * @param run Path.
 * @returns Points.
 */
function across(run: PathAsset): Plan[] {
  const walk = solidScriptPathSample(pathAssetScriptPath(run)).map((point): Plan => [point[0]!, point[2]!]);
  return walk
    .slice(1)
    .flatMap((end, index) => [
      ...Array.from({ length: 11 }, (_, along) => along / 10).flatMap((t) =>
        [-0.49, -0.25, 0, 0.25, 0.49].map((side) => offset(walk[index]!, end, t, side * WIDTH)),
      ),
      ...[-0.45, 0.45].map((side) => bend(walk[index]!, end, walk[index + 2], side * WIDTH)),
    ]);
}

/**
 * A plan point a set distance to the side of a stretch, part way along it.
 *
 * @param start Stretch start.
 * @param end Stretch end.
 * @param along Fraction along the stretch.
 * @param side Distance to the side.
 * @returns Point.
 */
function offset(start: Plan, end: Plan, along: number, side: number): Plan {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  return [start[0] + dx * along + (dz / length) * side, start[1] + dz * along - (dx / length) * side];
}

/**
 * A plan point a set distance from the end of a stretch, halfway between the
 * sides of that stretch and the next.
 *
 * @param start Stretch start.
 * @param end Stretch end, where the bend is.
 * @param next End of the next stretch, if any.
 * @param side Distance from the bend.
 * @returns Point.
 */
function bend(start: Plan, end: Plan, next: Plan | undefined, side: number): Plan {
  const before = offset(start, end, 1, 1);
  const after = next ? offset(end, next, 0, 1) : before;
  const x = before[0] + after[0] - 2 * end[0];
  const z = before[1] + after[1] - 2 * end[1];
  const length = Math.hypot(x, z) || 1;
  return [end[0] + (x / length) * side, end[1] + (z / length) * side];
}

/**
 * Lists the plan points no solid covers.
 *
 * @param run Path.
 * @param points Points that must be covered.
 * @returns Uncovered points.
 */
function uncovered(run: PathAsset, points: readonly Plan[]): Plan[] {
  const outlines = footprints(run);
  return points.filter((point) => !outlines.some((outline) => covers(outline, point)));
}

describe('Path Stairs example', () => {
  it('fills both outer corners of a level landing where the stairs turn back', () => {
    const corners: Plan[] = [
      [0.59, -0.59],
      [0.59, 2.09],
    ];
    expect(uncovered(TURNING_RUN, [...across(TURNING_RUN), ...corners])).toEqual([]);
  });

  it('leaves no gap between the steps of a spiral of straight stretches', () => {
    expect(uncovered(spiralRun('Straight'), across(spiralRun('Straight')))).toEqual([]);
  });

  it('leaves no gap between the steps of a smooth spiral', () => {
    expect(uncovered(spiralRun('Smooth'), across(spiralRun('Smooth')))).toEqual([]);
  });
});
