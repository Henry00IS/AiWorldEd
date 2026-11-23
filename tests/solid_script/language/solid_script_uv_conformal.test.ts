import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptUvConformal } from '@/solid_script/language/solid_script_uv_conformal.js';
import {
  solidScriptUvUnfold,
  type SolidScriptUnfoldFace,
  type SolidScriptUnfoldLink,
} from '@/solid_script/language/solid_script_uv_unfold.js';

/**
 * Builds a face from corners, turned so its corner order faces away from the
 * origin.
 *
 * @param corners Corner coordinates.
 * @returns Face.
 */
function face(corners: [number, number, number][]): SolidScriptUnfoldFace {
  const points = corners.map((corner) => new THREE.Vector3(...corner));
  const normal = points[1]!.clone().sub(points[0]!).cross(points[2]!.clone().sub(points[0]!)).normalize();
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  if (normal.dot(center) < 0) return { corners: [...points].reverse(), normal: normal.negate() };
  return { corners: points, normal };
}

/**
 * Links every pair of faces that share two corners.
 *
 * @param faces Faces.
 * @returns Links.
 */
function links(faces: readonly SolidScriptUnfoldFace[]): SolidScriptUnfoldLink[] {
  return faces.flatMap((a, at) =>
    faces.slice(at + 1).flatMap((b, offset) => {
      const shared = a.corners.filter((corner) => b.corners.some((other) => other.distanceTo(corner) < 1e-9));
      return shared.length === 2 ? [{ a: at, b: at + 1 + offset, p: shared[0]!, q: shared[1]! }] : [];
    }),
  );
}

/**
 * The top and four sides of a cube of size 2: a curved island no unfolding lays
 * flat without a crack.
 */
const CAP = [
  face([
    [-1, 1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [-1, 1, 1],
  ]),
  face([
    [1, -1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [1, -1, 1],
  ]),
  face([
    [-1, -1, -1],
    [-1, 1, -1],
    [-1, 1, 1],
    [-1, -1, 1],
  ]),
  face([
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ]),
  face([
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
  ]),
];

/**
 * Largest gap between the UVs two linked faces give a shared corner.
 *
 * @param faces Faces.
 * @param uvs UVs per face.
 * @returns Largest gap.
 */
function crack(faces: readonly SolidScriptUnfoldFace[], uvs: [number, number][][]): number {
  const at = (index: number, point: THREE.Vector3) =>
    uvs[index]![faces[index]!.corners.findIndex((corner) => corner.distanceTo(point) < 1e-9)]!;
  return Math.max(
    ...links(faces).flatMap((link) =>
      [link.p, link.q].map((end) => {
        const [u0, v0] = at(link.a, end);
        const [u1, v1] = at(link.b, end);
        return Math.hypot(u1 - u0, v1 - v0);
      }),
    ),
  );
}

/**
 * Twice the signed area of each fan triangle of every face.
 *
 * @param uvs UVs per face.
 * @returns Areas.
 */
function areas(uvs: [number, number][][]): number[] {
  return uvs.flatMap((loop) =>
    loop.slice(2).map((_, at) => {
      const [[u0, v0], [u1, v1], [u2, v2]] = [loop[0]!, loop[at + 1]!, loop[at + 2]!];
      return (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    }),
  );
}

describe('solidScriptUvConformal', () => {
  it('keeps every joined corner joined on a curved island, where unfolding leaves a crack', () => {
    expect(crack(CAP, solidScriptUvUnfold(CAP, links(CAP), 1))).toBeGreaterThan(0.1);
    expect(crack(CAP, solidScriptUvConformal(CAP, links(CAP), 1))).toBeLessThan(1e-9);
  });

  it('turns no triangle over', () => {
    const signs = areas(solidScriptUvConformal(CAP, links(CAP), 1)).map(Math.sign);
    expect(new Set(signs).size).toBe(1);
    expect(signs[0]).not.toBe(0);
  });

  it('keeps a flat island true to size, as unfolding does', () => {
    const strip = [
      face([
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ]),
      face([
        [1, 0, 1],
        [3, 0, 1],
        [3, 1, 1],
        [1, 1, 1],
      ]),
    ];
    const conformal = solidScriptUvConformal(strip, links(strip), 1);
    const unfolded = solidScriptUvUnfold(strip, links(strip), 1);
    conformal.flat().forEach(([u, v], index) => {
      expect(u).toBeCloseTo(unfolded.flat()[index]![0], 6);
      expect(v).toBeCloseTo(unfolded.flat()[index]![1], 6);
    });
  });

  it('keeps near right angles on a gently curved dome, every corner joined', () => {
    const height = (x: number, z: number) => 0.08 * (x * x + z * z);
    const dome = Array.from({ length: 16 }, (_, at) => {
      const [x, z] = [(at % 4) - 2, Math.floor(at / 4) - 2];
      return face(
        [
          [x, z],
          [x, z + 1],
          [x + 1, z + 1],
          [x + 1, z],
        ].map(([u = 0, w = 0]): [number, number, number] => [u, height(u, w) + 3, w]),
      );
    });
    expect(crack(dome, solidScriptUvUnfold(dome, links(dome), 1))).toBeGreaterThan(1e-3);
    const uvs = solidScriptUvConformal(dome, links(dome), 1);
    expect(crack(dome, uvs)).toBeLessThan(1e-9);
    for (const loop of uvs)
      loop.forEach(([u, v], at) => {
        const [pu, pv] = loop[(at + 3) % 4]!;
        const [nu, nv] = loop[(at + 1) % 4]!;
        const turn = Math.acos(
          ((pu - u) * (nu - u) + (pv - v) * (nv - v)) / (Math.hypot(pu - u, pv - v) * Math.hypot(nu - u, nv - v)),
        );
        expect(Math.abs(turn - Math.PI / 2)).toBeLessThan(0.12);
      });
  });
});
