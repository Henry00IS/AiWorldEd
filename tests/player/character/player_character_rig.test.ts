import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerCharacterBuildRig, playerCharacterDisposeRig } from '@/player/character/player_character_rig.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';
import {
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

describe('playerCharacterBuildRig', () => {
  beforeAll(async () => {
    playerCharacterResetModelLoader();
    const modelPath = resolve(process.cwd(), 'src/player/assets/character.glb');
    const buffer = readFileSync(modelPath);
    await playerCharacterLoadModelFromArrayBuffer(buffer);
  });

  afterEach(() => {
    // Keep the loaded template between tests; only dispose built instances.
  });

  it('builds a skinned GLB character with mapped limb bones', () => {
    const rig = playerCharacterBuildRig();
    expect(rig.bones.get(PLAYER_CHARACTER_BONE.head)).toBeTruthy();
    expect(rig.bones.get(PLAYER_CHARACTER_BONE.footLeft)).toBeTruthy();
    expect(rig.bones.get(PLAYER_CHARACTER_BONE.handRight)).toBeTruthy();
    expect(rig.restLocalQuaternions.get(PLAYER_CHARACTER_BONE.hips)).toBeTruthy();
    let skinnedCount = 0;
    rig.root.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) {
        skinnedCount += 1;
      }
    });
    expect(skinnedCount).toBeGreaterThan(0);
    expect(isEditorHelperObject(rig.root)).toBe(true);
    const bounds = new THREE.Box3().setFromObject(rig.root);
    const height = bounds.max.y - bounds.min.y;
    expect(height).toBeGreaterThan(1.5);
    expect(height).toBeLessThan(2.0);
    playerCharacterDisposeRig(rig.root);
  });
});
