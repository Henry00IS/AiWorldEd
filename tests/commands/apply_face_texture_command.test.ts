import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ApplyFaceTextureCommand } from '../../src/commands/apply_face_texture_command.js';
import { buildTargetsFromMeshes } from '../../src/texture/face_texture_applier.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';

describe('ApplyFaceTextureCommand', () => {
  it('should apply mapping on execute and restore on undo', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping();
    mapping.align = 'floor';
    mapping.scaleU = 2;
    const command = new ApplyFaceTextureCommand(targets, mapping);
    command.execute();
    expect(getFaceTextureMaps(mesh).length).toBeGreaterThan(0);
    expect(getFaceTextureMaps(mesh)[0].mapping.scaleU).toBe(2);
    command.undo();
    expect(getFaceTextureMaps(mesh).length).toBe(0);
  });
});
