import { describe, expect, it } from 'vitest';
import { solidScriptPathInsert, solidScriptPathJoin } from '@/solid_script/language/solid_script_path_join.js';
import { solidScriptPathTyped } from '@/solid_script/language/solid_script_path_handles.js';
import { solidScriptPathStraight, type SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';

/**
 * Makes a straight open path along X from its start numbers.
 *
 * @param xs X of each point, at Y 0 and Z 0.
 * @returns Path.
 */
function along(...xs: number[]): SolidScriptPath<number[]> {
  return solidScriptPathStraight(
    xs.map((x) => [x, 0, 0]),
    false,
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

describe('solidScriptPathInsert', () => {
  it('puts a path first at 0, last at the count, and between points in between', () => {
    const base = along(0, 1, 2);
    expect(xs(solidScriptPathInsert(base, [along(10, 11)], 0, 'Insert Path'))).toEqual([10, 11, 0, 1, 2]);
    expect(xs(solidScriptPathInsert(base, [along(10, 11)], 3, 'Insert Path'))).toEqual([0, 1, 2, 10, 11]);
    expect(xs(solidScriptPathInsert(base, [along(10, 11)], 1, 'Insert Path'))).toEqual([0, 10, 11, 1, 2]);
    expect(xs(solidScriptPathInsert(base, [along(10, 11)], 2, 'Insert Path'))).toEqual([0, 1, 10, 11, 2]);
  });

  it('keeps one segment less than points, and joins the gaps with straight stretches', () => {
    const made = solidScriptPathInsert(along(0, 1, 2), [along(10, 11)], 1, 'Insert Path');
    expect(made.segments).toHaveLength(made.points.length - 1);
    expect(made.segments.every((segment) => segment.kind === 'line')).toBe(true);
    expect(made.closed).toBe(false);
  });

  it('keeps a shared point once where one path ends where the next starts', () => {
    expect(xs(solidScriptPathInsert(along(0, 1, 2), [along(1, 5, 6)], 2, 'Insert Path'))).toEqual([0, 1, 5, 6, 2]);
    expect(xs(solidScriptPathInsert(along(0, 1), [along(1, 2)], 2, 'Insert Path'))).toEqual([0, 1, 2]);
    expect(xs(solidScriptPathInsert(along(1, 2), [along(0, 1)], 0, 'Insert Path'))).toEqual([0, 1, 2]);
  });

  it('puts several paths in, one after another', () => {
    const made = solidScriptPathInsert(along(0, 9), [along(1, 2), along(3, 4)], 1, 'Insert Path');
    expect(xs(made)).toEqual([0, 1, 2, 3, 4, 9]);
  });

  it('works with empty and single-point paths', () => {
    const empty = { points: [], segments: [], closed: false };
    expect(xs(solidScriptPathInsert(empty, [along(1, 2)], 0, 'Insert Path'))).toEqual([1, 2]);
    expect(xs(solidScriptPathInsert(along(1, 2), [empty], 1, 'Insert Path'))).toEqual([1, 2]);
    expect(xs(solidScriptPathInsert(along(5), [along(6)], 0, 'Insert Path'))).toEqual([6, 5]);
    expect(xs(solidScriptPathInsert(along(5), [along(6)], 1, 'Insert Path'))).toEqual([5, 6]);
    expect(solidScriptPathInsert(along(5), [along(6)], 1, 'Insert Path').segments).toHaveLength(1);
    expect(solidScriptPathInsert(along(5), [along(5)], 1, 'Insert Path').points).toHaveLength(1);
  });

  it('stops on a position below 0, past the count or not a whole number, saying the range', () => {
    const base = along(0, 1, 2);
    for (const at of [-1, 4, 1.5, Number.NaN, undefined])
      expect(() => solidScriptPathInsert(base, [along(5, 6)], at, 'Insert Path')).toThrow(
        /Position needs a whole number from 0 to 3, because the path has 3 points/,
      );
  });

  it('stops on a closed path to add, naming it', () => {
    const ring = solidScriptPathStraight(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      true,
    );
    expect(() => solidScriptPathInsert(along(0, 1), [ring], 0, 'Insert Path')).toThrow(/Insert Path needs open paths/);
    expect(() => solidScriptPathInsert(along(0, 1), [along(2, 3), ring], 0, 'Insert Path')).toThrow(/path 2 to add/);
  });

  it('keeps a closed path closed, with its closing stretch when put in between', () => {
    const ring = solidScriptPathStraight(
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
        [0, 4, 0],
      ],
      true,
    );
    const middle = solidScriptPathInsert(ring, [along(5, 6)], 2, 'Insert Path');
    expect(middle.closed).toBe(true);
    expect(middle.points).toHaveLength(6);
    expect(middle.segments).toHaveLength(6);
    const first = solidScriptPathInsert(ring, [along(5, 6)], 0, 'Insert Path');
    expect(first.closed).toBe(true);
    expect(xs(first).slice(0, 2)).toEqual([5, 6]);
    expect(first.segments).toHaveLength(6);
    const last = solidScriptPathInsert(ring, [along(5, 6)], 4, 'Insert Path');
    expect(xs(last).slice(-2)).toEqual([5, 6]);
    expect(last.segments).toHaveLength(6);
  });

  it('keeps the curved closing stretch of a closed Bezier path put in between, and straightens it at the ends', () => {
    const ring = solidScriptPathTyped(
      solidScriptPathStraight(
        [
          [0, 0, 0],
          [4, 0, 0],
          [4, 4, 0],
        ],
        true,
      ),
      'Bezier',
      6,
    );
    const middle = solidScriptPathInsert(ring, [along(9, 10)], 1, 'Insert Path');
    expect(middle.segments.at(-1)).toEqual(ring.segments.at(-1));
    const end = solidScriptPathInsert(ring, [along(9, 10)], 3, 'Insert Path');
    expect(end.segments.at(-1)).toEqual({ kind: 'line' });
  });
});

describe('solidScriptPathInsert keeps what a path carries', () => {
  it('keeps tilts per point, 0 where a path had none', () => {
    const tilted = { ...along(0, 1), tilts: [10, 20] };
    expect(solidScriptPathInsert(tilted, [along(5, 6)], 2, 'Insert Path').tilts).toEqual([10, 20, 0, 0]);
    expect(solidScriptPathInsert(along(0, 1), [tilted], 0, 'Insert Path').tilts).toEqual([10, 20, 0, 0]);
    expect(solidScriptPathInsert(along(0, 1), [along(5, 6)], 0, 'Insert Path').tilts).toBeUndefined();
  });

  it('keeps the first path tilt at a shared point', () => {
    const first = { ...along(0, 1), tilts: [1, 2] };
    const second = { ...along(1, 2), tilts: [30, 40] };
    expect(solidScriptPathJoin(first, [second], true, 'Join Paths').tilts).toEqual([1, 2, 40]);
  });

  it('keeps Bezier handles, and mixes straight and Bezier stretches', () => {
    const curved = solidScriptPathTyped(along(0, 1, 2), 'Bezier', 4);
    const made = solidScriptPathJoin(along(-2, -1), [curved], true, 'Join Paths');
    expect(made.segments.map((segment) => segment.kind)).toEqual(['line', 'line', 'bezier', 'bezier']);
    expect(made.segments.slice(2)).toEqual(curved.segments);
    const other = solidScriptPathJoin(curved, [along(5, 6)], true, 'Join Paths');
    expect(other.segments.map((segment) => segment.kind)).toEqual(['bezier', 'bezier', 'line', 'line']);
    expect(other.segments.slice(0, 2)).toEqual(curved.segments);
    expect(other.handleTypes?.left).toEqual([...(curved.handleTypes?.left ?? []), 'Free', 'Free']);
  });

  it('keeps handle types, Free where a path had none, and the left and right of a shared point', () => {
    const first = { ...along(0, 1), handleTypes: { left: ['Auto', 'Vector'], right: ['Align', 'Free'] } };
    const second = { ...along(1, 2), handleTypes: { left: ['Free', 'Align'], right: ['Auto', 'Vector'] } };
    const made = solidScriptPathJoin(
      first as SolidScriptPath<number[]>,
      [second as SolidScriptPath<number[]>],
      true,
      'Join Paths',
    );
    expect(made.handleTypes).toEqual({ left: ['Auto', 'Vector', 'Align'], right: ['Align', 'Auto', 'Vector'] });
  });

  it('turns a Catmull Rom path into Bezier, and a NURBS path too, without a whole-path curve left', () => {
    const catmull = solidScriptPathTyped(along(0, 1, 2), 'Catmull Rom', 4);
    const nurbs = solidScriptPathTyped(along(0, 1, 2), 'NURBS', 4);
    for (const spline of [catmull, nurbs]) {
      const made = solidScriptPathJoin(along(-2, -1), [spline], true, 'Join Paths');
      expect(made.spline).toBeUndefined();
      expect(made.segments).toHaveLength(made.points.length - 1);
      const base = solidScriptPathJoin(spline, [along(5, 6)], true, 'Join Paths');
      expect(base.spline).toBeUndefined();
      expect(base.segments.some((segment) => segment.kind === 'bezier')).toBe(true);
    }
  });

  it('keeps the normal when every path is Up, or every path is Free, and drops it otherwise', () => {
    const up = { ...along(0, 1), normal: { mode: 'Up' as const } };
    const free = (y: number) => ({
      ...along(0, 1),
      normal: {
        mode: 'Free' as const,
        normals: [
          [0, y, 1],
          [0, y, 1],
        ],
      },
    });
    expect(solidScriptPathJoin(up, [{ ...along(5, 6), normal: { mode: 'Up' } }], true, 'Join Paths').normal).toEqual({
      mode: 'Up',
    });
    expect(solidScriptPathJoin(free(1), [free(2)], true, 'Join Paths').normal).toEqual({
      mode: 'Free',
      normals: [
        [0, 1, 1],
        [0, 1, 1],
        [0, 2, 1],
        [0, 2, 1],
      ],
    });
    expect(solidScriptPathJoin(up, [along(5, 6)], true, 'Join Paths').normal).toBeUndefined();
    expect(solidScriptPathJoin(up, [free(1)], true, 'Join Paths').normal).toBeUndefined();
  });

  it('keeps the stored resolution of the first path that has one', () => {
    const stored = { ...along(0, 1), resolution: 7 };
    expect(solidScriptPathJoin(stored, [along(5, 6)], true, 'Join Paths').resolution).toBe(7);
    expect(solidScriptPathJoin(along(0, 1), [stored], true, 'Join Paths').resolution).toBe(7);
    expect(solidScriptPathJoin(along(0, 1), [along(5, 6)], true, 'Join Paths').resolution).toBeUndefined();
  });
});

describe('solidScriptPathJoin', () => {
  it('adds at the end or the start, in the order given', () => {
    const base = along(0, 1);
    expect(xs(solidScriptPathJoin(base, [along(5, 6), along(7, 8)], true, 'Join Paths'))).toEqual([0, 1, 5, 6, 7, 8]);
    expect(xs(solidScriptPathJoin(base, [along(5, 6), along(7, 8)], false, 'Join Paths'))).toEqual([5, 6, 7, 8, 0, 1]);
  });

  it('is Insert Path at the count or at 0', () => {
    const base = along(0, 1, 2);
    const others = [along(5, 6), along(2, 9)];
    expect(solidScriptPathJoin(base, others, true, 'Join Paths')).toEqual(
      solidScriptPathInsert(base, others, 3, 'Join Paths'),
    );
    expect(solidScriptPathJoin(base, others, false, 'Join Paths')).toEqual(
      solidScriptPathInsert(base, others, 0, 'Join Paths'),
    );
  });

  it('stops on a closed path, since it has no ends', () => {
    const ring = solidScriptPathStraight(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      true,
    );
    expect(() => solidScriptPathJoin(ring, [along(5, 6)], true, 'Join Paths')).toThrow(/the first path is closed/);
  });

  it('does not change the paths it is given', () => {
    const base = { ...along(0, 1), tilts: [1, 2] };
    const other = along(1, 2);
    const before = JSON.stringify([base, other]);
    solidScriptPathJoin(base, [other], true, 'Join Paths');
    solidScriptPathJoin(base, [other], false, 'Join Paths');
    expect(JSON.stringify([base, other])).toBe(before);
  });
});
