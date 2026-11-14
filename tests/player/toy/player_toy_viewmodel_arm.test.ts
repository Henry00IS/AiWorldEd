import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLAYER_TOY_ARM_FOREARM,
  PLAYER_TOY_ARM_SHOULDER,
  PLAYER_TOY_ARM_UPPER,
  PLAYER_TOY_ARM_WRIST,
  playerToyArmApply,
  playerToyArmBuild,
  playerToyArmGrip,
} from '@/player/toy/player_toy_viewmodel_arm.js';
import { PLAYER_TOY_POSE_SECONDS, playerToyPoseAt } from '@/player/toy/player_toy_viewmodel_pose.js';

/**
 * Builds an arm in a root at the view origin.
 *
 * @returns Root and joints.
 */
function arm(): { root: THREE.Group; rig: ReturnType<typeof playerToyArmBuild> } {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  const rig = playerToyArmBuild(material, material);
  root.add(rig.shoulder);
  return { root, rig };
}

/**
 * Returns a joint's position in view space.
 *
 * @param joint Joint.
 * @returns Position.
 */
function at(joint: THREE.Object3D): THREE.Vector3 {
  return joint.getWorldPosition(new THREE.Vector3());
}

describe('first-person arm', () => {
  it('chains shoulder, elbow, wrist, hand and grip so the joints keep their lengths in every pose', () => {
    const { root, rig } = arm();
    expect(rig.elbow.parent).toBe(rig.shoulder);
    expect(rig.wrist.parent).toBe(rig.elbow);
    expect(rig.hand.parent).toBe(rig.wrist);
    expect(rig.grip.parent).toBe(rig.hand);
    for (let t = -0.1; t <= PLAYER_TOY_POSE_SECONDS + 0.1; t += 0.02) {
      [false, true].forEach((down) => {
        playerToyArmApply(rig, playerToyPoseAt(t, down));
        root.updateMatrixWorld(true);
        expect(at(rig.shoulder).distanceTo(PLAYER_TOY_ARM_SHOULDER)).toBeCloseTo(0, 9);
        expect(at(rig.shoulder).distanceTo(at(rig.elbow))).toBeCloseTo(PLAYER_TOY_ARM_UPPER, 9);
        expect(at(rig.elbow).distanceTo(at(rig.wrist))).toBeCloseTo(PLAYER_TOY_ARM_FOREARM, 9);
        expect(at(rig.wrist).distanceTo(at(rig.hand))).toBeCloseTo(PLAYER_TOY_ARM_WRIST, 9);
      });
    }
  });

  it('fills the sleeve end with a skin joint the wrist cylinder grows from and holds the toy in the lower right at rest', () => {
    const { root, rig } = arm();
    const cylinder = (joint: THREE.Object3D): THREE.CylinderGeometry =>
      (
        joint.children.find(
          (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry,
        ) as THREE.Mesh
      ).geometry as THREE.CylinderGeometry;
    const ball = rig.wrist.children.find(
      (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry,
    ) as THREE.Mesh;
    const joint = (ball.geometry as THREE.SphereGeometry).parameters.radius;
    expect(ball.position.length()).toBe(0);
    expect(cylinder(rig.wrist).parameters.radiusBottom).toBeLessThan(joint);
    expect(cylinder(rig.wrist).parameters.radiusBottom).toBeGreaterThan(joint - 0.001);
    expect(joint).toBeLessThan(cylinder(rig.elbow).parameters.radiusTop);
    playerToyArmGrip(rig, 'tennis');
    playerToyArmApply(rig, playerToyPoseAt(-1, false));
    root.updateMatrixWorld(true);
    const grip = at(rig.grip);
    expect(grip.x).toBeGreaterThan(0.05);
    expect(grip.y).toBeLessThan(0);
    expect(grip.z).toBeLessThan(-0.2);
    const palmUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.hand.getWorldQuaternion(new THREE.Quaternion()));
    expect(palmUp.y).toBeGreaterThan(0.3);
  });
});
