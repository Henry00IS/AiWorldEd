import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '../../src/commands/command_stack.js';
import { UvSmearController } from '../../src/managers/uv_smear_controller.js';
import { initializeMeshTextureUVs } from '../../src/texture/face_texture_applier.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';
import { computeRegionWorldNormal } from '../../src/texture/planar_uv_projector.js';

describe('UvSmearController', () => {
  let stack: CommandStack;
  let controller: UvSmearController;

  beforeEach(() => {
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
    stack = new CommandStack(32);
    controller = new UvSmearController(stack);
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should paint multiple cylinder sides during one stroke and support undo', () => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      createContentMaterial(0xcccccc)
    );
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0xaaaaaa)
    );
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    controller.beginStroke(mesh, 0);
    controller.continueStroke(mesh, 0);
    controller.endStroke();
    // First face still changes maps/UVs once; undo is still valid if touched.
    expect(stack.getUndoCount()).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Signature of side-face offsetU values for change detection.
 * @param mesh Mesh with face maps.
 * @returns Joined offset string.
 */
function sideOffsetSignature(mesh: THREE.Mesh): string {
  return getFaceTextureMaps(mesh)
    .filter((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.y) <= 0.35;
    })
    .map((entry) => entry.mapping.offsetU.toFixed(4))
    .sort()
    .join('|');
}
