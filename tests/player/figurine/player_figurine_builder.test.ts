import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerFigurineBuildMesh, playerFigurineDispose } from '@/player/figurine/player_figurine_builder.js';
import {
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

describe('playerFigurineBuildMesh', () => {
  beforeAll(async () => {
    playerCharacterResetModelLoader();
    const modelPath = resolve(process.cwd(), 'src/player/assets/character.glb');
    const buffer = readFileSync(modelPath);
    await playerCharacterLoadModelFromArrayBuffer(buffer);
  });

  it('marks the figurine as a helper object', () => {
    const figurine = playerFigurineBuildMesh();
    expect(figurine.userData[PLAYER_FIGURINE_USERDATA_KEY]).toBe(true);
    expect(isEditorHelperObject(figurine)).toBe(true);
    playerFigurineDispose(figurine);
  });

  it('builds a skinned character mesh for the marker', () => {
    const figurine = playerFigurineBuildMesh();
    let skinnedCount = 0;
    let boneCount = 0;
    figurine.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) {
        skinnedCount += 1;
      }
      if (child instanceof THREE.Bone) {
        boneCount += 1;
      }
    });
    expect(skinnedCount).toBeGreaterThan(0);
    expect(boneCount).toBeGreaterThan(10);
    playerFigurineDispose(figurine);
  });
});
