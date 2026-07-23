import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs
} from '../../src/texture/face_texture_applier.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { computeRegionWorldNormal } from '../../src/texture/planar_uv_projector.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';

describe('texture assign preserves cylinder UVs', () => {
  beforeEach(() => {
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should keep cylinder side offsetU when assigning a texture id', () => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      createContentMaterial(0x888888)
    );
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);

    const before = sideOffsets(mesh);
    expect(before.length).toBe(8);
    expect(new Set(before.map((v) => v.toFixed(5))).size).toBe(8);

    const uvBefore = captureUv(mesh);
    const targets = buildTargetsFromMeshes([mesh]);
    targets.forEach((target) => {
      expect(target.previousMapping).not.toBeNull();
    });
    applyTextureIdToTargets(targets, 'walls/brick.png');

    const after = sideOffsets(mesh);
    expect(after.length).toBe(8);
    before.forEach((value, index) => {
      expect(after[index]).toBeCloseTo(value, 5);
    });
    const uvAfter = captureUv(mesh);
    expect(uvAfter).toEqual(uvBefore);
  });

  it('should keep sequential U unwrap after texture assign', () => {
    const segments = 8;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 2, segments),
      createContentMaterial(0x888888)
    );
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'metal.png');

    const ranges = sideURanges(mesh);
    expect(ranges.length).toBe(segments);
    ranges.sort((a, b) => a.minU - b.minU);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].minU).toBeGreaterThanOrEqual(ranges[i - 1].maxU - 1e-3);
    }
    const totalSpan = ranges[ranges.length - 1].maxU - ranges[0].minU;
    const sideLength = 2 * Math.sin(Math.PI / segments);
    expect(totalSpan).toBeCloseTo(segments * sideLength, 2);
  });

  it('should not rewrite UV buffer when only the texture id changes', () => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      createContentMaterial(0x888888)
    );
    mesh.position.set(1, 0.5, -2);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const before = captureUv(mesh);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'folder/rock.png');
    expect(captureUv(mesh)).toEqual(before);
    getFaceTextureMaps(mesh).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('folder/rock.png');
    });
  });
});

/**
 * Side-face offsetU values sorted by triangle key for stable compare.
 * @param mesh Mesh with face maps.
 * @returns offsetU list.
 */
function sideOffsets(mesh: THREE.Mesh): number[] {
  return getFaceTextureMaps(mesh)
    .filter((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.y) <= 0.35;
    })
    .sort((a, b) => a.triangleIndices[0] - b.triangleIndices[0])
    .map((entry) => entry.mapping.offsetU);
}

/**
 * Captures full UV buffer as numbers.
 * @param mesh Mesh with UVs.
 * @returns Flat UV array.
 */
function captureUv(mesh: THREE.Mesh): number[] {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  return Array.from(uv.array as ArrayLike<number>);
}

/**
 * U ranges for cylinder sides.
 * @param mesh Mesh with baked UVs.
 * @returns min/max U per side.
 */
function sideURanges(
  mesh: THREE.Mesh
): Array<{ minU: number; maxU: number }> {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  return getFaceTextureMaps(mesh)
    .filter((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.y) <= 0.35;
    })
    .map((entry) => {
      let minU = Infinity;
      let maxU = -Infinity;
      entry.triangleIndices.forEach((faceIndex) => {
        for (let c = 0; c < 3; c++) {
          const vi = faceIndex * 3 + c;
          minU = Math.min(minU, uv.getX(vi));
          maxU = Math.max(maxU, uv.getX(vi));
        }
      });
      return { minU, maxU };
    });
}
