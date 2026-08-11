import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerLocomotionWallFootFrame } from '@/player/character/locomotion/player_locomotion_wall_foot_frame.js';
import { PLAYER_LOCOMOTION_GAIT } from '@/player/character/locomotion/player_locomotion_gait_config.js';

describe('PlayerLocomotionWallFootFrame', () => {
  it('places stance plants under the root along the wall left axis', () => {
    const root = new THREE.Object3D();
    root.position.set(2, 1, 3);
    root.updateMatrixWorld(true);
    const frame = new PlayerLocomotionWallFootFrame();
    expect(frame.rebuild(root, new THREE.Vector3(0, 0, -1))).toBe(true);
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    frame.writeStancePlantWorld(true, left);
    frame.writeStancePlantWorld(false, right);
    expect(left.y).toBeCloseTo(1 + PLAYER_LOCOMOTION_GAIT.footGroundYMeters, 5);
    expect(right.y).toBeCloseTo(1 + PLAYER_LOCOMOTION_GAIT.footGroundYMeters, 5);
    expect(left.z).toBeCloseTo(right.z, 5);
    expect(left.z).toBeCloseTo(3, 4);
    expect(left.x).toBeGreaterThan(right.x);
    const midX = (left.x + right.x) * 0.5;
    expect(midX).toBeCloseTo(2, 4);
  });

  it('keeps both plants near the root on angled walls', () => {
    const root = new THREE.Object3D();
    root.position.set(0, 0, 0);
    root.rotation.y = Math.PI * 0.25;
    root.updateMatrixWorld(true);
    const frame = new PlayerLocomotionWallFootFrame();
    expect(frame.rebuild(root, new THREE.Vector3(-1, 0, -1).normalize())).toBe(true);
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    frame.writeStancePlantWorld(true, left);
    frame.writeStancePlantWorld(false, right);
    expect(left.distanceTo(root.position)).toBeLessThan(0.25);
    expect(right.distanceTo(root.position)).toBeLessThan(0.25);
    expect(left.distanceTo(right)).toBeGreaterThan(PLAYER_LOCOMOTION_GAIT.stanceWidthMeters);
  });
});
