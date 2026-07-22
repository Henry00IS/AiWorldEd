import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildProjectionBasis,
  projectWorldPositionToUv,
  bakeFaceUVs,
  bakeAllFacesDefaultUVs,
  resolveProjectionNormal,
  ensureUvAttribute
} from '../../src/texture/planar_uv_projector.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';

describe('planar_uv_projector', () => {
  it('should resolve floor projection to world +Y', () => {
    const normal = resolveProjectionNormal(new THREE.Vector3(0.1, 1, 0), 'floor');
    expect(normal.y).toBeCloseTo(1, 5);
    expect(normal.x).toBeCloseTo(0, 5);
  });

  it('should resolve wall projection to the dominant horizontal axis', () => {
    const normal = resolveProjectionNormal(new THREE.Vector3(0.9, 0.1, 0.2), 'wall');
    expect(Math.abs(normal.x)).toBeCloseTo(1, 5);
    expect(normal.y).toBeCloseTo(0, 5);
  });

  it('should project world X onto U for floor mapping', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(0, 1, 0), 0);
    const mapping = createDefaultFaceTextureMapping();
    const a = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    const b = projectWorldPositionToUv(new THREE.Vector3(0, 0, 0), basis, mapping);
    expect(a.u - b.u).toBeCloseTo(1, 5);
  });

  it('should bake UVs onto a box top face without throwing', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const mapping = createDefaultFaceTextureMapping();
    mapping.align = 'floor';
    expect(() => bakeFaceUVs(mesh, [4, 5], mapping)).not.toThrow();
    const uv = mesh.geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBeGreaterThan(0);
  });

  it('should create a UV attribute when missing', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    const uv = ensureUvAttribute(geometry);
    expect(uv.count).toBe(3);
  });

  it('should bake default UVs for an entire mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    bakeAllFacesDefaultUVs(mesh);
    expect(mesh.geometry.getAttribute('uv')).toBeDefined();
  });

  it('should scale UV density with scaleU', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(0, 1, 0), 0);
    const mapping = createDefaultFaceTextureMapping();
    mapping.scaleU = 0.5;
    const uv = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    expect(uv.u).toBeCloseTo(2, 5);
  });
});
