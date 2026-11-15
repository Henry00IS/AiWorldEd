import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  physicsShatterCrackFacing,
  physicsShatterCrackSurface,
} from '@/modifier/stack/kinds/shatter/physics_shatter_crack_surface.js';
import type { PhysicsShatterInsideSettings } from '@/modifier/stack/kinds/shatter/physics_shatter_settings.js';

/**
 * Builds crack face settings.
 *
 * @param patch Settings to change.
 * @returns Settings.
 */
function inside(patch: Partial<PhysicsShatterInsideSettings> = {}): PhysicsShatterInsideSettings {
  return { textureId: '', projection: 'world', scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotation: 0, ...patch };
}

/** Crack normals at awkward angles. */
const NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0.3, -0.9, 0.2),
  new THREE.Vector3(-0.7071, 0.7071, 0),
  new THREE.Vector3(0.2, 0.1, -0.97),
].map((normal) => normal.normalize());

/** Points on and around a crack. */
const POINTS = [new THREE.Vector3(0.3, -1.2, 2), new THREE.Vector3(-4, 0.5, 0.25), new THREE.Vector3(1, 1, 1)];

describe('physicsShatterCrackSurface', () => {
  it('turns opposite normals the same way', () => {
    for (const normal of NORMALS)
      expect(physicsShatterCrackFacing(normal.clone().negate()).toArray()).toEqual(
        physicsShatterCrackFacing(normal).toArray(),
      );
  });

  it('gives both faces of a cut the same UVs in both projections', () => {
    for (const projection of ['world', 'box'] as const)
      for (const normal of NORMALS) {
        const settings = inside({ projection, scaleU: 0.5, offsetU: 0.25, rotation: 30 });
        const front = physicsShatterCrackSurface(normal, settings, 'stone').uv;
        const back = physicsShatterCrackSurface(normal.clone().negate(), settings, 'stone').uv;
        for (const point of POINTS) {
          const [a, b] = [front.project(point), back.project(point)];
          expect(a.u).toBeCloseTo(b.u, 9);
          expect(a.v).toBeCloseTo(b.v, 9);
        }
      }
  });

  it('lays the set metres per tile on the face, without stretching', () => {
    for (const normal of NORMALS) {
      const uv = physicsShatterCrackSurface(normal, inside({ scaleU: 0.5, scaleV: 0.5 }), '').uv;
      const along = new THREE.Vector3(0, 0, 1).cross(normal);
      if (along.lengthSq() < 1e-9) along.set(1, 0, 0);
      along.normalize();
      const across = normal.clone().cross(along);
      for (const step of [along, across]) {
        const [a, b] = [uv.project(new THREE.Vector3()), uv.project(step)];
        expect(Math.hypot(b.u - a.u, b.v - a.v)).toBeCloseTo(2, 9);
      }
    }
  });

  it('keeps the Inside Texture, or the broken brush’s texture', () => {
    expect(physicsShatterCrackSurface(NORMALS[0]!, inside({ textureId: 'rock' }), 'stone').textureId).toBe('rock');
    expect(physicsShatterCrackSurface(NORMALS[0]!, inside(), 'stone').textureId).toBe('stone');
  });
});
