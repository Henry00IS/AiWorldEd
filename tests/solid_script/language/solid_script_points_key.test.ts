import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  solidScriptPointsKey,
  solidScriptPointsKeyCoordinate,
  solidScriptPointsKeyExact,
} from '@/solid_script/language/solid_script_points_key.js';

/**
 * A small seeded random source, so a failure can be repeated.
 *
 * @param seed Start value.
 * @returns Function giving numbers from 0 up to 1.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Expects the quick text of a coordinate to equal the exact one.
 *
 * @param value Coordinate.
 */
function expectSame(value: number): void {
  expect(solidScriptPointsKeyCoordinate(value), String(value)).toBe(solidScriptPointsKeyExact(value));
}

describe('SolidScript corner point keys', () => {
  it('writes two coordinates the same exactly when toFixed(6) writes them the same', () => {
    const values = [0, -0, 1e-9, -1e-9, 0.5e-6, -0.5e-6, 1.25, -1.25, 0.1 + 0.2, 1e9 - 1e-7, 1e9, -1e9, 1e21, 1e300];
    for (let first = 0; first < values.length; first++)
      for (let second = 0; second < values.length; second++) {
        const a = values[first]!;
        const b = values[second]!;
        const sameFixed = a.toFixed(6) === b.toFixed(6);
        expect(solidScriptPointsKeyCoordinate(a) === solidScriptPointsKeyCoordinate(b), `${a} ${b}`).toBe(sameFixed);
      }
  });

  it('matches the exact rounding on many random coordinates at every scale', () => {
    const random = seededRandom(7);
    for (let index = 0; index < 200_000; index++) {
      const scale = 10 ** Math.floor(random() * 16 - 7);
      expectSame((random() * 2 - 1) * scale);
    }
  });

  it('matches the exact rounding right next to every kind of half millionth', () => {
    const random = seededRandom(11);
    for (let index = 0; index < 50_000; index++) {
      const millionths = Math.floor(random() * 10 ** Math.floor(random() * 14));
      const half = (millionths + 0.5) / 1e6;
      for (const value of [half, -half, half + Number.EPSILON * half, half - Number.EPSILON * half]) expectSame(value);
    }
  });

  it('keeps special numbers apart and never splits a key inside a coordinate', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expectSame(value);
    const key = solidScriptPointsKey([new THREE.Vector3(1, -2, 0.0000004), new THREE.Vector3(1e22, 0, 0)]);
    expect(key.split(';').filter((part) => part !== '')).toHaveLength(2);
    expect(key.split(';')[0]?.split(',')).toEqual(['1000000', '-2000000', '0']);
  });

  it('gives the same key to corners that differ only below a millionth', () => {
    const corners = [new THREE.Vector3(1, 2, 3), new THREE.Vector3(-1, 0.5, 0.25)];
    const nudged = corners.map((corner) => corner.clone().addScalar(1e-9));
    expect(solidScriptPointsKey(nudged)).toBe(solidScriptPointsKey(corners));
    expect(solidScriptPointsKey(corners.map((corner) => corner.clone().addScalar(1e-5)))).not.toBe(
      solidScriptPointsKey(corners),
    );
  });
});
