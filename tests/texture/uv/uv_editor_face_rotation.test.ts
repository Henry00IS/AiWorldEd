import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  applyMappingToTargets,
  buildTargetsFromFaceSelection,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { createFaceTextureMappingFromTrs } from '@/texture/uv/face_texture_mapping.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/**
 * UV editor used to rebuild matrices with a Y-up normal. On a Z face that
 * collapses V (floor basis: V = Z, face is constant Z → line UVs).
 */
describe('UV editor face rotation', () => {
  it('keeps non-degenerate UV area when rotating a Z-facing solid face', () => {
    const model = new SolidModel('UvRotZ');
    model.addBoxBrush(2, SolidOperation.Additive);
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
    // Simulate UV editor packaging TRS with a wrong (Y-up) carrier normal.
    const editorMapping = createFaceTextureMappingFromTrs(
      zFace!.mapping.textureId,
      new THREE.Vector3(0, 1, 0),
      { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 35 },
      'auto',
    );
    applyMappingToTargets(targets, editorMapping);
    const area = measureRegionUvArea(result, zFace!.triangleIndices);
    expect(area).toBeGreaterThan(0.25);
    const span = measureRegionUvSpans(result, zFace!.triangleIndices);
    expect(span.spanU).toBeGreaterThan(0.1);
    expect(span.spanV).toBeGreaterThan(0.1);
  });

  it('keeps non-degenerate UV area when rotating an X-facing content face', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    const xFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.x) > 0.9;
    });
    expect(xFace).toBeDefined();
    const targets = buildTargetsFromFaceSelection(xFace!.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })));
    const editorMapping = createFaceTextureMappingFromTrs(
      xFace!.mapping.textureId,
      new THREE.Vector3(0, 1, 0),
      { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 40 },
      'auto',
    );
    applyMappingToTargets(targets, editorMapping);
    const span = measureRegionUvSpans(mesh, xFace!.triangleIndices);
    expect(span.spanU).toBeGreaterThan(0.1);
    expect(span.spanV).toBeGreaterThan(0.1);
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
    const i0 = regionCornerVertex(mesh, triangleIndex, 0);
    const i1 = regionCornerVertex(mesh, triangleIndex, 1);
    const i2 = regionCornerVertex(mesh, triangleIndex, 2);
    const u0 = uv.getX(i0);
    const v0 = uv.getY(i0);
    const u1 = uv.getX(i1);
    const v1 = uv.getY(i1);
    const u2 = uv.getX(i2);
    const v2 = uv.getY(i2);
    area += Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) * 0.5;
  });
  return area;
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
