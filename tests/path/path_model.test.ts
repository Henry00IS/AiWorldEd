import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  PATH_MAX_POINTS,
  pathCanonical,
  pathCreate,
  pathDecode,
  pathEncode,
  pathFallback,
  pathNormalize,
} from '@/path/model/path_model.js';
import { PathSampler, pathSamplesOf } from '@/path/model/path_sampler.js';

describe('path values', () => {
  it('round-trips through its compact encoding', () => {
    const path = pathCreate(
      [
        [0, 0, 0],
        [1.234567, 2, -3],
        [4, 5, 6],
      ],
      { closed: true, smooth: false },
    );
    const decoded = pathDecode(pathEncode(path));
    expect(decoded?.closed).toBe(true);
    expect(decoded?.smooth).toBe(false);
    expect(decoded?.points[1]).toEqual({ x: 1.23457, y: 2, z: -3 });
    expect(pathCanonical(pathEncode(path))).toBe(pathEncode(decoded!));
  });

  it('turns untrusted data into a valid path', () => {
    expect(pathNormalize(null)).toEqual(pathFallback());
    expect(pathNormalize({ points: [{ x: 0, y: 0, z: 0 }] })).toEqual(pathFallback());
    expect(
      pathNormalize({
        points: [
          { x: 0, y: 0, z: 0 },
          { x: Number.NaN, y: 0, z: 0 },
          { x: 1, y: 2, z: 3 },
        ],
      }).points,
    ).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 3 },
    ]);
    const many = Array.from({ length: PATH_MAX_POINTS + 10 }, (_, index) => ({ x: index, y: 0, z: 0 }));
    expect(pathNormalize({ points: many }).points).toHaveLength(PATH_MAX_POINTS);
    expect(
      pathNormalize({
        points: [
          { x: 1e9, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
      }).points[0]!.x,
    ).toBe(100000);
    expect(pathDecode('not json')).toBeNull();
    expect(pathDecode('{"p":[1,2]}')).toBeNull();
    expect(pathDecode(5)).toBeNull();
    expect(pathCanonical('garbage')).toBe(pathEncode(pathFallback()));
  });
});

describe('path sampler', () => {
  it('measures a polyline and finds positions and directions along it', () => {
    const sampler = new PathSampler(
      pathCreate(
        [
          [0, 0, 0],
          [3, 0, 0],
          [3, 0, 4],
        ],
        { smooth: false },
      ),
    );
    expect(sampler.length).toBeCloseTo(7);
    const middle = sampler.frameAt(5);
    expect(middle.position.toArray()).toEqual([3, 0, 2].map((value) => expect.closeTo(value, 6)));
    expect(middle.tangent.toArray()).toEqual([0, 0, 1].map((value) => expect.closeTo(value, 6)));
    const past = sampler.frameAt(9);
    expect(past.position.toArray()).toEqual([3, 0, 6].map((value) => expect.closeTo(value, 6)));
    const before = sampler.frameAt(-1);
    expect(before.position.toArray()).toEqual([-1, 0, 0].map((value) => expect.closeTo(value, 6)));
  });

  it('closes a loop and spreads positions without doubling the start', () => {
    const square = pathCreate(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 2],
        [0, 0, 2],
      ],
      { closed: true, smooth: false },
    );
    const sampler = new PathSampler(square);
    expect(sampler.length).toBeCloseTo(8);
    expect(sampler.spread(4, true)).toEqual([0, 2, 4, 6]);
    expect(sampler.spread(3, false)).toEqual([0, 4, 8]);
  });

  it('passes a smooth curve through every control point', () => {
    const path = pathCreate([
      [0, 0, 0],
      [3, 0, 0],
      [5, 1, 2],
      [5, 0, 5],
    ]);
    const samples = pathSamplesOf(path);
    for (const point of path.points) {
      const nearest = Math.min(
        ...samples.map((sample) => sample.distanceTo(new THREE.Vector3(point.x, point.y, point.z))),
      );
      expect(nearest).toBeLessThan(1e-6);
    }
    expect(new PathSampler(path).length).toBeGreaterThan(3 + Math.hypot(2, 1, 2) + Math.hypot(0, 1, 3) - 1e-6);
  });

  it('carries an object along the path, turning with it without rolling on level ground', () => {
    const sampler = new PathSampler(
      pathCreate(
        [
          [0, 0, 0],
          [2, 0, 0],
          [2, 0, 2],
        ],
        { smooth: false },
      ),
    );
    const carry = sampler.carryTo(3, true);
    const moved = new THREE.Vector3(0, 0, 0).applyMatrix4(carry);
    expect(moved.toArray()).toEqual([2, 0, 1].map((value) => expect.closeTo(value, 6)));
    const forward = new THREE.Vector3(1, 0, 0).transformDirection(carry);
    expect(forward.toArray()).toEqual([0, 0, 1].map((value) => expect.closeTo(value, 6)));
    const up = new THREE.Vector3(0, 1, 0).transformDirection(carry);
    expect(up.toArray()).toEqual([0, 1, 0].map((value) => expect.closeTo(value, 6)));
    expect(carry.determinant()).toBeCloseTo(1);
    const slide = new THREE.Vector3(1, 0, 0).transformDirection(sampler.carryTo(3, false));
    expect(slide.toArray()).toEqual([1, 0, 0].map((value) => expect.closeTo(value, 6)));
  });

  it('keeps a stable side axis through a vertical climb', () => {
    const sampler = new PathSampler(
      pathCreate(
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 3, 0],
          [2, 3, 0],
        ],
        { smooth: false },
      ),
    );
    const normals = [0.5, 2, 4.5].map((distance) => sampler.frameAt(distance).normal);
    for (const normal of normals) expect(Math.abs(normal.z)).toBeCloseTo(1);
  });
});
