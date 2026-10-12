import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import {
  applyRelativeTrsToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

describe('content mesh document UV preserve', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTextureMapCacheForTests(null);
  });

  it('keeps display corner UVs and one map per face when entering edit mode', () => {
    const mesh = createInitializedBox();
    mesh.position.set(4, 0, 0);
    mesh.updateMatrixWorld(true);
    const uv = mesh.geometry.getAttribute('uv');
    uv.setXY(0, 0.2, 0.3);
    ensureMeshEditDocument(mesh);
    const after = mesh.geometry.getAttribute('uv');
    expect(getFaceTextureMaps(mesh)).toHaveLength(6);
    expect(mesh.geometry.getIndex()).not.toBeNull();
    expect(after.getX(0)).toBeCloseTo(0.2, 5);
    expect(after.getY(0)).toBeCloseTo(0.3, 5);
    mesh.geometry.dispose();
  });

  it('halves each face U span in object mode without sharing one projection', () => {
    const mesh = createInitializedBox();
    mesh.position.set(4, 0, 0);
    mesh.updateMatrixWorld(true);
    ensureMeshEditDocument(mesh);
    const before = getFaceTextureMaps(mesh).map((entry) => faceUvSpan(mesh, entry.triangleIndices));
    expect(before).toHaveLength(6);
    applyRelativeTrsToTargets(buildTargetsFromMeshes([mesh]), { kind: 'multiplyScale', axis: 'u', factor: 2 });
    const after = getFaceTextureMaps(mesh).map((entry) => faceUvSpan(mesh, entry.triangleIndices));
    expect(after).toHaveLength(6);
    for (let index = 0; index < before.length; index++) {
      const previous = before[index];
      const next = after[index];
      expect(previous).toBeDefined();
      expect(next).toBeDefined();
      if (!previous || !next) {
        continue;
      }
      expect(next.u).toBeCloseTo(previous.u * 0.5, 2);
      expect(next.v).toBeCloseTo(previous.v, 2);
    }
    mesh.geometry.dispose();
  });

  it('scales one face without changing the other faces corner UVs', () => {
    const mesh = createInitializedBox();
    mesh.position.set(4, 0, 0);
    mesh.updateMatrixWorld(true);
    ensureMeshEditDocument(mesh);
    const maps = getFaceTextureMaps(mesh);
    const first = maps[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    const otherTriangles = maps.slice(1).flatMap((entry) => entry.triangleIndices);
    const before = snapshotTriangleUvs(mesh, otherTriangles);
    applyRelativeTrsToTargets([{ mesh, triangleIndices: first.triangleIndices.slice(), previousMapping: null }], {
      kind: 'multiplyScale',
      axis: 'u',
      factor: 2,
    });
    const after = snapshotTriangleUvs(mesh, otherTriangles);
    expect(after.length).toBe(before.length);
    for (let index = 0; index < before.length; index++) {
      expect(after[index]).toBeCloseTo(before[index] ?? 0, 4);
    }
    mesh.geometry.dispose();
  });
});

/**
 * Builds a persistent box the way primitive creation does, including UV init.
 *
 * @returns Content mesh at the origin.
 */
function createInitializedBox(): THREE.Mesh {
  const document = createMeshDocumentBox(2, 2, 2);
  const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
  writePersistentMeshDocument(mesh, document);
  mesh.updateMatrixWorld(true);
  initializeMeshTextureUVs(mesh, undefined, undefined, { centerTexture: true });
  return mesh;
}

/**
 * Measures the UV span of a triangle region.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Region triangles.
 * @returns U and V spans.
 */
function faceUvSpan(mesh: THREE.Mesh, triangleIndices: readonly number[]): { u: number; v: number } {
  const samples = snapshotTriangleUvs(mesh, triangleIndices);
  return { u: channelSpan(samples, 0), v: channelSpan(samples, 1) };
}

/**
 * Returns the max-minus-min of one interleaved UV channel.
 *
 * @param samples Interleaved u,v samples.
 * @param offset 0 for U, 1 for V.
 * @returns Span.
 */
function channelSpan(samples: readonly number[], offset: number): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = offset; index < samples.length; index += 2) {
    const value = samples[index] ?? 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return max - min;
}

/**
 * Reads interleaved UVs for the corners of the given triangles.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Triangle indices.
 * @returns Interleaved u,v values.
 */
function snapshotTriangleUvs(mesh: THREE.Mesh, triangleIndices: readonly number[]): number[] {
  const uv = mesh.geometry.getAttribute('uv');
  const index = mesh.geometry.getIndex();
  const values: number[] = [];
  for (const triangleIndex of triangleIndices) {
    appendTriangleUvs(uv, index, triangleIndex, values);
  }
  return values;
}

/**
 * Appends one triangle's UVs.
 *
 * @param uv UV attribute.
 * @param index Optional index buffer.
 * @param triangleIndex Triangle index.
 * @param values Output samples.
 */
function appendTriangleUvs(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: THREE.BufferAttribute | null,
  triangleIndex: number,
  values: number[],
): void {
  for (let corner = 0; corner < 3; corner++) {
    const vertexIndex = index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner;
    values.push(uv.getX(vertexIndex), uv.getY(vertexIndex));
  }
}
