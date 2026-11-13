import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLAYER_CHARACTER_ROOM_TINT } from '@/player/character/player_character_tint.js';
import { PlayerCharacterAvatar } from '@/player/character/player_character_avatar.js';
import {
  playerCharacterEnsureModelLoaded,
  playerCharacterGetPreparedTemplate,
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';
const MODEL_PATH = resolve(process.cwd(), 'src/player/assets/character.glb');

describe('PlayerCharacterAvatar room color', () => {
  let worldRoot: THREE.Object3D;
  let avatar: PlayerCharacterAvatar;

  beforeEach(async () => {
    playerCharacterResetModelLoader();
    await playerCharacterLoadModelFromArrayBuffer(readFileSync(MODEL_PATH));
    worldRoot = new THREE.Object3D();
    avatar = new PlayerCharacterAvatar(worldRoot);
  });

  afterEach(() => {
    avatar.dispose();
    playerCharacterResetModelLoader();
  });

  it('keeps the default body and face colors before a room color is set', async () => {
    await ready(avatar);
    avatar.attach();
    expect(meshColors(avatarRoot(worldRoot))).toEqual(defaultColors());
  });

  it('tints toward the room color the same way remote characters do', async () => {
    await ready(avatar);
    avatar.attach();
    const roomColor = 0xff0000;
    avatar.setRoomColor(roomColor);
    expect(meshColors(avatarRoot(worldRoot))).toEqual(tintedColors(roomColor));
  });

  it('leaves the shared template materials unchanged', async () => {
    const template = playerCharacterGetPreparedTemplate();
    expect(template).toBeTruthy();
    const before = meshColors(template as THREE.Object3D);
    await ready(avatar);
    avatar.setRoomColor(0x00ff00);
    expect(meshColors(template as THREE.Object3D)).toEqual(before);
  });

  it('restores the default colors when the room color is cleared', async () => {
    await ready(avatar);
    avatar.attach();
    avatar.setRoomColor(0xff0000);
    avatar.setRoomColor(null);
    expect(meshColors(avatarRoot(worldRoot))).toEqual(defaultColors());
  });

  it('retints from the default when the room color changes mid-session', async () => {
    await ready(avatar);
    avatar.attach();
    avatar.setRoomColor(0xff0000);
    avatar.setRoomColor(0x0044ff);
    expect(meshColors(avatarRoot(worldRoot))).toEqual(tintedColors(0x0044ff));
  });

  it('applies a room color that was set before the mesh rig was ready', async () => {
    const lateRoot = new THREE.Object3D();
    const late = new PlayerCharacterAvatar(lateRoot);
    late.setRoomColor(0x00aaff);
    await ready(late);
    late.attach();
    expect(meshColors(avatarRoot(lateRoot))).toEqual(tintedColors(0x00aaff));
    late.dispose();
  });
});

/**
 * Waits until the avatar has built its mesh rig.
 *
 * @param avatar Avatar under test.
 */
async function ready(_avatar: PlayerCharacterAvatar): Promise<void> {
  await playerCharacterEnsureModelLoaded();
  await Promise.resolve();
}

/**
 * Returns the attached character root.
 *
 * @param worldRoot Scene root the avatar was constructed with.
 * @returns Character root.
 */
function avatarRoot(worldRoot: THREE.Object3D): THREE.Object3D {
  const root = worldRoot.children.find((child) => child.name === 'PlayerCharacterAvatar');
  if (!root) {
    throw new Error('Player character root is missing');
  }
  return root;
}

/**
 * Collects material colors under a root, in traverse order.
 *
 * @param root Object tree.
 * @returns Hex colors.
 */
function meshColors(root: THREE.Object3D): number[] {
  const colors: number[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const colored = material as THREE.Material & { color?: THREE.Color };
      if (colored.color instanceof THREE.Color) {
        colors.push(colored.color.getHex());
      }
    }
  });
  return colors;
}

/**
 * Returns the untinted default body and face colors in traverse order of a
 * freshly built avatar.
 *
 * @returns Hex colors.
 */
function defaultColors(): number[] {
  const template = playerCharacterGetPreparedTemplate();
  if (!template) {
    throw new Error('Character template is missing');
  }
  return meshColors(template);
}

/**
 * Returns the default colors tinted toward a room color.
 *
 * @param roomColor Member color.
 * @returns Hex colors.
 */
function tintedColors(roomColor: number): number[] {
  return defaultColors().map((base) =>
    new THREE.Color(base).lerp(new THREE.Color(roomColor), PLAYER_CHARACTER_ROOM_TINT).getHex(),
  );
}
