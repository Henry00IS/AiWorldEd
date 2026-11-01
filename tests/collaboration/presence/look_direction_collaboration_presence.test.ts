import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CharacterCollaborationPresence,
  type CharacterCollaborationModel,
} from '@/collaboration/presence/character_collaboration_presence.js';
import {
  lookCollaborationPresenceEncode,
  lookCollaborationPresenceFlags,
} from '@/collaboration/presence/look_collaboration_presence.js';
import { PRESENCE_ID_CHARACTER } from '@/collaboration/shared/presence_frame.js';
import { PlayerLookState } from '@/player/look/player_look_state.js';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from '@/player/character/player_character_bone_ids.js';
import { playerCharacterBuildRig, type PlayerCharacterRig } from '@/player/character/player_character_rig.js';
import {
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';

const DEGREES = Math.PI / 180;

beforeAll(async () => {
  playerCharacterResetModelLoader();
  await playerCharacterLoadModelFromArrayBuffer(
    readFileSync(resolve(process.cwd(), 'src/player/assets/character.glb')),
  );
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Each bone's own axis that points along the character's facing (+Z) at rest.
 *
 * @returns Local forward axis per bone.
 */
function restForward(): Map<PlayerCharacterBoneId, THREE.Vector3> {
  const rig = playerCharacterBuildRig();
  rig.root.updateMatrixWorld(true);
  const axes = new Map<PlayerCharacterBoneId, THREE.Vector3>();
  rig.bones.forEach((bone, id) => {
    const inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    axes.set(id, new THREE.Vector3(0, 0, 1).applyQuaternion(inverse));
  });
  return axes;
}

/**
 * Shows a remote member who looks with the given camera angles, sent the way
 * the play-mode sampler sends them, and returns where the head and chest
 * point.
 *
 * @param bodyYaw Body facing yaw.
 * @param pitch Camera pitch (positive toward +Y).
 * @returns World forward of the head bone and of the chest (spine) bone, plus
 *   the camera's own look direction.
 */
function remoteLook(
  bodyYaw: number,
  pitch: number,
): { head: THREE.Vector3; chest: THREE.Vector3; camera: THREE.Vector3 } {
  const camera = new PlayerLookState(bodyYaw, pitch).copyLookForwardTo(new THREE.Vector3());
  let rig: PlayerCharacterRig | null = null;
  const model: CharacterCollaborationModel = {
    ready: () => true,
    load: () => Promise.resolve(),
    build: () => (rig = playerCharacterBuildRig()),
  };
  const character = new CharacterCollaborationPresence('Bea', 0x44aaff, model, () => undefined);
  const q = lookCollaborationPresenceEncode(bodyYaw, bodyYaw, pitch, new THREE.Quaternion());
  const flags = lookCollaborationPresenceFlags({ grounded: true, wallPushing: false, running: false });
  for (let now = 0; now <= 1000; now += 1000 / 60) {
    character.target(
      { id: PRESENCE_ID_CHARACTER, position: [0, 0, 0], quaternion: [q.x, q.y, q.z, q.w], fov: flags },
      now,
    );
    character.update(now);
  }
  character.object.updateMatrixWorld(true);
  const axes = restForward();
  const forward = (id: PlayerCharacterBoneId): THREE.Vector3 => {
    const bone = (rig as PlayerCharacterRig | null)?.bones.get(id) as THREE.Bone;
    return (axes.get(id) as THREE.Vector3).clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
  };
  return { head: forward(PLAYER_CHARACTER_BONE.head), chest: forward(PLAYER_CHARACTER_BONE.spine), camera };
}

describe('remote character look direction', () => {
  it('bends the head and chest upward when the member looks up', () => {
    [0, 1.1, -2.4].forEach((bodyYaw) => {
      const look = remoteLook(bodyYaw, 60 * DEGREES);
      expect(look.camera.y).toBeGreaterThan(0.8);
      expect(look.head.y).toBeGreaterThan(0.7);
      expect(look.chest.y).toBeGreaterThan(0.2);
      expect(look.head.angleTo(look.camera)).toBeLessThan(20 * DEGREES);
    });
  });

  it('bends the head and chest downward when the member looks down', () => {
    [0, 1.1, -2.4].forEach((bodyYaw) => {
      const look = remoteLook(bodyYaw, -60 * DEGREES);
      expect(look.camera.y).toBeLessThan(-0.8);
      expect(look.head.y).toBeLessThan(-0.7);
      expect(look.chest.y).toBeLessThan(-0.2);
      expect(look.head.angleTo(look.camera)).toBeLessThan(20 * DEGREES);
    });
  });

  it('keeps the head level and facing the body when looking straight ahead', () => {
    const look = remoteLook(0.8, 0);
    expect(Math.abs(look.head.y)).toBeLessThan(0.2);
    expect(look.head.angleTo(look.camera)).toBeLessThan(15 * DEGREES);
  });
});
