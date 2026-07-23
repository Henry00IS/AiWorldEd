import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  bakeFaceUVs,
  buildProjectionBasis,
  ensureUniqueTriangleVertices,
  projectWorldPositionToUv,
  resolveProjectionNormal,
  splitMeshIntoCoplanarRegions,
  computeRegionWorldNormal
} from '../../src/texture/planar_uv_projector.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { transferUvMappingAcrossFaces } from '../../src/texture/uv_smear_transfer.js';
import { initializeMeshTextureUVs } from '../../src/texture/face_texture_applier.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';

describe('uv_smear_transfer', () => {
  it('should match UVs on a shared edge after transfer between box sides', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      createContentMaterial(0xffffff)
    );
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    ensureUniqueTriangleVertices(mesh);
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const walls = regions.filter((region) => {
      const normal = computeRegionWorldNormal(mesh, region);
      return Math.abs(normal.y) < 0.2;
    });
    expect(walls.length).toBeGreaterThanOrEqual(2);
    const pair = findAdjacentRegionPair(mesh, walls);
    expect(pair).not.toBeNull();
    const sourceRegion = pair!.source;
    const destRegion = pair!.dest;
    const sourceMapping = createDefaultFaceTextureMapping('wall.png');
    sourceMapping.align = 'face';
    sourceMapping.scaleU = 1;
    sourceMapping.scaleV = 1;
    sourceMapping.offsetU = 0.25;
    sourceMapping.rotationDeg = 15;
    bakeFaceUVs(mesh, sourceRegion, sourceMapping);
    const destMapping = transferUvMappingAcrossFaces(
      mesh,
      sourceRegion,
      sourceMapping,
      mesh,
      destRegion
    );
    bakeFaceUVs(mesh, destRegion, destMapping);
    const shared = findSharedWorldPoints(mesh, sourceRegion, destRegion);
    expect(shared.length).toBeGreaterThanOrEqual(2);
    const sourceNormal = computeRegionWorldNormal(mesh, sourceRegion);
    const destNormal = computeRegionWorldNormal(mesh, destRegion);
    const sourceBasis = buildProjectionBasis(
      resolveProjectionNormal(sourceNormal, sourceMapping.align),
      sourceMapping.rotationDeg
    );
    const destBasis = buildProjectionBasis(
      resolveProjectionNormal(destNormal, destMapping.align),
      destMapping.rotationDeg
    );
    shared.slice(0, 2).forEach((point) => {
      const sourceUv = projectWorldPositionToUv(point, sourceBasis, sourceMapping);
      const destUv = projectWorldPositionToUv(point, destBasis, destMapping);
      expect(destUv.u).toBeCloseTo(sourceUv.u, 2);
      expect(destUv.v).toBeCloseTo(sourceUv.v, 2);
    });
  });

  it('should copy texture id and scale onto the destination mapping', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    ensureUniqueTriangleVertices(mesh);
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const sourceMapping = createDefaultFaceTextureMapping('brick.png');
    sourceMapping.scaleU = 2;
    sourceMapping.scaleV = 0.5;
    const destMapping = transferUvMappingAcrossFaces(
      mesh,
      regions[0],
      sourceMapping,
      mesh,
      regions[1]
    );
    expect(destMapping.textureId).toBe('brick.png');
    expect(Math.abs(destMapping.scaleU)).toBeCloseTo(2, 5);
    expect(destMapping.scaleV).toBeCloseTo(0.5, 5);
    expect(destMapping.align).toBe('face');
  });

  it('should keep cylinder sides continuous after sequential smear transfers', () => {
    const segments = 8;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 2, segments),
      createContentMaterial(0xffffff)
    );
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const sides = regions
      .filter((region) => {
        const normal = computeRegionWorldNormal(mesh, region);
        return Math.abs(normal.y) <= 0.35;
      })
      .sort((a, b) => {
        const na = computeRegionWorldNormal(mesh, a);
        const nb = computeRegionWorldNormal(mesh, b);
        return Math.atan2(na.x, na.z) - Math.atan2(nb.x, nb.z);
      });
    expect(sides.length).toBe(segments);
    let mapping = createDefaultFaceTextureMapping('shell.png');
    mapping.align = 'face';
    bakeFaceUVs(mesh, sides[0], mapping);
    for (let i = 1; i < sides.length; i++) {
      mapping = transferUvMappingAcrossFaces(
        mesh,
        sides[i - 1],
        mapping,
        mesh,
        sides[i]
      );
      bakeFaceUVs(mesh, sides[i], mapping);
    }
    for (let i = 1; i < sides.length; i++) {
      const shared = findSharedWorldPoints(mesh, sides[i - 1], sides[i]);
      if (shared.length < 2) continue;
      const prevNormal = computeRegionWorldNormal(mesh, sides[i - 1]);
      const nextNormal = computeRegionWorldNormal(mesh, sides[i]);
      // Recover mappings by re-transfer is heavy; compare baked UV attribute.
      const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
      const pos = mesh.geometry.getAttribute('position');
      const prevSamples = sampleRegionUvsNearPoint(mesh, sides[i - 1], shared[0], uv, pos);
      const nextSamples = sampleRegionUvsNearPoint(mesh, sides[i], shared[0], uv, pos);
      expect(prevSamples.length).toBeGreaterThan(0);
      expect(nextSamples.length).toBeGreaterThan(0);
      expect(nextSamples[0].u).toBeCloseTo(prevSamples[0].u, 1);
      expect(nextSamples[0].v).toBeCloseTo(prevSamples[0].v, 1);
      void prevNormal;
      void nextNormal;
    }
  });
});

/**
 * Finds two wall regions that share at least two world vertices.
 * @param mesh Mesh owner.
 * @param walls Wall region list.
 * @returns Adjacent pair or null.
 */
function findAdjacentRegionPair(
  mesh: THREE.Mesh,
  walls: number[][]
): { source: number[]; dest: number[] } | null {
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const shared = findSharedWorldPoints(mesh, walls[i], walls[j]);
      if (shared.length >= 2) {
        return { source: walls[i], dest: walls[j] };
      }
    }
  }
  return null;
}

/**
 * Finds world points that appear on both regions (shared edge vertices).
 * @param mesh Mesh owner.
 * @param regionA First region.
 * @param regionB Second region.
 * @returns Shared world positions.
 */
function findSharedWorldPoints(
  mesh: THREE.Mesh,
  regionA: number[],
  regionB: number[]
): THREE.Vector3[] {
  const pointsA = collectRegionWorldPoints(mesh, regionA);
  const pointsB = collectRegionWorldPoints(mesh, regionB);
  const shared: THREE.Vector3[] = [];
  pointsA.forEach((a) => {
    const hit = pointsB.some((b) => a.distanceToSquared(b) < 1e-6);
    if (hit) shared.push(a);
  });
  return shared;
}

/**
 * Collects unique world vertices for a triangle region.
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns World points.
 */
function collectRegionWorldPoints(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute('position');
  const results: THREE.Vector3[] = [];
  const seen = new Set<string>();
  triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vi = faceIndex * 3 + corner;
      const local = new THREE.Vector3().fromBufferAttribute(position, vi);
      const world = local.clone().applyMatrix4(mesh.matrixWorld);
      const key = `${world.x.toFixed(4)},${world.y.toFixed(4)},${world.z.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(world);
    }
  });
  return results;
}

/**
 * Samples baked UVs for region vertices near a world point.
 * @param mesh Mesh with baked UVs.
 * @param region Triangle indices.
 * @param worldPoint Query point.
 * @param uv UV attribute.
 * @param position Position attribute.
 * @returns Nearby UV samples.
 */
function sampleRegionUvsNearPoint(
  mesh: THREE.Mesh,
  region: number[],
  worldPoint: THREE.Vector3,
  uv: THREE.BufferAttribute,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): Array<{ u: number; v: number }> {
  const samples: Array<{ u: number; v: number }> = [];
  region.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vi = faceIndex * 3 + corner;
      const local = new THREE.Vector3().fromBufferAttribute(position, vi);
      const world = local.clone().applyMatrix4(mesh.matrixWorld);
      if (world.distanceToSquared(worldPoint) > 1e-4) continue;
      samples.push({ u: uv.getX(vi), v: uv.getY(vi) });
    }
  });
  return samples;
}
