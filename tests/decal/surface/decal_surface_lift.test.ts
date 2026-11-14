import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';

/**
 * Builds a crease: a floor strip facing up and a wall strip facing +X that meet
 * along the Z axis, two triangles each, with matching shading normals.
 *
 * @returns Positions, normals and the unit face normal of each triangle.
 */
function creaseTriangles(): { positions: Float32Array; normals: Float32Array; faceNormals: THREE.Vector3[] } {
  const floor = [0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0];
  const wall = [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const faceNormals = [up, up, side, side];
  const normals = new Float32Array(
    faceNormals.flatMap((normal) => [...normal.toArray(), ...normal.toArray(), ...normal.toArray()]),
  );
  return { positions: new Float32Array([...floor, ...wall]), normals, faceNormals };
}

describe('DecalSurfaceLift', () => {
  it('lifts every face at least the requested distance off its own plane', () => {
    const crease = creaseTriangles();
    const lifted = new DecalSurfaceLift().lift(crease.positions, crease.normals, 0.01);
    crease.faceNormals.forEach((normal, triangle) => {
      for (let corner = 0; corner < 3; corner++) {
        const offset = (triangle * 3 + corner) * 3;
        const before = new THREE.Vector3().fromArray(crease.positions, offset);
        const after = new THREE.Vector3().fromArray(lifted, offset);
        expect(after.sub(before).dot(normal)).toBeGreaterThanOrEqual(0.01 - 1e-6);
      }
    });
  });

  it('moves corners that shared a position to one shared position, so no gap opens at the crease', () => {
    const crease = creaseTriangles();
    const lifted = new DecalSurfaceLift().lift(crease.positions, crease.normals, 0.02);
    const liftedByOrigin = new Map<string, string>();
    for (let corner = 0; corner < crease.positions.length / 3; corner++) {
      const origin = Array.from(crease.positions.subarray(corner * 3, corner * 3 + 3)).join(',');
      const moved = Array.from(lifted.subarray(corner * 3, corner * 3 + 3)).join(',');
      const known = liftedByOrigin.get(origin);
      if (known !== undefined) expect(moved).toBe(known);
      liftedByOrigin.set(origin, moved);
    }
  });
});
