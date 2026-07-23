import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';

/**
 * Solid result UVs must be baked per coplanar face, not one projection for the whole cube.
 */
describe('Solid result UV projection', () => {
  it('creates one face map region per cube side (six coplanar groups)', () => {
    const model = new SolidModel('UvCube');
    model.addBoxBrush(2, SolidOperation.Additive);
    const maps = getFaceTextureMaps(model.getResultMesh());
    expect(maps.length).toBe(6);
    maps.forEach((entry) => {
      expect(entry.triangleIndices.length).toBe(2);
    });
  });

  it('keeps finite non-degenerate UVs on every vertex of the default cube', () => {
    const model = new SolidModel('UvFinite');
    model.addBoxBrush(2, SolidOperation.Additive);
    const uv = model.getResultMesh().geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBeGreaterThan(0);
    for (let index = 0; index < uv.count; index++) {
      const u = uv.getX(index);
      const v = uv.getY(index);
      expect(Number.isFinite(u)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(u)).toBeLessThan(100);
      expect(Math.abs(v)).toBeLessThan(100);
    }
  });

  it('gives each cube face a non-zero UV area (no collapsed projection)', () => {
    const model = new SolidModel('UvArea');
    model.addBoxBrush(2, SolidOperation.Additive);
    const mesh = model.getResultMesh();
    const uv = mesh.geometry.getAttribute('uv');
    const maps = getFaceTextureMaps(mesh);
    maps.forEach((entry) => {
      let minU = Number.POSITIVE_INFINITY;
      let maxU = Number.NEGATIVE_INFINITY;
      let minV = Number.POSITIVE_INFINITY;
      let maxV = Number.NEGATIVE_INFINITY;
      entry.triangleIndices.forEach((triangleIndex) => {
        for (let corner = 0; corner < 3; corner++) {
          const vertexIndex = triangleIndex * 3 + corner;
          minU = Math.min(minU, uv.getX(vertexIndex));
          maxU = Math.max(maxU, uv.getX(vertexIndex));
          minV = Math.min(minV, uv.getY(vertexIndex));
          maxV = Math.max(maxV, uv.getY(vertexIndex));
        }
      });
      const spanU = maxU - minU;
      const spanV = maxV - minV;
      expect(spanU + spanV).toBeGreaterThan(0.5);
      expect(spanU).toBeGreaterThan(1e-4);
      expect(spanV).toBeGreaterThan(1e-4);
    });
  });

  it('keeps authored UV scale after a CSG rebuild', () => {
    const model = new SolidModel('UvRebuild');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.setFaceMapping(0, {
      align: 'face',
      scaleU: 4,
      scaleV: 2,
      offsetU: 0.1,
      offsetV: 0.2,
      rotationDeg: 15,
      textureId: 'folder/rebuild.png'
    });
    model.markDirty();
    model.rebuild(true);
    const maps = getFaceTextureMaps(model.getResultMesh());
    const matching = maps.find(
      (entry) => entry.mapping.textureId === 'folder/rebuild.png'
    );
    expect(matching).toBeDefined();
    expect(matching!.mapping.scaleU).toBeCloseTo(4);
    expect(matching!.mapping.scaleV).toBeCloseTo(2);
    expect(matching!.mapping.offsetU).toBeCloseTo(0.1);
    expect(matching!.mapping.rotationDeg).toBeCloseTo(15);
  });
});
