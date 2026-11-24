import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pathAssetDecode, pathAssetEncode, pathAssetFromData, type PathAsset } from '@/path/model/path_asset.js';
import { pathAssetArcInner } from '@/path/model/path_asset_arc.js';
import { pathAssetScriptPath, pathAssetStretchWalks } from '@/path/model/path_asset_script.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';

describe('path assets', () => {
  it('keeps valid points, one segment per stretch, and Closed only with three points', () => {
    const path = pathAssetFromData({
      points: [
        [0, 0, 0],
        [1, 0, 'x'],
        [2, 0, 0],
        [3, 0, 0],
      ],
      segments: [{ kind: 'Bezier', out: [0, 1, 0] }, { kind: 'Wobbly' }],
      closed: true,
    });
    expect(path?.points).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(path?.segments).toEqual([
      { kind: 'Bezier', out: [0, 1, 0], in: [0, 0, 0] },
      { kind: 'Straight' },
      { kind: 'Straight' },
    ]);
    expect(
      pathAssetFromData({
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        closed: true,
      })?.closed,
    ).toBe(false);
    expect(pathAssetFromData({ points: [[0, 0, 0]] })).toBeNull();
    expect(pathAssetDecode('not json')).toBeNull();
    const round = pathAssetDecode(pathAssetEncode(path!));
    expect(round).toEqual(path);
  });

  it('puts every inner arc point exactly on the circle and ends at the end point', () => {
    for (const degrees of [90, -90, 180, 270]) {
      const inner = pathAssetArcInner([0, 0, 0], [2, 0, 0], degrees, [0, 1, 0], 12);
      const radius = 1 / Math.sin(THREE.MathUtils.degToRad(Math.abs(degrees)) / 2);
      const points = [[0, 0, 0], ...inner, [2, 0, 0]].map((point) => new THREE.Vector3(...point));
      const centre = new THREE.Vector3(1, 0, 0).addScaledVector(
        new THREE.Vector3(0, 0, -Math.sign(degrees)),
        radius * Math.cos(THREE.MathUtils.degToRad(degrees) / 2),
      );
      for (const point of points) expect(point.distanceTo(centre)).toBeCloseTo(radius, 9);
      expect(points.every((point) => Math.abs(point.y) < 1e-9)).toBe(true);
      const steps = points.slice(1).map((point, index) => point.distanceTo(points[index]!));
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-9);
    }
  });

  it('turns an Arc counter-clockwise seen from the tip of its axis, as Rotate By turns', () => {
    const middle = (to: [number, number, number], axis: [number, number, number]) => {
      const inner = pathAssetArcInner([0, 0, 0], to, 180, axis, 2);
      return inner[(inner.length - 1) / 2]!.map((value) => Math.round(value * 1e9) / 1e9 || 0);
    };
    expect(middle([2, 0, 0], [0, 1, 0])).toEqual([1, 0, 1]);
    expect(middle([2, 0, 0], [0, 0, 1])).toEqual([1, -1, 0]);
    expect(middle([2, 0, 0], [0, 0, -1])).toEqual([1, 1, 0]);
    expect(middle([0, 0, 2], [1, 0, 0])).toEqual([0, 1, 1]);
    expect(middle([0, 0, 2], [0, 1, 0])).toEqual([-1, 0, 1]);
    expect(middle([0, 2, 0], [0, 0, 1])).toEqual([1, 1, 0]);
    expect(middle([0, 2, 0], [1, 0, 0])).toEqual([0, 1, -1]);
  });

  it('turns Quadratic and Smooth stretches into exact Beziers and an Arc into points on its circle', () => {
    const asset: PathAsset = {
      points: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 2],
        [4, 0, 2],
      ],
      segments: [
        { kind: 'Quadratic', control: [0, 0, -1] },
        { kind: 'Arc', degrees: 180, axis: [0, 1, 0] },
        { kind: 'Smooth' },
      ],
      closed: false,
    };
    const path = pathAssetScriptPath(asset);
    const quadratic = path.segments[0];
    expect(quadratic?.kind).toBe('bezier');
    const handles = quadratic?.kind === 'bezier' ? [...quadratic.out, ...quadratic.in] : [];
    [2 / 3, 0, -2 / 3, 4 / 3, 0, -2 / 3].forEach((value, index) => expect(handles[index]).toBeCloseTo(value, 12));
    const arcPoints = path.points.slice(1, -1);
    expect(arcPoints.length).toBeGreaterThan(20);
    for (const point of arcPoints)
      expect(new THREE.Vector3(...point).distanceTo(new THREE.Vector3(2, 0, 1))).toBeCloseTo(1, 9);
    expect(path.segments.at(-1)?.kind).toBe('bezier');
    expect(solidScriptPathSample(path).at(-1)).toEqual([4, 0, 2]);
  });

  it('draws each stretch on its own from its start to its end, closed paths back to the start', () => {
    const asset: PathAsset = {
      points: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 2, 0],
      ],
      segments: [{ kind: 'Straight' }, { kind: 'Arc', degrees: 90, axis: [0, 0, 1] }, { kind: 'Straight' }],
      closed: true,
    };
    const walks = pathAssetStretchWalks(asset);
    expect(walks).toHaveLength(3);
    expect(walks[0]).toEqual([
      [0, 0, 0],
      [2, 0, 0],
    ]);
    expect(walks[1]!.length).toBeGreaterThan(2);
    expect(walks[1]![0]).toEqual([2, 0, 0]);
    expect(walks[1]!.at(-1)).toEqual([2, 2, 0]);
    expect(walks[2]).toEqual([
      [2, 2, 0],
      [0, 0, 0],
    ]);
  });
});
