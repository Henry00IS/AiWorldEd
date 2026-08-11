import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { playerCameraCapturePose, playerCameraRestorePose } from '@/player/camera/player_camera_snapshot.js';

describe('player camera pose snapshot', () => {
  it('restores the exact camera pose after mutation', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(4, 5, 6);
    camera.quaternion.setFromEuler(new THREE.Euler(0.2, 0.4, 0));
    camera.up.set(0, 1, 0);
    camera.updateMatrixWorld(true);
    const snapshot = playerCameraCapturePose(camera);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.up.set(0, 0, 1);
    playerCameraRestorePose(camera, snapshot);
    expect(camera.position.x).toBeCloseTo(4);
    expect(camera.position.y).toBeCloseTo(5);
    expect(camera.position.z).toBeCloseTo(6);
    expect(camera.up.y).toBeCloseTo(1);
  });
});
