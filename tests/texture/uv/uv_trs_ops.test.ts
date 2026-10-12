import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  applyAlignToTargets,
  applyPartialTrsToTargets,
  applyRelativeTrsToTargets,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes,
  getCommonTrsFieldState,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { readMappingTrs } from '@/texture/uv/uv_trs_ops.js';
import { isAlignCompatibleWithFace } from '@/texture/uv/uv_trs_ops.js';
import { createFaceTextureMappingFromTrs, getFaceTextureMappingTrs } from '@/texture/uv/face_texture_mapping.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

describe('UV TRS ops and smart align', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('marks floor/ceiling incompatible with pure walls', () => {
    const wall = new THREE.Vector3(0, 0, 1);
    expect(isAlignCompatibleWithFace(wall, 'floor')).toBe(false);
    expect(isAlignCompatibleWithFace(wall, 'ceiling')).toBe(false);
    expect(isAlignCompatibleWithFace(wall, 'wall')).toBe(true);
  });

  it('marks wall incompatible with pure floors', () => {
    const floor = new THREE.Vector3(0, 1, 0);
    expect(isAlignCompatibleWithFace(floor, 'wall')).toBe(false);
    expect(isAlignCompatibleWithFace(floor, 'floor')).toBe(true);
    expect(isAlignCompatibleWithFace(floor, 'ceiling')).toBe(true);
  });

  it('does not collapse wall UVs when ceiling align is pressed', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(mesh);
    const zFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(zFace).toBeDefined();
    const before = zFace!.mapping.uv.clone();
    const targets = buildTargetsFromFaceSelection(zFace!.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })));
    const changed = applyAlignToTargets(targets, 'ceiling');
    expect(changed).toBe(0);
    const after = getFaceTextureMaps(mesh).find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(after!.mapping.uv.equals(before, 1e-6)).toBe(true);
    const span = measureRegionUvSpans(mesh, after!.triangleIndices);
    expect(span.spanU).toBeGreaterThan(0.5);
    expect(span.spanV).toBeGreaterThan(0.5);
  });

  it('round-trips negative U scale as texture mirror and inverts projected U', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const positive = createFaceTextureMappingFromTrs(
      DEFAULT_CHECKER_TEXTURE_ID,
      normal,
      { scaleU: 2, scaleV: 2, offsetU: 0.25, offsetV: -0.5, rotationDeg: 0 },
      'face',
    );
    const mirrored = createFaceTextureMappingFromTrs(
      DEFAULT_CHECKER_TEXTURE_ID,
      normal,
      { scaleU: -2, scaleV: 2, offsetU: 0.25, offsetV: -0.5, rotationDeg: 0 },
      'face',
    );
    const readBack = getFaceTextureMappingTrs(mirrored, normal);
    expect(readBack.scaleU).toBeCloseTo(-2, 4);
    expect(readBack.scaleV).toBeCloseTo(2, 4);
    expect(readBack.offsetU).toBeCloseTo(0.25, 4);
    expect(readBack.offsetV).toBeCloseTo(-0.5, 4);
    const sample = new THREE.Vector3(1, 0, 0.5);
    const positiveUv = positive.uv.project(sample);
    const mirroredUv = mirrored.uv.project(sample);
    expect(mirroredUv.u).toBeCloseTo(-positiveUv.u, 4);
    expect(mirroredUv.v).toBeCloseTo(positiveUv.v, 4);
  });

  it('keeps mirror when applying partial negative scale through UV ops', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(mesh);
    const floor = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.y > 0.9;
    });
    expect(floor).toBeDefined();
    const targets = buildTargetsFromFaceSelection(floor!.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })));
    applyPartialTrsToTargets(targets, { scaleU: -1.5, scaleV: 2 });
    const after = getFaceTextureMaps(mesh).find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.y > 0.9;
    });
    const normal = computeRegionWorldNormal(mesh, after!.triangleIndices);
    const trs = readMappingTrs(after!.mapping, normal);
    expect(trs.scaleU).toBeCloseTo(-1.5, 4);
    expect(trs.scaleV).toBeCloseTo(2, 4);
  });

  it('doubles scale independently on multi-selected faces', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(mesh);
    const first = maps[0]!;
    const second = maps[1]!;
    applyPartialTrsToTargets(
      [{ mesh, triangleIndices: first.triangleIndices.slice(), previousMapping: first.mapping }],
      { scaleU: 1 },
    );
    applyPartialTrsToTargets(
      [{ mesh, triangleIndices: second.triangleIndices.slice(), previousMapping: second.mapping }],
      { scaleU: 3 },
    );
    const multi = [
      ...buildTargetsFromFaceSelection(first.triangleIndices.map((faceIndex) => ({ mesh, faceIndex }))),
      ...buildTargetsFromFaceSelection(second.triangleIndices.map((faceIndex) => ({ mesh, faceIndex }))),
    ];
    applyRelativeTrsToTargets(multi, { kind: 'multiplyScale', axis: 'u', factor: 2 });
    const after = getFaceTextureMaps(mesh);
    const afterFirst = after.find((entry) => entry.triangleIndices[0] === first.triangleIndices[0])!;
    const afterSecond = after.find((entry) => entry.triangleIndices[0] === second.triangleIndices[0])!;
    const n0 = computeRegionWorldNormal(mesh, afterFirst.triangleIndices);
    const n1 = computeRegionWorldNormal(mesh, afterSecond.triangleIndices);
    expect(readMappingTrs(afterFirst.mapping, n0).scaleU).toBeCloseTo(2, 4);
    expect(readMappingTrs(afterSecond.mapping, n1).scaleU).toBeCloseTo(6, 4);
  });

  it('sets only typed fields on multi-select partial apply', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(mesh);
    const first = maps[0]!;
    const second = maps[1]!;
    applyPartialTrsToTargets(
      [{ mesh, triangleIndices: first.triangleIndices.slice(), previousMapping: first.mapping }],
      { offsetU: 0.1, rotationDeg: 10 },
    );
    applyPartialTrsToTargets(
      [{ mesh, triangleIndices: second.triangleIndices.slice(), previousMapping: second.mapping }],
      { offsetU: 0.9, rotationDeg: 40 },
    );
    const multi = [
      ...buildTargetsFromFaceSelection(first.triangleIndices.map((faceIndex) => ({ mesh, faceIndex }))),
      ...buildTargetsFromFaceSelection(second.triangleIndices.map((faceIndex) => ({ mesh, faceIndex }))),
    ];
    applyPartialTrsToTargets(multi, { scaleU: 4 });
    const after = getFaceTextureMaps(mesh);
    const afterFirst = after.find((entry) => entry.triangleIndices[0] === first.triangleIndices[0])!;
    const afterSecond = after.find((entry) => entry.triangleIndices[0] === second.triangleIndices[0])!;
    const n0 = computeRegionWorldNormal(mesh, afterFirst.triangleIndices);
    const n1 = computeRegionWorldNormal(mesh, afterSecond.triangleIndices);
    const trs0 = readMappingTrs(afterFirst.mapping, n0);
    const trs1 = readMappingTrs(afterSecond.mapping, n1);
    expect(trs0.scaleU).toBeCloseTo(4, 4);
    expect(trs1.scaleU).toBeCloseTo(4, 4);
    expect(trs0.offsetU).toBeCloseTo(0.1, 4);
    expect(trs1.offsetU).toBeCloseTo(0.9, 4);
    expect(trs0.rotationDeg).toBeCloseTo(10, 2);
    expect(trs1.rotationDeg).toBeCloseTo(40, 2);
  });

  it('reports mixed fields in getCommonTrsFieldState', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyPartialTrsToTargets([targets[0]!], { scaleU: 2 });
    applyPartialTrsToTargets([targets[1]!], { scaleU: 5 });
    const state = getCommonTrsFieldState(targets);
    expect(state.targetCount).toBeGreaterThan(1);
    expect(state.scaleU).toBeNull();
    expect(state.scaleV).toBe(1);
  });

  it('nudges offset and rotates by 90 degrees', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyRelativeTrsToTargets(targets, { kind: 'addOffset', axis: 'u', delta: 0.25 });
    applyRelativeTrsToTargets(targets, { kind: 'addRotation', degrees: 90 });
    const state = getCommonTrsFieldState(targets);
    expect(state.offsetU).toBeCloseTo(0.25, 4);
    expect(state.rotationDeg).toBeCloseTo(90, 2);
  });
});

/**
 * Measures UV axis-aligned span for a triangle region.
 *
 * @param mesh Mesh with UV attribute.
 * @param triangleIndices Region triangles.
 * @returns U and V spans.
 */
function measureRegionUvSpans(mesh: THREE.Mesh, triangleIndices: number[]): { spanU: number; spanV: number } {
  const uv = mesh.geometry.getAttribute('uv');
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  triangleIndices.forEach((triangleIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = regionCornerVertex(mesh, triangleIndex, corner);
      minU = Math.min(minU, uv.getX(vertexIndex));
      maxU = Math.max(maxU, uv.getX(vertexIndex));
      minV = Math.min(minV, uv.getY(vertexIndex));
      maxV = Math.max(maxV, uv.getY(vertexIndex));
    }
  });
  return { spanU: maxU - minU, spanV: maxV - minV };
}

/**
 * Resolves a triangle corner to a geometry vertex index.
 *
 * @param mesh Mesh that may be indexed.
 * @param triangleIndex Triangle index.
 * @param corner Corner 0, 1, or 2.
 * @returns Vertex index.
 */
function regionCornerVertex(mesh: THREE.Mesh, triangleIndex: number, corner: number): number {
  const index = mesh.geometry.getIndex();
  if (index) {
    return index.getX(triangleIndex * 3 + corner);
  }
  return triangleIndex * 3 + corner;
}
