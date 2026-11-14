import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import { DecalStickerUnfold } from '@/decal/surface/decal_sticker_unfold.js';
import { decalTestLevelCreate, decalTestProjector, decalTestServices } from '../decal_test_fixture.js';

/** Box size of the corner projector. */
const DECAL_CORNER_SIZE = 2;

/**
 * Draws a surface mesh decal over the corner where the wall meets the floor,
 * tilted 45 degrees so both faces are steep to it, and returns its triangles.
 *
 * @param unfoldSticker Sticker unfolding switch.
 * @returns Positions and image coordinates.
 */
function cornerDecal(unfoldSticker: boolean): { positions: ArrayLike<number>; uvs: ArrayLike<number> } {
  const level = decalTestLevelCreate();
  const projector = decalTestProjector('surfaceMesh', { unfoldSticker, liftDistance: 0.0005 });
  projector.position.set(-1.5, 0.5, 0);
  projector.rotation.z = -Math.PI / 4;
  projector.scale.setScalar(DECAL_CORNER_SIZE);
  level.world.add(projector);
  level.world.updateMatrixWorld(true);
  const layer = new DecalModelLayer(
    level.model.getResultMesh(),
    level.model.getCollisionChunkSource(),
    decalTestServices(),
  );
  layer.sync([projector], 1000, decalLayerSyncReportEmpty());
  const geometry = layer.presentationOf(projector)?.mesh.geometry;
  return {
    positions: geometry?.getAttribute('position')?.array ?? [],
    uvs: geometry?.getAttribute('uv')?.array ?? [],
  };
}

/**
 * Returns, for every triangle edge, image length in meters over surface length.
 *
 * @param decal Decal triangles.
 * @param decal.positions Positions.
 * @param decal.uvs Image coordinates.
 * @returns Ratios.
 */
function edgeRatios(decal: { positions: ArrayLike<number>; uvs: ArrayLike<number> }): number[] {
  const ratios: number[] = [];
  for (let corner = 0; corner < decal.positions.length / 3; corner++) {
    const next = corner - (corner % 3) + ((corner + 1) % 3);
    const surface = new THREE.Vector3()
      .fromArray(decal.positions, corner * 3)
      .distanceTo(new THREE.Vector3().fromArray(decal.positions, next * 3));
    if (surface < 1e-3) continue;
    const du = ((decal.uvs[corner * 2] ?? 0) - (decal.uvs[next * 2] ?? 0)) * DECAL_CORNER_SIZE;
    const dv = ((decal.uvs[corner * 2 + 1] ?? 0) - (decal.uvs[next * 2 + 1] ?? 0)) * DECAL_CORNER_SIZE;
    ratios.push(Math.hypot(du, dv) / surface);
  }
  return ratios;
}

describe('sticker unfolding', () => {
  it('keeps true lengths on steep faces where planar projection squeezes them', () => {
    const planar = edgeRatios(cornerDecal(false));
    expect(Math.min(...planar)).toBeLessThan(0.8);
    const unfolded = edgeRatios(cornerDecal(true));
    expect(unfolded.length).toBeGreaterThan(0);
    for (const ratio of unfolded) expect(ratio).toBeCloseTo(1, 2);
  });

  it('gives corners on the crease the same image coordinates on both faces', () => {
    const decal = cornerDecal(true);
    const uvByCorner = new Map<string, [number, number]>();
    let shared = 0;
    for (let corner = 0; corner < decal.positions.length / 3; corner++) {
      const key = [0, 1, 2].map((axis) => Math.round((decal.positions[corner * 3 + axis] ?? 0) * 1e3)).join(',');
      const uv: [number, number] = [decal.uvs[corner * 2] ?? 0, decal.uvs[corner * 2 + 1] ?? 0];
      const known = uvByCorner.get(key);
      if (!known) uvByCorner.set(key, uv);
      else {
        shared++;
        expect(known[0]).toBeCloseTo(uv[0], 4);
        expect(known[1]).toBeCloseTo(uv[1], 4);
      }
    }
    expect(shared).toBeGreaterThan(0);
  });

  it('turns a lone face to the projector without changing its shape', () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 0, 0, 1, 1]);
    const normals = new Float32Array(9);
    const normal = new THREE.Vector3(1, -1, 1).normalize().negate();
    for (let corner = 0; corner < 3; corner++) normal.toArray(normals, corner * 3);
    const uvs = new Float32Array(6);
    new DecalStickerUnfold().apply(positions, normals, uvs, {
      modelToProjector: new THREE.Matrix4(),
      travelDirection: new THREE.Vector3(0, -1, 0),
    });
    const side = (first: number, second: number) =>
      Math.hypot(
        (uvs[first * 2] ?? 0) - (uvs[second * 2] ?? 0),
        (uvs[first * 2 + 1] ?? 0) - (uvs[second * 2 + 1] ?? 0),
      );
    expect(side(0, 1)).toBeCloseTo(Math.SQRT2, 5);
    expect(side(1, 2)).toBeCloseTo(Math.SQRT2, 5);
    expect(side(2, 0)).toBeCloseTo(Math.SQRT2, 5);
  });
});
