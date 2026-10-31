import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { snapHingeRotatePoint } from '@/snap/solve/snap_hinge_rotation.js';
import { applySnapHingeRotation } from '@/snap/tool/snap_hinge_rotation_apply.js';

describe('hinge rotation', () => {
  it('swings a point about the hinge and keeps its radius', () => {
    const hinge = new THREE.Vector3(1, 2, 3);
    const direction = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3(4, 2, 3);
    const swung = snapHingeRotatePoint(point, hinge, direction, Math.PI / 2);
    expect(swung.distanceTo(new THREE.Vector3(1, 2, 0))).toBeLessThan(1e-6);
    expect(swung.distanceTo(hinge)).toBeCloseTo(point.distanceTo(hinge), 6);
  });

  it('rotates a scaled mesh about the hinge without changing scale', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(2, 0, 0);
    mesh.scale.set(1.25, 0.4, 1);
    mesh.updateMatrixWorld(true);
    const startScale = mesh.scale.clone();
    applySnapHingeRotation(
      mesh,
      mesh.position.clone(),
      mesh.quaternion.clone(),
      startScale,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    mesh.updateMatrixWorld(true);
    const worldPosition = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    expect(mesh.scale.distanceTo(startScale)).toBeLessThan(1e-6);
    expect(worldPosition.distanceTo(new THREE.Vector3(0, 2, 0))).toBeLessThan(1e-6);
  });
});
