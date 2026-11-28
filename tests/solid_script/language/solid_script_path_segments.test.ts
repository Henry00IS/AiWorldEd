import { describe, expect, it } from 'vitest';
import { solidScriptPathTyped } from '@/solid_script/language/solid_script_path_handles.js';
import { solidScriptPathStraight, type SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptPathSegmentRemove } from '@/solid_script/language/solid_script_path_segments.js';

/**
 * Makes a straight path along X.
 *
 * @param xs X of each point.
 * @param closed True to close it.
 * @returns Path.
 */
function along(xs: number[], closed = false): SolidScriptPath<number[]> {
  return solidScriptPathStraight(
    xs.map((x) => [x, 0, 0]),
    closed,
  );
}

/**
 * Lists the X of every point.
 *
 * @param path Path.
 * @returns X values.
 */
function xs(path: SolidScriptPath<number[]>): number[] {
  return path.points.map(([x = 0]) => x);
}

describe('solidScriptPathSegmentRemove on an open path', () => {
  const path = along([0, 1, 2, 3, 4]);

  it('takes the point the segment ends at, or the one the last segment starts at', () => {
    expect(xs(solidScriptPathSegmentRemove(path, 0, 'Remove Segment'))).toEqual([0, 2, 3, 4]);
    expect(xs(solidScriptPathSegmentRemove(path, 1, 'Remove Segment'))).toEqual([0, 1, 3, 4]);
    expect(xs(solidScriptPathSegmentRemove(path, 2, 'Remove Segment'))).toEqual([0, 1, 2, 4]);
    expect(xs(solidScriptPathSegmentRemove(path, 3, 'Remove Segment'))).toEqual([0, 1, 2, 4]);
  });

  it('keeps one segment less than points, and the ends', () => {
    for (let index = 0; index < 4; index += 1) {
      const made = solidScriptPathSegmentRemove(path, index, 'Remove Segment');
      expect(made.segments).toHaveLength(made.points.length - 1);
      expect(made.points[0]).toEqual([0, 0, 0]);
      expect(made.points.at(-1)).toEqual([4, 0, 0]);
      expect(made.closed).toBe(false);
    }
  });

  it('works on a path of 3 points, and stops on 2', () => {
    expect(xs(solidScriptPathSegmentRemove(along([0, 1, 2]), 0, 'Remove Segment'))).toEqual([0, 2]);
    expect(() => solidScriptPathSegmentRemove(along([0, 1]), 0, 'Remove Segment')).toThrow(/at least 3 points/);
    expect(() => solidScriptPathSegmentRemove(along([0]), 0, 'Remove Segment')).toThrow(
      /Segment needs a whole number from 0 to -1/,
    );
  });

  it('stops on a Segment out of range, naming the range', () => {
    for (const index of [-1, 4, 1.5, Number.NaN, undefined])
      expect(() => solidScriptPathSegmentRemove(path, index, 'Remove Segment')).toThrow(
        /Segment needs a whole number from 0 to 3, because the path has 4 segments/,
      );
  });

  it('keeps tilts, handle types and Free normals with their points', () => {
    const rich: SolidScriptPath<number[]> = {
      ...path,
      tilts: [0, 10, 20, 30, 40],
      handleTypes: {
        left: ['Auto', 'Vector', 'Align', 'Free', 'Auto'],
        right: ['Vector', 'Align', 'Free', 'Auto', 'Vector'],
      },
      normal: {
        mode: 'Free',
        normals: [
          [0, 1, 0],
          [0, 2, 0],
          [0, 3, 0],
          [0, 4, 0],
          [0, 5, 0],
        ],
      },
    };
    const made = solidScriptPathSegmentRemove(rich, 1, 'Remove Segment');
    expect(made.tilts).toEqual([0, 10, 30, 40]);
    expect(made.handleTypes?.left).toEqual(['Auto', 'Vector', 'Free', 'Auto']);
    expect(made.handleTypes?.right).toEqual(['Vector', 'Align', 'Auto', 'Vector']);
    expect(made.normal).toEqual({
      mode: 'Free',
      normals: [
        [0, 1, 0],
        [0, 2, 0],
        [0, 4, 0],
        [0, 5, 0],
      ],
    });
  });

  it('keeps the curve of the segment that runs on, and the Up normal and resolution', () => {
    const curved = solidScriptPathTyped(path, 'Bezier', 5);
    const made = solidScriptPathSegmentRemove(
      { ...curved, normal: { mode: 'Up' }, resolution: 7 },
      0,
      'Remove Segment',
    );
    expect(made.segments).toEqual(curved.segments.slice(1));
    expect(made.normal).toEqual({ mode: 'Up' });
    expect(made.resolution).toBe(7);
  });

  it('turns a Catmull Rom or NURBS path into Bezier first', () => {
    for (const type of ['Catmull Rom', 'NURBS'] as const) {
      const made = solidScriptPathSegmentRemove(solidScriptPathTyped(path, type, 4), 1, 'Remove Segment');
      expect(made.spline).toBeUndefined();
      expect(made.points).toHaveLength(4);
      expect(made.segments).toHaveLength(3);
    }
  });

  it('does not change the path it is given', () => {
    const before = JSON.stringify(path);
    solidScriptPathSegmentRemove(path, 1, 'Remove Segment');
    expect(JSON.stringify(path)).toBe(before);
  });
});

describe('solidScriptPathSegmentRemove on a closed path', () => {
  const ring = along([0, 1, 2, 3], true);

  it('opens the ring at the segment, starting at the point it ended at, keeping every point', () => {
    expect(xs(solidScriptPathSegmentRemove(ring, 3, 'Remove Segment'))).toEqual([0, 1, 2, 3]);
    expect(xs(solidScriptPathSegmentRemove(ring, 0, 'Remove Segment'))).toEqual([1, 2, 3, 0]);
    expect(xs(solidScriptPathSegmentRemove(ring, 1, 'Remove Segment'))).toEqual([2, 3, 0, 1]);
    expect(xs(solidScriptPathSegmentRemove(ring, 2, 'Remove Segment'))).toEqual([3, 0, 1, 2]);
  });

  it('is open with one segment less than points', () => {
    const made = solidScriptPathSegmentRemove(ring, 2, 'Remove Segment');
    expect(made.closed).toBe(false);
    expect(made.segments).toHaveLength(3);
  });

  it('rotates tilts with the points, and keeps the curve of the stretches that stay', () => {
    const curved = solidScriptPathTyped(ring, 'Bezier', 5);
    const made = solidScriptPathSegmentRemove({ ...curved, tilts: [0, 10, 20, 30] }, 1, 'Remove Segment');
    expect(made.tilts).toEqual([20, 30, 0, 10]);
    expect(made.segments).toEqual([curved.segments[2], curved.segments[3], curved.segments[0]]);
  });

  it('works on a ring of 2 points, and stops on a Segment out of range', () => {
    expect(xs(solidScriptPathSegmentRemove(along([0, 1], true), 0, 'Remove Segment'))).toEqual([1, 0]);
    expect(() => solidScriptPathSegmentRemove(ring, 4, 'Remove Segment')).toThrow(
      /from 0 to 3, because the path has 4 segments/,
    );
  });
});
