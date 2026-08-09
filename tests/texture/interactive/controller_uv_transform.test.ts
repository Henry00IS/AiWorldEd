import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ControllerUvTransform } from '@/texture/interactive/controller_uv_transform.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/**
 * Builds a unit box mesh with default face texture maps.
 *
 * @returns Content mesh ready for UV transform tests.
 */
function createTexturedBoxMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
  mesh.position.set(0, 1, 0);
  mesh.updateMatrixWorld(true);
  initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
  return mesh;
}

/**
 * Finds a stored face map entry covering the given triangle indices.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Serialized U and V rows.
 */
function readRegionUvRows(mesh: THREE.Mesh, triangleIndices: number[]): { u: number[]; v: number[] } {
  const key = triangleIndices
    .slice()
    .sort((a, b) => a - b)
    .join(',');
  const maps = getFaceTextureMaps(mesh);
  for (const entry of maps) {
    const entryKey = entry.triangleIndices
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    if (entryKey === key) {
      return {
        u: entry.mapping.uv.u.toArray(),
        v: entry.mapping.uv.v.toArray(),
      };
    }
  }
  throw new Error('region mapping not found');
}

/**
 * Returns whether two UV row snapshots differ.
 *
 * @param a First rows.
 * @param b Second rows.
 * @returns True when any component differs.
 */
function uvRowsDiffer(a: { u: number[]; v: number[] }, b: { u: number[]; v: number[] }): boolean {
  for (let index = 0; index < 4; index++) {
    if (Math.abs(a.u[index]! - b.u[index]!) > 1e-6) {
      return true;
    }
    if (Math.abs(a.v[index]! - b.v[index]!) > 1e-6) {
      return true;
    }
  }
  return false;
}

describe('ControllerUvTransform', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('moves UVs live and commits an undoable command', () => {
    const mesh = createTexturedBoxMesh();
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    const region = maps[0]!;
    const stack = new CommandStack(16);
    const controller = new ControllerUvTransform(stack, new GridSnap(false, 1));
    const before = readRegionUvRows(mesh, region.triangleIndices);
    const started = controller.begin({
      mode: 'move',
      selections: region.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })),
      worldStart: new THREE.Vector3(0, 2, 0),
      planeNormal: new THREE.Vector3(0, 1, 0),
      snapEnabled: false,
    });
    expect(started).toBe(true);
    expect(controller.isActive()).toBe(true);
    const applied = controller.applyWorldSample(new THREE.Vector3(0.5, 2, 0.25));
    expect(applied).toBe(true);
    const live = readRegionUvRows(mesh, region.triangleIndices);
    expect(uvRowsDiffer(before, live)).toBe(true);
    expect(controller.end()).toBe(true);
    expect(stack.canUndo()).toBe(true);
    stack.undo();
    const undone = readRegionUvRows(mesh, region.triangleIndices);
    expect(uvRowsDiffer(before, undone)).toBe(false);
  });

  it('restores state on cancel without pushing undo', () => {
    const mesh = createTexturedBoxMesh();
    const maps = getFaceTextureMaps(mesh);
    const region = maps[0]!;
    const stack = new CommandStack(16);
    const controller = new ControllerUvTransform(stack, new GridSnap(false, 1));
    const before = readRegionUvRows(mesh, region.triangleIndices);
    controller.begin({
      mode: 'move',
      selections: region.triangleIndices.map((faceIndex) => ({ mesh, faceIndex })),
      worldStart: new THREE.Vector3(0, 2, 0),
      planeNormal: new THREE.Vector3(0, 1, 0),
      snapEnabled: false,
    });
    controller.applyWorldSample(new THREE.Vector3(1, 2, 0.5));
    controller.cancel();
    expect(stack.canUndo()).toBe(false);
    const restored = readRegionUvRows(mesh, region.triangleIndices);
    expect(uvRowsDiffer(before, restored)).toBe(false);
  });
});
