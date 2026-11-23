import { describe, expect, it } from 'vitest';
import type { PathAsset } from '@/path/model/path_asset.js';
import {
  pathAssetClosedSet,
  pathAssetHandleSet,
  pathAssetHandles,
  pathAssetPointInsert,
  pathAssetPointMove,
  pathAssetPointRemove,
  pathAssetSegmentKindSet,
  pathAssetSegmentSet,
} from '@/path/model/path_asset_edit.js';

const CORNER: PathAsset = {
  points: [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 2],
  ],
  segments: [{ kind: 'Straight' }, { kind: 'Arc', degrees: 90, axis: [0, 1, 0] }],
  closed: false,
};

describe('path asset editing', () => {
  it('moves a point and keeps every other point', () => {
    expect(pathAssetPointMove(CORNER, 1, [5, 1, 0]).points).toEqual([
      [0, 0, 0],
      [5, 1, 0],
      [4, 0, 2],
    ]);
  });

  it('adds a point after the last with a straight stretch, and splits a stretch into two of its kind', () => {
    const traced = pathAssetPointInsert(CORNER, 2, [0, 0, 2]);
    expect(traced.points[3]).toEqual([0, 0, 2]);
    expect(traced.segments.map((segment) => segment.kind)).toEqual(['Straight', 'Arc', 'Straight']);
    const split = pathAssetPointInsert(CORNER, 1, [5, 0, 1]);
    expect(split.points[2]).toEqual([5, 0, 1]);
    expect(split.segments.map((segment) => segment.kind)).toEqual(['Straight', 'Arc', 'Arc']);
  });

  it('removes a point by joining its stretches, keeps two points, and opens a closed path left with two', () => {
    const removed = pathAssetPointRemove(CORNER, 1);
    expect(removed?.points).toEqual([
      [0, 0, 0],
      [4, 0, 2],
    ]);
    expect(removed?.segments.map((segment) => segment.kind)).toEqual(['Straight']);
    expect(pathAssetPointRemove(CORNER, 2)?.segments.map((segment) => segment.kind)).toEqual(['Straight']);
    expect(removed && pathAssetPointRemove(removed, 0)).toBeNull();
    const closed = pathAssetClosedSet(CORNER, true);
    expect(closed.segments).toHaveLength(3);
    expect(pathAssetPointRemove(closed, 0)?.closed).toBe(false);
  });

  it('gives a stretch turned Bezier handles a third of the way along, which drag as points', () => {
    const bent = pathAssetSegmentKindSet(CORNER, 0, 'Bezier');
    expect(bent.segments[0]).toEqual({ kind: 'Bezier', out: [4 / 3, 0, 0], in: [-4 / 3, 0, 0] });
    expect(pathAssetHandles(bent, 0)).toEqual([
      { handle: 'out', point: [4 / 3, 0, 0] },
      { handle: 'in', point: [4 - 4 / 3, 0, 0] },
    ]);
    const dragged = pathAssetHandleSet(bent, 0, 'in', [3, 1, 0]);
    expect(dragged.segments[0]?.in).toEqual([-1, 1, 0]);
    const quadratic = pathAssetSegmentKindSet(CORNER, 0, 'Quadratic');
    expect(pathAssetHandles(quadratic, 0)).toEqual([{ handle: 'control', point: [2, 0, 0] }]);
    expect(pathAssetHandleSet(quadratic, 0, 'control', [2, 0, 1]).segments[0]?.control).toEqual([0, 0, 1]);
    expect(pathAssetHandles(CORNER, 1)).toEqual([]);
  });

  it('sets the settings of a stretch, keeping only those of its kind', () => {
    const wide = pathAssetSegmentSet(CORNER, 1, { kind: 'Arc', degrees: 180, axis: [0, 0, 1], control: [1, 1, 1] });
    expect(wide.segments[1]).toEqual({ kind: 'Arc', degrees: 180, axis: [0, 0, 1] });
    expect(pathAssetSegmentKindSet(CORNER, 1, 'Arc')).toBe(CORNER);
  });
});
