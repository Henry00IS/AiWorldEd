import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildProjectionBasis,
  projectWorldPositionToUv,
  bakeFaceUVs,
  bakeAllFacesDefaultUVs,
  resolveProjectionNormal,
  ensureUvAttribute,
  ensureUniqueTriangleVertices,
  computeRegionWorldNormal
} from '../../src/texture/planar_uv_projector.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { initializeMeshTextureUVs } from '../../src/texture/face_texture_applier.js';
import { TerrainGenerator } from '../../src/terrain/terrain_generator.js';

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

  it('should use true face normal in auto mode (face-plane projection)', () => {
    const diagonal = new THREE.Vector3(1, 0, 1).normalize();
    const normal = resolveProjectionNormal(diagonal, 'auto');
    expect(normal.x).toBeCloseTo(diagonal.x, 5);
    expect(normal.z).toBeCloseTo(diagonal.z, 5);
  });

  it('should not world-axis-snap near-vertical faces in auto mode', () => {
    const tilted = new THREE.Vector3(0.05, 0.99, 0.05).normalize();
    const normal = resolveProjectionNormal(tilted, 'auto');
    expect(normal.x).toBeCloseTo(tilted.x, 5);
    expect(normal.y).toBeCloseTo(tilted.y, 5);
    expect(normal.z).toBeCloseTo(tilted.z, 5);
  });

  it('should project world X onto U for floor mapping', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(0, 1, 0), 0);
    const mapping = createDefaultFaceTextureMapping();
    const a = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    const b = projectWorldPositionToUv(new THREE.Vector3(0, 0, 0), basis, mapping);
    expect(a.u - b.u).toBeCloseTo(1, 5);
  });

  it('should use horizontal U and vertical V on walls', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(1, 0, 0), 0);
    expect(Math.abs(basis.uAxis.y)).toBeLessThan(0.01);
    expect(basis.vAxis.y).toBeCloseTo(1, 5);
    const mapping = createDefaultFaceTextureMapping();
    const bottom = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    const top = projectWorldPositionToUv(new THREE.Vector3(1, 1, 0), basis, mapping);
    expect(top.v - bottom.v).toBeCloseTo(1, 5);
    const alongWall = projectWorldPositionToUv(new THREE.Vector3(1, 0, 1), basis, mapping);
    expect(Math.abs(alongWall.u - bottom.u)).toBeCloseTo(1, 5);
  });

  it('should keep a right-handed basis (U × V aligns with normal)', () => {
    const normal = new THREE.Vector3(0, 0, 1);
    const basis = buildProjectionBasis(normal, 0);
    const crossed = new THREE.Vector3().crossVectors(basis.uAxis, basis.vAxis);
    expect(crossed.dot(basis.normal)).toBeGreaterThan(0.99);
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

  it('should map unit cube side faces with vertical V spanning height', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const position = mesh.geometry.getAttribute('position');
    const wallSamples: Array<{ v: number; worldY: number }> = [];
    for (let i = 0; i < position.count; i++) {
      const localY = position.getY(i);
      const worldY = localY + mesh.position.y;
      const v = uv.getY(i);
      // Wall projection uses V ≈ world Y; floor/ceiling verts do not.
      if (Math.abs(v - worldY) > 0.05) continue;
      wallSamples.push({ v, worldY });
    }
    expect(wallSamples.length).toBeGreaterThan(0);
    const bottom = wallSamples.filter((entry) => entry.worldY < 0.1);
    const top = wallSamples.filter((entry) => entry.worldY > 0.9);
    expect(bottom.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    const avgBottomV =
      bottom.reduce((sum, entry) => sum + entry.v, 0) / bottom.length;
    const avgTopV = top.reduce((sum, entry) => sum + entry.v, 0) / top.length;
    expect(avgTopV - avgBottomV).toBeCloseTo(1, 4);
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

  it('should de-index shared-vertex geometry before multi-region bake', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    expect(mesh.geometry.getIndex()).not.toBeNull();
    bakeAllFacesDefaultUVs(mesh);
    expect(mesh.geometry.getIndex()).toBeNull();
    expect(mesh.geometry.getAttribute('uv')).toBeDefined();
  });

  it('should give cylinder side vertices distinct UVs at shared rim positions', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const position = mesh.geometry.getAttribute('position');
    const topRim = collectVerticesNear(
      position,
      uv,
      (x, y, z) => Math.abs(y - 0.5) < 1e-3 && Math.hypot(x, z) > 0.4
    );
    expect(topRim.length).toBeGreaterThan(4);
    const uniqueUvKeys = new Set(
      topRim.map((entry) => `${entry.u.toFixed(4)},${entry.v.toFixed(4)}`)
    );
    expect(uniqueUvKeys.size).toBeGreaterThan(1);
  });

  it('should project terrain with continuous floor UVs from world XZ', () => {
    const terrain = new TerrainGenerator().createTerrain(20, 20, 8, 2, 1);
    const uv = terrain.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const position = terrain.geometry.getAttribute('position');
    expect(uv).toBeDefined();
    const samples: Array<{ x: number; z: number; u: number; v: number }> = [];
    for (let i = 0; i < position.count; i += 3) {
      samples.push({
        x: position.getX(i),
        z: position.getZ(i),
        u: uv.getX(i),
        v: uv.getY(i)
      });
    }
    expect(samples.length).toBeGreaterThan(4);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      expect(sample.u).toBeCloseTo(sample.x, 3);
    }
    const uValues = samples.map((sample) => sample.u);
    const uSpan = Math.max(...uValues) - Math.min(...uValues);
    expect(uSpan).toBeGreaterThan(10);
  });

  it('should scale UV density with scaleU', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(0, 1, 0), 0);
    const mapping = createDefaultFaceTextureMapping();
    mapping.scaleU = 0.5;
    const uv = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    expect(uv.u).toBeCloseTo(2, 5);
  });

  it('should convert indexed meshes via ensureUniqueTriangleVertices', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 2, 2));
    expect(mesh.geometry.getIndex()).not.toBeNull();
    ensureUniqueTriangleVertices(mesh);
    expect(mesh.geometry.getIndex()).toBeNull();
    expect(mesh.geometry.getAttribute('position').count).toBe(24);
  });

  it('should keep cylinder side UV aspect matching world aspect (no squash)', () => {
    const segments = 8;
    const radius = 1;
    const height = 2;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, segments)
    );
    mesh.position.set(0, height / 2, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const sideLength = 2 * Math.sin(Math.PI / segments) * radius;
    const aspectRatios = measureCylinderSideAspectRatios(mesh, sideLength, height);
    expect(aspectRatios.length).toBe(segments);
    aspectRatios.forEach((ratio) => {
      expect(ratio).toBeCloseTo(1, 3);
    });
  });

  it('should unwrap cylinder sides into sequential non-overlapping U ranges', () => {
    const segments = 8;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, segments));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const ranges = measureCylinderSideURanges(mesh);
    expect(ranges.length).toBe(segments);
    ranges.sort((a, b) => a.minU - b.minU);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].minU).toBeGreaterThanOrEqual(ranges[i - 1].maxU - 1e-3);
    }
    const totalSpan = ranges[ranges.length - 1].maxU - ranges[0].minU;
    const sideLength = 2 * Math.sin(Math.PI / segments);
    expect(totalSpan).toBeCloseTo(segments * sideLength, 2);
  });
});

/**
 * Collects UV samples for vertices matching a predicate.
 * @param position Position attribute.
 * @param uv UV attribute.
 * @param match Local-space vertex filter.
 * @returns Matching UV samples.
 */
function collectVerticesNear(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: THREE.BufferAttribute,
  match: (x: number, y: number, z: number) => boolean
): Array<{ u: number; v: number }> {
  const results: Array<{ u: number; v: number }> = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (!match(x, y, z)) continue;
    results.push({ u: uv.getX(i), v: uv.getY(i) });
  }
  return results;
}

/**
 * Measures UV/world aspect ratio for each cylinder side region.
 * Ratio of 1 means no squash in U relative to physical chord width.
 * @param mesh Initialized cylinder mesh.
 * @param sideLength Physical chord length of one side.
 * @param height Physical side height.
 * @returns One aspect ratio per side face.
 */
function measureCylinderSideAspectRatios(
  mesh: THREE.Mesh,
  sideLength: number,
  height: number
): number[] {
  const entries = getFaceTextureMaps(mesh);
  const ratios: number[] = [];
  entries.forEach((entry) => {
    const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
    if (Math.abs(normal.y) > 0.35) return;
    const range = measureRegionUvRange(mesh, entry.triangleIndices);
    const uvAspect = range.uSpan / Math.max(range.vSpan, 1e-9);
    const worldAspect = sideLength / height;
    ratios.push(uvAspect / worldAspect);
  });
  return ratios;
}

/**
 * Collects U min/max for each cylinder side region.
 * @param mesh Initialized cylinder mesh.
 * @returns U ranges for side faces.
 */
function measureCylinderSideURanges(
  mesh: THREE.Mesh
): Array<{ minU: number; maxU: number }> {
  const entries = getFaceTextureMaps(mesh);
  const ranges: Array<{ minU: number; maxU: number }> = [];
  entries.forEach((entry) => {
    const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
    if (Math.abs(normal.y) > 0.35) return;
    const range = measureRegionUvRange(mesh, entry.triangleIndices);
    ranges.push({ minU: range.minU, maxU: range.maxU });
  });
  return ranges;
}

/**
 * Reads UV extents for the vertices of a triangle region.
 * @param mesh Mesh with baked UVs.
 * @param triangleIndices Region triangles.
 * @returns U/V span and min/max U.
 */
function measureRegionUvRange(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): { minU: number; maxU: number; uSpan: number; vSpan: number } {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  const index = mesh.geometry.getIndex();
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index
        ? index.getX(faceIndex * 3 + corner)
        : faceIndex * 3 + corner;
      const u = uv.getX(vertexIndex);
      const v = uv.getY(vertexIndex);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  });
  return {
    minU,
    maxU,
    uSpan: maxU - minU,
    vSpan: maxV - minV
  };
}
