import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPlayerCharacterIkScratch,
  playerCharacterSolveTwoBoneIk,
} from '@/player/character/player_character_two_bone_ik.js';

/**
 * Builds a simple Y-down leg chain under a root.
 *
 * @returns Upper, lower, end bones and root.
 */
function createDownLeg(): {
  root: THREE.Object3D;
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  end: THREE.Object3D;
} {
  const root = new THREE.Object3D();
  const upper = new THREE.Object3D();
  const lower = new THREE.Object3D();
  const end = new THREE.Object3D();
  root.add(upper);
  upper.add(lower);
  lower.add(end);
  lower.position.set(0, -0.4, 0);
  end.position.set(0, -0.4, 0);
  root.updateMatrixWorld(true);
  return { root, upper, lower, end };
}

describe('playerCharacterSolveTwoBoneIk', () => {
  it('moves the tip closer to a reachable target', () => {
    const { root, upper, lower, end } = createDownLeg();
    const target = new THREE.Vector3(0.15, -0.55, 0.2);
    const foldHint = new THREE.Vector3(0, -0.2, 0.5);
    const before = new THREE.Vector3();
    end.getWorldPosition(before);
    const beforeDistance = before.distanceTo(target);
    playerCharacterSolveTwoBoneIk(upper, lower, end, target, foldHint, createPlayerCharacterIkScratch());
    root.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    end.getWorldPosition(after);
    expect(after.distanceTo(target)).toBeLessThan(beforeDistance);
    expect(after.distanceTo(target)).toBeLessThan(0.15);
  });

  it('only rotates bones and never writes positions', () => {
    const { upper, lower, end } = createDownLeg();
    const lowerPos = lower.position.clone();
    const endPos = end.position.clone();
    playerCharacterSolveTwoBoneIk(
      upper,
      lower,
      end,
      new THREE.Vector3(0.2, -0.5, 0.1),
      new THREE.Vector3(0, 0, 0.5),
      createPlayerCharacterIkScratch(),
    );
    expect(lower.position.equals(lowerPos)).toBe(true);
    expect(end.position.equals(endPos)).toBe(true);
  });

  it('supports +Y limb axes used by authored character rigs', () => {
    const upper = new THREE.Object3D();
    const lower = new THREE.Object3D();
    const end = new THREE.Object3D();
    upper.add(lower);
    lower.add(end);
    lower.position.set(0, 0.4, 0);
    end.position.set(0, 0.4, 0);
    const root = new THREE.Object3D();
    root.add(upper);
    root.updateMatrixWorld(true);
    const before = upper.quaternion.clone();
    playerCharacterSolveTwoBoneIk(
      upper,
      lower,
      end,
      new THREE.Vector3(0.25, 0.45, 0.1),
      new THREE.Vector3(0, 0.2, 0.4),
      createPlayerCharacterIkScratch(),
    );
    expect(upper.quaternion.equals(before)).toBe(false);
  });

  it('folds the mid joint toward the fold hint, not away from it', () => {
    const { root, upper, lower, end } = createDownLeg();
    const target = new THREE.Vector3(0, -0.5, 0.25);
    const foldHintLeft = new THREE.Vector3(0.4, -0.3, 0.1);
    playerCharacterSolveTwoBoneIk(upper, lower, end, target, foldHintLeft, createPlayerCharacterIkScratch());
    root.updateMatrixWorld(true);
    const midLeft = new THREE.Vector3();
    lower.getWorldPosition(midLeft);

    upper.quaternion.identity();
    lower.quaternion.identity();
    end.quaternion.identity();
    root.updateMatrixWorld(true);
    const foldHintRight = new THREE.Vector3(-0.4, -0.3, 0.1);
    playerCharacterSolveTwoBoneIk(upper, lower, end, target, foldHintRight, createPlayerCharacterIkScratch());
    root.updateMatrixWorld(true);
    const midRight = new THREE.Vector3();
    lower.getWorldPosition(midRight);
    expect(midLeft.x).toBeGreaterThan(midRight.x);
  });

  it('keeps the mid joint near the sagittal fold plane for a forward pole', () => {
    const { root, upper, lower, end } = createDownLeg();
    const target = new THREE.Vector3(0.02, -0.55, 0.2);
    const foldHint = new THREE.Vector3(0.02, -0.15, 0.55);
    playerCharacterSolveTwoBoneIk(upper, lower, end, target, foldHint, createPlayerCharacterIkScratch());
    root.updateMatrixWorld(true);
    const hip = new THREE.Vector3();
    const knee = new THREE.Vector3();
    const foot = new THREE.Vector3();
    upper.getWorldPosition(hip);
    lower.getWorldPosition(knee);
    end.getWorldPosition(foot);
    const thigh = knee.clone().sub(hip);
    const shin = foot.clone().sub(knee);
    const planeNormal = new THREE.Vector3().crossVectors(thigh, shin);
    if (planeNormal.lengthSq() > 1e-8) {
      planeNormal.normalize();
      // Hinge plane should be near the character lateral axis (mostly X), not facing forward.
      expect(Math.abs(planeNormal.x)).toBeGreaterThan(Math.abs(planeNormal.z));
    }
    expect(Math.abs(knee.x - hip.x)).toBeLessThan(0.12);
  });
});
