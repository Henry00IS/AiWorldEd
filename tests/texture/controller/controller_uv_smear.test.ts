import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ControllerUvSmear } from '@/texture/controller/controller_uv_smear.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';

describe('UvSmearController', () => {
  let stack: CommandStack;
  let controller: ControllerUvSmear;

  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
    stack = new CommandStack(32);
    controller = new ControllerUvSmear(stack);
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should paint multiple cylinder sides during one stroke and support undo', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), createContentMaterial(0xcccccc));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const beforeOffsets = sideOffsetSignature(mesh);
    controller.beginStroke(mesh, 0);
    // Cylinder side triangles are interleaved; walk a range of face indices.
    for (let faceIndex = 1; faceIndex < 20; faceIndex++) {
      controller.continueStroke(mesh, faceIndex);
    }
    controller.endStroke();
    expect(stack.getUndoCount()).toBe(1);
    const afterOffsets = sideOffsetSignature(mesh);
    expect(afterOffsets).not.toEqual(beforeOffsets);
    stack.undo();
    expect(sideOffsetSignature(mesh)).toEqual(beforeOffsets);
    stack.redo();
    expect(sideOffsetSignature(mesh)).toEqual(afterOffsets);
  });

  it('should not push undo when the stroke never leaves the first face', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0xaaaaaa));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    controller.beginStroke(mesh, 0);
    controller.continueStroke(mesh, 0);
    controller.endStroke();
    // Seed face is read-only; no mesh edits means no undo command.
    expect(stack.getUndoCount()).toBe(0);
  });

  it('should not change UVs on the seed face of a rotated content mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0xaaaaaa));
    mesh.position.set(0, 1, 0);
    mesh.rotation.z = Math.PI / 4;
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    const frontFace = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(frontFace).toBeDefined();
    const seedTriangle = frontFace!.triangleIndices[0]!;
    const uvBefore = captureRegionUvSignature(mesh, frontFace!.triangleIndices);
    const mapsBefore = JSON.stringify(
      getFaceTextureMaps(mesh).map((entry) => ({
        triangles: entry.triangleIndices.slice().sort((a, b) => a - b),
        textureId: entry.mapping.textureId,
        uv: entry.mapping.uv.serialize(),
      })),
    );
    controller.beginStroke(mesh, seedTriangle);
    controller.endStroke();
    const uvAfter = captureRegionUvSignature(mesh, frontFace!.triangleIndices);
    expect(uvAfter).toEqual(uvBefore);
    const mapsAfter = JSON.stringify(
      getFaceTextureMaps(mesh).map((entry) => ({
        triangles: entry.triangleIndices.slice().sort((a, b) => a - b),
        textureId: entry.mapping.textureId,
        uv: entry.mapping.uv.serialize(),
      })),
    );
    expect(mapsAfter).toEqual(mapsBefore);
    expect(stack.getUndoCount()).toBe(0);
  });

  it('should keep continuous UVs when smearing across a rotated content cube', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0xaaaaaa));
    mesh.position.set(0, 1, 0);
    mesh.rotation.z = Math.PI / 4;
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    // Prefer the +Z face as seed (still axis-aligned under Z rotation), then any neighbor.
    const front = maps.find((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return normal.z > 0.9;
    });
    expect(front).toBeDefined();
    const pair = findNeighborOfRegion(
      mesh,
      front!.triangleIndices,
      maps.map((entry) => entry.triangleIndices),
    );
    expect(pair).not.toBeNull();
    const source = pair!.source;
    const dest = pair!.dest;
    controller.beginStroke(mesh, source[0]!);
    controller.continueStroke(mesh, dest[0]!);
    controller.endStroke();
    const shared = findSharedWorldPoints(mesh, source, dest);
    expect(shared.length).toBeGreaterThanOrEqual(2);
    shared.slice(0, 2).forEach((point) => {
      const sourceUv = sampleUvNearWorldPoint(mesh, source, point);
      const destUv = sampleUvNearWorldPoint(mesh, dest, point);
      expect(destUv.u).toBeCloseTo(sourceUv.u, 2);
      expect(destUv.v).toBeCloseTo(sourceUv.v, 2);
    });
  });
});

/**
 * Finds a region that shares an edge with the given source region.
 *
 * @param mesh Mesh owner.
 * @param source Source triangle indices.
 * @param regions All region triangle lists.
 * @returns Adjacent pair or null.
 */
function findNeighborOfRegion(
  mesh: THREE.Mesh,
  source: number[],
  regions: number[][],
): { source: number[]; dest: number[] } | null {
  for (const dest of regions) {
    if (dest === source) continue;
    if (regionKey(dest) === regionKey(source)) continue;
    if (findSharedWorldPoints(mesh, source, dest).length >= 2) {
      return { source, dest };
    }
  }
  return null;
}

/**
 * Stable key for a triangle index list.
 *
 * @param triangles Triangle indices.
 * @returns Key string.
 */
function regionKey(triangles: number[]): string {
  return triangles
    .slice()
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Collects world points that appear on both regions (shared edge vertices).
 *
 * @param mesh Mesh owner.
 * @param regionA First region.
 * @param regionB Second region.
 * @returns Shared world points.
 */
function findSharedWorldPoints(mesh: THREE.Mesh, regionA: number[], regionB: number[]): THREE.Vector3[] {
  const pointsA = collectRegionWorldPoints(mesh, regionA);
  const pointsB = collectRegionWorldPoints(mesh, regionB);
  const shared: THREE.Vector3[] = [];
  pointsA.forEach((pointA) => {
    if (pointsB.some((pointB) => pointA.distanceTo(pointB) < 1e-3)) {
      shared.push(pointA);
    }
  });
  return shared;
}

/**
 * Collects unique world positions for a triangle region.
 *
 * @param mesh Mesh owner.
 * @param triangles Region triangles.
 * @returns World points.
 */
function collectRegionWorldPoints(mesh: THREE.Mesh, triangles: number[]): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute('position');
  const points: THREE.Vector3[] = [];
  const seen = new Set<string>();
  triangles.forEach((triangleIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = regionCornerVertex(mesh, triangleIndex, corner);
      const local = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
      const world = local.applyMatrix4(mesh.matrixWorld);
      const key = `${world.x.toFixed(4)},${world.y.toFixed(4)},${world.z.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(world);
    }
  });
  return points;
}

/**
 * Samples the UV of the region vertex nearest a world point.
 *
 * @param mesh Mesh with UV attribute.
 * @param triangles Region triangles.
 * @param worldPoint World query point.
 * @returns UV pair.
 */
function sampleUvNearWorldPoint(
  mesh: THREE.Mesh,
  triangles: number[],
  worldPoint: THREE.Vector3,
): { u: number; v: number } {
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  let bestDistance = Number.POSITIVE_INFINITY;
  let best = { u: 0, v: 0 };
  triangles.forEach((triangleIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = regionCornerVertex(mesh, triangleIndex, corner);
      const local = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
      const world = local.applyMatrix4(mesh.matrixWorld);
      const distance = world.distanceTo(worldPoint);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { u: uv.getX(vertexIndex), v: uv.getY(vertexIndex) };
    }
  });
  return best;
}

/**
 * Captures baked UV samples for a triangle region.
 *
 * @param mesh Mesh with UV attribute.
 * @param triangleIndices Region triangles.
 * @returns Compact UV signature string.
 */
function captureRegionUvSignature(mesh: THREE.Mesh, triangleIndices: number[]): string {
  const uv = mesh.geometry.getAttribute('uv');
  const samples: string[] = [];
  triangleIndices.forEach((triangleIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = regionCornerVertex(mesh, triangleIndex, corner);
      samples.push(`${uv.getX(vertexIndex).toFixed(5)},${uv.getY(vertexIndex).toFixed(5)}`);
    }
  });
  return samples.join('|');
}

/**
 * Signature of side-face offsetU values for change detection.
 *
 * @param mesh Mesh with face maps.
 * @returns Joined offset string.
 */
function sideOffsetSignature(mesh: THREE.Mesh): string {
  return getFaceTextureMaps(mesh)
    .filter((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.y) <= 0.35;
    })
    .map((entry) => entry.mapping.offsetU!.toFixed(4))
    .sort()
    .join('|');
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
