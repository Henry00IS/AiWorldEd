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
} from '@/texture/uv/planar_uv_projector.js';
import { createFaceTextureMappingFromTrs } from '@/texture/uv/face_texture_mapping.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';

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
    const mapping = createFaceTextureMappingFromTrs('t', new THREE.Vector3(0, 1, 0), {
      scaleU: 1,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      rotationDeg: 0,
    });
    const a = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    const b = projectWorldPositionToUv(new THREE.Vector3(0, 0, 0), basis, mapping);
    expect(a.u - b.u).toBeCloseTo(1, 5);
  });

  it('should use horizontal U and vertical V on walls', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(1, 0, 0), 0);
    expect(Math.abs(basis.uAxis.y)).toBeLessThan(0.01);
    expect(basis.vAxis.y).toBeCloseTo(1, 5);
    const mapping = createFaceTextureMappingFromTrs('t', new THREE.Vector3(1, 0, 0), {
      scaleU: 1,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      rotationDeg: 0,
    });
    const bottom = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    const top = projectWorldPositionToUv(new THREE.Vector3(1, 1, 0), basis, mapping);
    expect(top.v - bottom.v).toBeCloseTo(1, 4);
    const alongWall = projectWorldPositionToUv(new THREE.Vector3(1, 0, 1), basis, mapping);
    expect(Math.abs(alongWall.u - bottom.u) + Math.abs(alongWall.v - bottom.v)).toBeGreaterThan(0.5);
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
    const mapping = createFaceTextureMappingFromTrs(
      't',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 },
      'floor',
    );
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
      if (Math.abs(v - worldY) > 0.05) continue;
      wallSamples.push({ v, worldY });
    }
    expect(wallSamples.length).toBeGreaterThan(0);
    const bottom = wallSamples.filter((entry) => entry.worldY < 0.1);
    const top = wallSamples.filter((entry) => entry.worldY > 0.9);
    expect(bottom.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    const avgBottomV = bottom.reduce((sum, entry) => sum + entry.v, 0) / bottom.length;
    const avgTopV = top.reduce((sum, entry) => sum + entry.v, 0) / top.length;
    expect(avgTopV - avgBottomV).toBeCloseTo(1, 4);
  });

  it('should create a UV attribute when missing', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
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
    const topRim = collectVerticesNear(position, uv, (x, y, z) => Math.abs(y - 0.5) < 1e-3 && Math.hypot(x, z) > 0.4);
    expect(topRim.length).toBeGreaterThan(4);
    const uniqueUvKeys = new Set(topRim.map((entry) => `${entry.u.toFixed(4)},${entry.v.toFixed(4)}`));
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
        v: uv.getY(i),
      });
    }
    expect(samples.length).toBeGreaterThan(4);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      expect(sample.u).toBeCloseTo(sample.x, 3);
    }
    const uValues = samples.map((sample) => sample.u);
    const uSpan = Math.max(...uValues) - Math.min(...uValues);
    expect(uSpan).toBeGreaterThan(10);
  });

  it('should scale UV density with scaleU (meters per tile)', () => {
    const basis = buildProjectionBasis(new THREE.Vector3(0, 1, 0), 0);
    const mapping = createFaceTextureMappingFromTrs('t', new THREE.Vector3(0, 1, 0), {
      scaleU: 0.5,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      rotationDeg: 0,
    });
    const uv = projectWorldPositionToUv(new THREE.Vector3(1, 0, 0), basis, mapping);
    expect(uv.u).toBeCloseTo(2, 5);
  });

  it('should keep per-face corner vertices indexed and de-index shared orientations', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    expect(mesh.geometry.getIndex()).not.toBeNull();
    ensureUniqueTriangleVertices(mesh);
    expect(mesh.geometry.getIndex()).not.toBeNull();
    expect(mesh.geometry.getAttribute('position').count).toBe(document.getTopology().getHalfEdgeCount());
    const shared = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    ensureUniqueTriangleVertices(shared);
    expect(shared.geometry.getIndex()).toBeNull();
  });

  it('should keep cylinder side UV aspect matching world aspect (no squash)', () => {
    const segments = 8;
    const radius = 1;
    const height = 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments));
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
      expect(ranges[i]!.minU).toBeGreaterThanOrEqual(ranges[i - 1]!.maxU - 1e-3);
    }
    const totalSpan = ranges[ranges.length - 1]!.maxU - ranges[0]!.minU;
    const sideLength = 2 * Math.sin(Math.PI / segments);
    expect(totalSpan).toBeCloseTo(segments * sideLength, 2);
  });
});

/**
 * Collects UV samples for vertices matching a predicate.
 *
 * @param position Position attribute.
 * @param uv UV attribute.
 * @param predicate Local vertex filter.
 * @returns Matching UV samples.
 */
function collectVerticesNear(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: THREE.BufferAttribute,
  predicate: (x: number, y: number, z: number) => boolean,
): Array<{ u: number; v: number }> {
  const result: Array<{ u: number; v: number }> = [];
  for (let i = 0; i < position.count; i++) {
    if (!predicate(position.getX(i), position.getY(i), position.getZ(i))) continue;
    result.push({ u: uv.getX(i), v: uv.getY(i) });
  }
  return result;
}

/**
 * Measures UV aspect of each cylinder side panel.
 *
 * @param mesh Initialized cylinder mesh.
 * @param sideLength World chord length of one side.
 * @param height World height.
 * @returns Aspect ratios (UV span U / UV span V) * (height / sideLength).
 */
function measureCylinderSideAspectRatios(mesh: THREE.Mesh, sideLength: number, height: number): number[] {
  const maps = (mesh.userData['faceTextureMaps'] ?? []) as Array<{ triangleIndices: number[] }>;
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  const position = mesh.geometry.getAttribute('position');
  const ratios: number[] = [];
  maps.forEach((entry) => {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    entry.triangleIndices.forEach((triangleIndex) => {
      for (let corner = 0; corner < 3; corner++) {
        const vi = triangleIndex * 3 + corner;
        minY = Math.min(minY, position.getY(vi));
        maxY = Math.max(maxY, position.getY(vi));
        minU = Math.min(minU, uv.getX(vi));
        maxU = Math.max(maxU, uv.getX(vi));
        minV = Math.min(minV, uv.getY(vi));
        maxV = Math.max(maxV, uv.getY(vi));
      }
    });
    const worldHeight = maxY - minY;
    if (worldHeight < height * 0.5) return;
    const spanU = maxU - minU;
    const spanV = maxV - minV;
    if (spanU < 1e-6 || spanV < 1e-6) return;
    ratios.push((spanU / spanV) * (height / sideLength));
  });
  return ratios;
}

/**
 * Measures U ranges of cylinder side panels.
 *
 * @param mesh Initialized cylinder mesh.
 * @returns U min/max per side panel.
 */
function measureCylinderSideURanges(mesh: THREE.Mesh): Array<{ minU: number; maxU: number }> {
  const maps = (mesh.userData['faceTextureMaps'] ?? []) as Array<{ triangleIndices: number[] }>;
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  const position = mesh.geometry.getAttribute('position');
  const ranges: Array<{ minU: number; maxU: number }> = [];
  maps.forEach((entry) => {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    entry.triangleIndices.forEach((triangleIndex) => {
      for (let corner = 0; corner < 3; corner++) {
        const vi = triangleIndex * 3 + corner;
        minY = Math.min(minY, position.getY(vi));
        maxY = Math.max(maxY, position.getY(vi));
        minU = Math.min(minU, uv.getX(vi));
        maxU = Math.max(maxU, uv.getX(vi));
      }
    });
    if (maxY - minY < 0.5) return;
    ranges.push({ minU, maxU });
  });
  return ranges;
}
