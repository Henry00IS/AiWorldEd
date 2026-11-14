import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalStickerUnfold, type DecalStickerFrame } from '@/decal/surface/decal_sticker_unfold.js';
import { DecalSurfaceLift } from '@/decal/surface/decal_surface_lift.js';

/** A soup of triangles with one shading normal per triangle. */
interface StableSoup {
  positions: number[];
  normals: number[];
}

/**
 * Appends a triangle.
 *
 * @param soup Soup to grow.
 * @param corners Three corners.
 * @param normal Shading normal.
 */
function triangleAdd(soup: StableSoup, corners: readonly number[][], normal: readonly number[]): void {
  for (const corner of corners) {
    soup.positions.push(...corner);
    soup.normals.push(...normal);
  }
}

/**
 * Builds a floor (y = 0, facing up) meeting a front face (z = 1, facing +z) at
 * the crease from (-1, 0, 1) to (1, 0, 1). The floor's crease edge can be split
 * at given x positions, the way a seam pass adds T-junction corners there.
 *
 * @param floorSplits X positions of extra corners on the floor's crease edge.
 * @param frontSplits X positions of extra corners on the front's crease edge.
 * @returns Soup.
 */
function creaseSoup(floorSplits: readonly number[], frontSplits: readonly number[]): StableSoup {
  const soup: StableSoup = { positions: [], normals: [] };
  const floorEdge = [-1, ...floorSplits, 1];
  for (let index = 0; index + 1 < floorEdge.length; index++) {
    const a = floorEdge[index] ?? 0;
    const b = floorEdge[index + 1] ?? 0;
    triangleAdd(
      soup,
      [
        [a, 0, 1],
        [b, 0, 1],
        [0, 0, -1],
      ],
      [0, 1, 0],
    );
  }
  triangleAdd(
    soup,
    [
      [-1, 0, 1],
      [0, 0, -1],
      [-1, 0, -1],
    ],
    [0, 1, 0],
  );
  triangleAdd(
    soup,
    [
      [1, 0, 1],
      [1, 0, -1],
      [0, 0, -1],
    ],
    [0, 1, 0],
  );
  const frontEdge = [-1, ...frontSplits, 1];
  for (let index = 0; index + 1 < frontEdge.length; index++) {
    const a = frontEdge[index] ?? 0;
    const b = frontEdge[index + 1] ?? 0;
    triangleAdd(
      soup,
      [
        [a, 0, 1],
        [0, -1, 1],
        [b, 0, 1],
      ],
      [0, 0, 1],
    );
  }
  triangleAdd(
    soup,
    [
      [-1, 0, 1],
      [-1, -1, 1],
      [0, -1, 1],
    ],
    [0, 0, 1],
  );
  triangleAdd(
    soup,
    [
      [1, 0, 1],
      [0, -1, 1],
      [1, -1, 1],
    ],
    [0, 0, 1],
  );
  return soup;
}

/**
 * Reverses the triangle order of a soup.
 *
 * @param soup Soup.
 * @returns Reordered copy.
 */
function reversed(soup: StableSoup): StableSoup {
  const out: StableSoup = { positions: [], normals: [] };
  for (let triangle = soup.positions.length / 9 - 1; triangle >= 0; triangle--) {
    out.positions.push(...soup.positions.slice(triangle * 9, triangle * 9 + 9));
    out.normals.push(...soup.normals.slice(triangle * 9, triangle * 9 + 9));
  }
  return out;
}

/**
 * Returns a projector frame tilted so it sees the floor and the front face.
 *
 * @returns Frame.
 */
function tiltedFrame(): DecalStickerFrame {
  const projectorToModel = new THREE.Matrix4().compose(
    new THREE.Vector3(0.15, 0.8, 0.35),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0.2, 0)),
    new THREE.Vector3(3, 3, 3),
  );
  const travelDirection = new THREE.Vector3().setFromMatrixColumn(projectorToModel, 1).normalize().negate();
  return { modelToProjector: projectorToModel.clone().invert(), travelDirection };
}

/**
 * Unfolds a soup and returns a sampler of its image coordinates.
 *
 * @param soup Soup.
 * @returns Image coordinate at a corner position, from the first corner there.
 */
function unfolded(soup: StableSoup): (point: readonly number[]) => [number, number] {
  const positions = new Float32Array(soup.positions);
  const uvs = new Float32Array((positions.length / 3) * 2);
  new DecalStickerUnfold().apply(positions, new Float32Array(soup.normals), uvs, tiltedFrame());
  return (point) => {
    let best: [number, number] = [NaN, NaN];
    for (let corner = 0; corner < positions.length / 3; corner++) {
      const distance = Math.hypot(
        (positions[corner * 3] ?? 0) - (point[0] ?? 0),
        (positions[corner * 3 + 1] ?? 0) - (point[1] ?? 0),
        (positions[corner * 3 + 2] ?? 0) - (point[2] ?? 0),
      );
      if (distance < 1e-5) {
        best = [uvs[corner * 2] ?? 0, uvs[corner * 2 + 1] ?? 0];
        break;
      }
    }
    return best;
  };
}

/** Corners present in every variant, on both faces. */
const STABLE_PROBES = [
  [-1, 0, -1],
  [1, 0, -1],
  [0, 0, -1],
  [-1, 0, 1],
  [1, 0, 1],
  [-1, -1, 1],
  [1, -1, 1],
  [0, -1, 1],
];

/**
 * Expects two unfoldings to agree at every probe corner.
 *
 * @param a First sampler.
 * @param b Second sampler.
 */
function expectSameImage(a: ReturnType<typeof unfolded>, b: ReturnType<typeof unfolded>): void {
  for (const probe of STABLE_PROBES) {
    const [au, av] = a(probe);
    const [bu, bv] = b(probe);
    expect(Math.abs(au - bu), `u at ${probe.join(',')}`).toBeLessThan(1e-5);
    expect(Math.abs(av - bv), `v at ${probe.join(',')}`).toBeLessThan(1e-5);
  }
}

describe('sticker unfolding stability', () => {
  const base = unfolded(creaseSoup([], []));

  it('does not depend on triangle order', () => {
    expectSameImage(base, unfolded(reversed(creaseSoup([], []))));
  });

  it('does not change when a seam pass adds corners along the crease on one side only', () => {
    expectSameImage(base, unfolded(creaseSoup([0.3], [])));
    expectSameImage(base, unfolded(creaseSoup([], [-0.4, 0.2])));
  });

  it('does not change when the face the projector aims at is split differently', () => {
    expectSameImage(base, unfolded(creaseSoup([-0.7, -0.1, 0.05, 0.6], [0.5])));
  });
});

/**
 * Lifts a soup and returns a sampler of lifted corner positions keyed by their
 * unlifted position.
 *
 * @param soup Soup.
 * @returns Lifted position of the first corner at a point.
 */
function lifted(soup: StableSoup): (point: readonly number[]) => THREE.Vector3 {
  const positions = new Float32Array(soup.positions);
  const out = new DecalSurfaceLift().lift(positions, new Float32Array(soup.normals), 0.01);
  return (point) => {
    for (let corner = 0; corner < positions.length / 3; corner++) {
      const distance = Math.hypot(
        (positions[corner * 3] ?? 0) - (point[0] ?? 0),
        (positions[corner * 3 + 1] ?? 0) - (point[1] ?? 0),
        (positions[corner * 3 + 2] ?? 0) - (point[2] ?? 0),
      );
      if (distance < 1e-5) return new THREE.Vector3().fromArray(out, corner * 3);
    }
    return new THREE.Vector3(NaN, NaN, NaN);
  };
}

describe('lift stability', () => {
  it('lifts a crease corner the same whether the other side has it yet or not', () => {
    const mended = lifted(creaseSoup([0.3], [0.3]));
    const oneSided = lifted(creaseSoup([0.3], []));
    const plain = lifted(creaseSoup([], []));
    for (const probe of [[0.3, 0, 1], ...STABLE_PROBES]) {
      expect(oneSided(probe).distanceTo(mended(probe)), `at ${probe.join(',')}`).toBeLessThan(1e-6);
    }
    for (const probe of STABLE_PROBES) expect(plain(probe).distanceTo(mended(probe))).toBeLessThan(1e-6);
  });
});
