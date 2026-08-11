import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  playerCharacterIsModelReady,
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';
import { playerCharacterBuildRig, playerCharacterDisposeRig } from '@/player/character/player_character_rig.js';
import { PLAYER_CHARACTER_BONE } from '@/player/character/player_character_bone_ids.js';

describe('playerCharacterModelLoader', () => {
  afterEach(() => {
    playerCharacterResetModelLoader();
  });

  it('loads the bundled GLB and allows skinned rig clones', async () => {
    expect(playerCharacterIsModelReady()).toBe(false);
    const modelPath = resolve(process.cwd(), 'src/player/assets/character.glb');
    const buffer = readFileSync(modelPath);
    await playerCharacterLoadModelFromArrayBuffer(buffer);
    expect(playerCharacterIsModelReady()).toBe(true);
    const first = playerCharacterBuildRig();
    const second = playerCharacterBuildRig();
    expect(first.root).not.toBe(second.root);
    expect(first.bones.get(PLAYER_CHARACTER_BONE.spine)).toBeTruthy();
    expect(second.bones.get(PLAYER_CHARACTER_BONE.spine)).toBeTruthy();
    expect(first.bones.get(PLAYER_CHARACTER_BONE.hipLeft)).toBeTruthy();
    expect(first.bones.get(PLAYER_CHARACTER_BONE.shoulderRight)).toBeTruthy();
    playerCharacterDisposeRig(first.root);
    playerCharacterDisposeRig(second.root);
  });
});
