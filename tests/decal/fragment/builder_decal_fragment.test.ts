import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BuilderDecalFragment } from '@/decal/fragment/builder_decal_fragment.js';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';

/**
 * Returns a chunk holding one square of the given half size in the XZ plane.
 *
 * @param halfSize Half edge length.
 * @param normalY Y component of the corner normals, 1 for up or -1 for down.
 * @returns Chunk.
 */
function squareChunk(halfSize: number, normalY: number): SolidBrushMeshChunk {
  const h = halfSize;
  const positions = new Float32Array([-h, 0, -h, -h, 0, h, h, 0, h, -h, 0, -h, h, 0, h, h, 0, -h]);
  const normals = new Float32Array(18);
  for (let index = 1; index < 18; index += 3) normals[index] = normalY;
  return {
    positions,
    normals,
    uvs: new Float32Array(12),
    triangleCount: 2,
    vertexCount: 6,
    regions: [],
    triangleSources: [],
  };
}

/**
 * Returns a builder projecting straight down through a box of the given size.
 *
 * @param size Projector box size.
 * @param facingLimitDegrees Steepest receiving angle.
 * @returns Builder.
 */
function downwardBuilder(size: number, facingLimitDegrees: number): BuilderDecalFragment {
  const builder = new BuilderDecalFragment();
  builder.projectionSet({
    modelToProjector: new THREE.Matrix4().makeScale(size, size, size).invert(),
    travelDirection: new THREE.Vector3(0, -1, 0),
    minimumFacingCosine: Math.cos(THREE.MathUtils.degToRad(facingLimitDegrees)),
  });
  return builder;
}

/**
 * Returns the summed area of a fragment's triangles.
 *
 * @param positions Fragment positions.
 * @returns Area.
 */
function fragmentArea(positions: Float32Array): number {
  let area = 0;
  for (let base = 0; base < positions.length; base += 9) {
    const a = new THREE.Vector3().fromArray(positions, base);
    const b = new THREE.Vector3().fromArray(positions, base + 3).sub(a);
    const c = new THREE.Vector3().fromArray(positions, base + 6).sub(a);
    area += b.cross(c).length() / 2;
  }
  return area;
}

describe('BuilderDecalFragment', () => {
  it('cuts the projector footprint out of a larger surface with image coordinates spanning 0 to 1', () => {
    const fragment = downwardBuilder(2, 80).build(squareChunk(5, 1));
    expect(fragment).not.toBeNull();
    if (!fragment) return;
    expect(fragmentArea(fragment.positions)).toBeCloseTo(4, 5);
    const uvs = Array.from(fragment.uvs);
    expect(Math.min(...uvs)).toBeCloseTo(0, 6);
    expect(Math.max(...uvs)).toBeCloseTo(1, 6);
  });

  it('skips surfaces facing away from the projector', () => {
    expect(downwardBuilder(2, 80).build(squareChunk(5, -1))).toBeNull();
  });

  it('places the image top toward negative Z', () => {
    const fragment = downwardBuilder(2, 80).build(squareChunk(5, 1));
    if (!fragment) throw new Error('expected a fragment');
    for (let corner = 0; corner < fragment.triangleCount * 3; corner++) {
      const z = fragment.positions[corner * 3 + 2] ?? 0;
      expect(fragment.uvs[corner * 2 + 1]).toBeCloseTo(0.5 - z / 2, 5);
    }
  });
});
