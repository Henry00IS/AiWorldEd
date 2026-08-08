import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandTextureFaceApply } from '@/texture/commands/command_texture_face_apply.js';
import {
  applyMappingToTargets,
  applyTextureIdToTargets,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
  resetUvParamsOnTargets,
  applyAlignToTargets,
} from '@/texture/uv/face_texture_applier.js';
import { createFaceTextureMappingFromTrs, getFaceTextureMappingTrs } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * UV editor scale/offset/rotation must never clobber assigned textures, and
 * Reset / Wall / Ceiling must rebuild face-oriented UV matrices.
 */
describe('UV editor texture preserve and UVMatrix reset/align', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('preserves assigned texture when applying TRS with empty textureId', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'walls/brick.png');
    // UV editor packages TRS with empty textureId (preserve sentinel).
    const editorMapping = createFaceTextureMappingFromTrs(
      '',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 2, scaleV: 3, offsetU: 0.25, offsetV: -0.5, rotationDeg: 15 },
      'auto',
    );
    expect(editorMapping.textureId).toBe('');
    applyMappingToTargets(targets, editorMapping);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('walls/brick.png');
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      const trs = getFaceTextureMappingTrs(entry.mapping, normal);
      expect(trs.scaleU).toBeCloseTo(2, 4);
      expect(trs.scaleV).toBeCloseTo(3, 4);
      expect(trs.offsetU).toBeCloseTo(0.25, 4);
      expect(trs.offsetV).toBeCloseTo(-0.5, 4);
    });
  });

  it('keeps a single free-mesh texture under multi-region TRS apply', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'tex/shared.png');
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThanOrEqual(2);
    const multiTargets = maps.map((entry) => ({
      mesh,
      triangleIndices: entry.triangleIndices.slice(),
      previousMapping: entry.mapping,
    }));
    const editorMapping = createFaceTextureMappingFromTrs(
      '',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 4, scaleV: 4, offsetU: 0, offsetV: 0, rotationDeg: 0 },
      'auto',
    );
    applyMappingToTargets(multiTargets, editorMapping);
    const after = getFaceTextureMaps(mesh);
    expect(after.every((entry) => entry.mapping.textureId === 'tex/shared.png')).toBe(true);
  });

  it('preserves solid face texture when UV TRS is applied via command', () => {
    const model = new SolidModel('UvPreserveSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.surfaceTextureId = 'solid/rock.png';
    model.rebuild(true);
    const result = model.getResultMesh();
    const maps = getFaceTextureMaps(result);
    const zFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(zFace).toBeDefined();
    expect(zFace!.mapping.textureId).toBe('solid/rock.png');
    const targets = buildTargetsFromFaceSelection(
      zFace!.triangleIndices.map((faceIndex) => ({ mesh: result, faceIndex })),
    );
    const editorMapping = createFaceTextureMappingFromTrs(
      '',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 2, scaleV: 2, offsetU: 0.1, offsetV: 0, rotationDeg: 10 },
      'auto',
    );
    new CommandTextureFaceApply(targets, editorMapping).execute();
    const afterMaps = getFaceTextureMaps(result);
    const afterZ = afterMaps.find((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(afterZ?.mapping.textureId).toBe('solid/rock.png');
    expect(brush.getSurfaceMapping(0).textureId).toBe('solid/rock.png');
  });

  it('reset rebuilds face-oriented UV matrices (non-degenerate wall UVs)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, 'keep.png');
    const targets = buildTargetsFromMeshes([mesh]);
    const distorted = createFaceTextureMappingFromTrs(
      '',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 8, scaleV: 0.25, offsetU: 1, offsetV: 2, rotationDeg: 45 },
      'auto',
    );
    applyMappingToTargets(targets, distorted);
    resetUvParamsOnTargets(targets);
    const maps = getFaceTextureMaps(mesh);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('keep.png');
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      const trs = getFaceTextureMappingTrs(entry.mapping, normal);
      expect(trs.scaleU).toBeCloseTo(1, 4);
      expect(trs.scaleV).toBeCloseTo(1, 4);
      expect(trs.offsetU).toBeCloseTo(0, 4);
      expect(trs.offsetV).toBeCloseTo(0, 4);
      expect(trs.rotationDeg).toBeCloseTo(0, 2);
      const span = measureRegionUvSpans(mesh, entry.triangleIndices);
      expect(span.spanU).toBeGreaterThan(0.5);
      expect(span.spanV).toBeGreaterThan(0.5);
    });
  });

  it('reset on solid wall faces keeps texture and non-degenerate UV area', () => {
    const model = new SolidModel('UvResetSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.surfaceTextureId = 'solid/keep.png';
    model.rebuild(true);
    const result = model.getResultMesh();
    const maps = getFaceTextureMaps(result);
    const zFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(zFace).toBeDefined();
    const targets = buildTargetsFromFaceSelection(
      zFace!.triangleIndices.map((faceIndex) => ({ mesh: result, faceIndex })),
    );
    const distorted = createFaceTextureMappingFromTrs(
      '',
      new THREE.Vector3(0, 0, 1),
      { scaleU: 5, scaleV: 5, offsetU: 0.5, offsetV: 0.5, rotationDeg: 30 },
      'auto',
    );
    new CommandTextureFaceApply(targets, distorted).execute();
    new CommandTextureFaceApply(
      targets,
      createFaceTextureMappingFromTrs('', new THREE.Vector3(0, 1, 0), {
        scaleU: 1,
        scaleV: 1,
        offsetU: 0,
        offsetV: 0,
        rotationDeg: 0,
      }),
      { resetUvOnly: true },
    ).execute();
    const after = getFaceTextureMaps(result).find((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(after?.mapping.textureId).toBe('solid/keep.png');
    const span = measureRegionUvSpans(result, after!.triangleIndices);
    expect(span.spanU).toBeGreaterThan(0.5);
    expect(span.spanV).toBeGreaterThan(0.5);
    const area = measureRegionUvArea(result, after!.triangleIndices);
    expect(area).toBeGreaterThan(0.5);
  });

  it('wall align uses upward V and horizontal U on vertical faces', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, 'wall.png');
    const maps = getFaceTextureMaps(mesh);
    const zFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.z > 0.9;
    });
    expect(zFace).toBeDefined();
    const targets = buildTargetsFromFaceSelection(zFace!.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })));
    applyAlignToTargets(targets, 'wall');
    const after = getFaceTextureMaps(mesh).find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.z > 0.9;
    });
    expect(after?.mapping.textureId).toBe('wall.png');
    expect(after?.mapping.align).toBe('wall');
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const position = mesh.geometry.getAttribute('position');
    const samples: Array<{ worldY: number; v: number; u: number; worldX: number }> = [];
    after!.triangleIndices.forEach((triangleIndex) => {
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = triangleIndex * 3 + corner;
        samples.push({
          worldY: position.getY(vertexIndex) + mesh.position.y,
          worldX: position.getX(vertexIndex) + mesh.position.x,
          u: uv.getX(vertexIndex),
          v: uv.getY(vertexIndex),
        });
      }
    });
    const low = samples.filter((sample) => sample.worldY < 0.6);
    const high = samples.filter((sample) => sample.worldY > 1.4);
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThan(0);
    const avgLowV = average(low.map((sample) => sample.v));
    const avgHighV = average(high.map((sample) => sample.v));
    expect(avgHighV - avgLowV).toBeGreaterThan(0.5);
    const left = samples.filter((sample) => sample.worldX < -0.4);
    const right = samples.filter((sample) => sample.worldX > 0.4);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    const avgLeftU = average(left.map((sample) => sample.u));
    const avgRightU = average(right.map((sample) => sample.u));
    expect(Math.abs(avgRightU - avgLeftU)).toBeGreaterThan(0.5);
  });

  it('ceiling align keeps non-degenerate UVs with right-handed basis', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, 'ceil.png');
    const maps = getFaceTextureMaps(mesh);
    const topFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.y > 0.9;
    });
    expect(topFace).toBeDefined();
    const targets = buildTargetsFromFaceSelection(topFace!.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })));
    applyAlignToTargets(targets, 'ceiling');
    const after = getFaceTextureMaps(mesh).find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.y > 0.9;
    });
    expect(after?.mapping.textureId).toBe('ceil.png');
    expect(after?.mapping.align).toBe('ceiling');
    const span = measureRegionUvSpans(mesh, after!.triangleIndices);
    expect(span.spanU).toBeGreaterThan(0.5);
    expect(span.spanV).toBeGreaterThan(0.5);
    const uDir = new THREE.Vector3(after!.mapping.uv.u.x, after!.mapping.uv.u.y, after!.mapping.uv.u.z).normalize();
    const vDir = new THREE.Vector3(after!.mapping.uv.v.x, after!.mapping.uv.v.y, after!.mapping.uv.v.z).normalize();
    const crossed = new THREE.Vector3().crossVectors(uDir, vDir);
    // Ceiling projection normal is -Y; U × V should point along it.
    expect(crossed.y).toBeLessThan(-0.9);
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
      const vertexIndex = triangleIndex * 3 + corner;
      minU = Math.min(minU, uv.getX(vertexIndex));
      maxU = Math.max(maxU, uv.getX(vertexIndex));
      minV = Math.min(minV, uv.getY(vertexIndex));
      maxV = Math.max(maxV, uv.getY(vertexIndex));
    }
  });
  return { spanU: maxU - minU, spanV: maxV - minV };
}

/**
 * Approximate UV triangle area sum for a region.
 *
 * @param mesh Mesh with UV attribute.
 * @param triangleIndices Region triangles.
 * @returns Total absolute UV area.
 */
function measureRegionUvArea(mesh: THREE.Mesh, triangleIndices: number[]): number {
  const uv = mesh.geometry.getAttribute('uv');
  let area = 0;
  triangleIndices.forEach((triangleIndex) => {
    const i0 = triangleIndex * 3;
    const u0 = uv.getX(i0);
    const v0 = uv.getY(i0);
    const u1 = uv.getX(i0 + 1);
    const v1 = uv.getY(i0 + 1);
    const u2 = uv.getX(i0 + 2);
    const v2 = uv.getY(i0 + 2);
    area += Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) * 0.5;
  });
  return area;
}

/**
 * Averages a list of numbers.
 *
 * @param values Numbers to average.
 * @returns Mean value.
 */
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
