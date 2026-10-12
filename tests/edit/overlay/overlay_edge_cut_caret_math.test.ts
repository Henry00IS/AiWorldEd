import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeEdgeCutCaretWorldEnds } from '@/edit/overlay/overlay_edge_cut_caret_math.js';

describe('overlay_edge_cut_caret_math', () => {
  it('places the caret across the edge in the camera view plane', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const worldPoint = new THREE.Vector3(0, 0, 0);
    const edgeDirection = new THREE.Vector3(1, 0, 0);
    const ends = computeEdgeCutCaretWorldEnds(worldPoint, edgeDirection, camera);
    const caret = ends.end.clone().sub(ends.start);
    expect(caret.length()).toBeGreaterThan(0);
    expect(Math.abs(caret.normalize().dot(edgeDirection))).toBeLessThan(1e-4);
    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(Math.abs(caret.dot(cameraForward))).toBeLessThan(1e-4);
  });
});
