import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_CHARACTER_LOOK_CHAIN,
  playerCharacterLookApply,
  playerCharacterLookDistribute,
} from '@/player/character/player_character_look.js';
import { PLAYER_CHARACTER_BONE, type PlayerCharacterBoneId } from '@/player/character/player_character_bone_ids.js';
import type { PlayerCharacterRig } from '@/player/character/player_character_rig.js';

const DEGREES = Math.PI / 180;

/**
 * Sums a field over the distributed joints.
 *
 * @param yaw Look yaw.
 * @param pitch Look pitch.
 * @returns Total yaw and pitch.
 */
function total(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return playerCharacterLookDistribute(yaw, pitch).reduce(
    (sum, joint) => ({ yaw: sum.yaw + joint.yaw, pitch: sum.pitch + joint.pitch }),
    { yaw: 0, pitch: 0 },
  );
}

/**
 * Builds a hips, spine, head chain with an eye marker in front of the head (the
 * character faces -Z, like the player body).
 *
 * @returns Rig and the eye.
 */
function chainRig(): { rig: PlayerCharacterRig; eye: THREE.Object3D } {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  const spine = new THREE.Bone();
  const head = new THREE.Bone();
  spine.position.set(0, 0.3, 0);
  head.position.set(0, 0.5, 0);
  spine.rotation.set(0.2, 0, 0.1);
  root.add(hips);
  hips.add(spine);
  spine.add(head);
  const eye = new THREE.Object3D();
  head.add(eye);
  eye.position.set(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
  root.rotation.y = 0.7;
  root.updateMatrixWorld(true);
  const bones = new Map<PlayerCharacterBoneId, THREE.Bone>([
    [PLAYER_CHARACTER_BONE.hips, hips],
    [PLAYER_CHARACTER_BONE.spine, spine],
    [PLAYER_CHARACTER_BONE.head, head],
  ]);
  return { rig: { root, bones, restLocalQuaternions: new Map() }, eye };
}

describe('playerCharacterLookDistribute', () => {
  it('leaves every joint at rest when looking ahead', () => {
    playerCharacterLookDistribute(0, 0).forEach((joint) => {
      expect(joint.yaw).toBe(0);
      expect(joint.pitch).toBe(0);
    });
  });

  it('splits a moderate look up 45/30/25 over head, neck and chest', () => {
    const joints = playerCharacterLookDistribute(0, 40 * DEGREES);
    expect(joints[0]?.pitch).toBeCloseTo(18 * DEGREES, 6);
    expect(joints[1]?.pitch).toBeCloseTo(12 * DEGREES, 6);
    expect(joints[2]?.pitch).toBeCloseTo(10 * DEGREES, 6);
    expect(joints[3]?.pitch).toBe(0);
  });

  it('bends the upper back (spine) to look straight up and down, every joint within its range', () => {
    [90, -90].forEach((degrees) => {
      const joints = playerCharacterLookDistribute(0, degrees * DEGREES);
      expect(total(0, degrees * DEGREES).pitch).toBeCloseTo(degrees * DEGREES, 6);
      expect(Math.abs(joints[2]?.pitch ?? 0)).toBeGreaterThanOrEqual(20 * DEGREES);
      joints.forEach((joint, index) => {
        const limits = PLAYER_CHARACTER_LOOK_CHAIN[index];
        expect(joint.pitch).toBeGreaterThanOrEqual((limits?.pitchDown ?? 0) - 1e-9);
        expect(joint.pitch).toBeLessThanOrEqual((limits?.pitchUp ?? 0) + 1e-9);
      });
    });
    expect(playerCharacterLookDistribute(0, 90 * DEGREES)[1]?.pitch).toBeCloseTo(37.5 * DEGREES, 6);
    expect(playerCharacterLookDistribute(0, -90 * DEGREES)[1]?.pitch).toBeCloseTo(-37.5 * DEGREES, 6);
  });

  it('clamps pitch beyond straight up or down', () => {
    expect(total(0, 3).pitch).toBeCloseTo(Math.PI / 2, 6);
    expect(total(0, -3).pitch).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('turns head and neck first (about 65 degrees) and only then chest and back', () => {
    const small = playerCharacterLookDistribute(60 * DEGREES, 0);
    expect(small[2]?.yaw).toBe(0);
    expect(small[3]?.yaw).toBe(0);
    const wide = playerCharacterLookDistribute(90 * DEGREES, 0);
    expect((wide[0]?.yaw ?? 0) + (wide[1]?.yaw ?? 0)).toBeCloseTo(65 * DEGREES, 6);
    expect(wide[2]?.yaw).toBeCloseTo(25 * DEGREES, 6);
  });

  it('caps an extreme look behind at the chain total, both ways', () => {
    expect(total(179 * DEGREES, 0).yaw).toBeCloseTo(115 * DEGREES, 6);
    expect(total(-179 * DEGREES, 0).yaw).toBeCloseTo(-115 * DEGREES, 6);
    expect(total(2 * Math.PI + 0.3, 0).yaw).toBeCloseTo(0.3, 6);
  });

  it('treats garbage as looking ahead', () => {
    [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].forEach((value) => {
      const sum = total(value, value);
      expect(sum.yaw).toBe(0);
      expect(sum.pitch).toBe(0);
    });
  });
});

describe('playerCharacterLookApply', () => {
  it('points the head where the member looks, relative to the turned body', () => {
    const cases: [number, number][] = [
      [0, 0],
      [0.5, 0],
      [-1, 0.3],
      [0.2, 1.2],
      [0, -1.2],
    ];
    cases.forEach(([yaw, pitch]) => {
      const { rig, eye } = chainRig();
      const head = rig.bones.get(PLAYER_CHARACTER_BONE.head) as THREE.Bone;
      playerCharacterLookApply(rig, playerCharacterLookDistribute(yaw, pitch));
      const forward = eye.getWorldPosition(new THREE.Vector3()).sub(head.getWorldPosition(new THREE.Vector3()));
      const expected = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      ).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
      expect(forward.normalize().distanceTo(expected)).toBeLessThan(1e-6);
    });
  });

  it('skips missing bones', () => {
    const rig: PlayerCharacterRig = { root: new THREE.Group(), bones: new Map(), restLocalQuaternions: new Map() };
    expect(() => playerCharacterLookApply(rig, playerCharacterLookDistribute(1, 1))).not.toThrow();
  });
});
