import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  areBoundsInsideCameraFrustum,
  fitCaptureCameraToBounds,
  fitCaptureCameraToMeshes,
} from '@/viewports/capture/offscreen_capture_fit.js';

/** Unit tests for capture framing (editor-style fit + frustum verification). */
describe('offscreen_capture_fit', () => {
  it('centers lookAt on the mesh AABB and keeps all corners on-screen', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1));
    mesh.position.set(10, 1, -3);
    mesh.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
    const fit = fitCaptureCameraToMeshes(camera, [mesh], 'iso', 1.2, undefined);
    expect(fit.lookAt.x).toBeCloseTo(10, 3);
    expect(fit.lookAt.y).toBeCloseTo(1, 3);
    expect(fit.lookAt.z).toBeCloseTo(-3, 3);
    camera.position.copy(fit.position);
    camera.up.copy(fit.up);
    camera.lookAt(fit.lookAt);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(areBoundsInsideCameraFrustum(camera, bounds, 0.95)).toBe(true);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toTarget = fit.lookAt.clone().sub(fit.position).normalize();
    expect(forward.dot(toTarget)).toBeGreaterThan(0.999);
    mesh.geometry.dispose();
  });

  it('front view keeps a wide wall fully inside the frustum', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.5));
    mesh.position.set(0, 2, 0);
    mesh.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
    const fit = fitCaptureCameraToMeshes(camera, [mesh], 'front', 1.2, undefined);
    expect(fit.position.z).toBeGreaterThan(fit.lookAt.z);
    camera.position.copy(fit.position);
    camera.up.copy(fit.up);
    camera.lookAt(fit.lookAt);
    camera.aspect = 1;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(areBoundsInsideCameraFrustum(camera, bounds, 0.95)).toBe(true);
    mesh.geometry.dispose();
  });

  it('pulls the camera back when initial fit is still too tight', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
    const fit = fitCaptureCameraToBounds(camera, bounds, 'iso', 1, undefined);
    camera.position.copy(fit.position);
    camera.up.copy(fit.up);
    camera.lookAt(fit.lookAt);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    expect(areBoundsInsideCameraFrustum(camera, bounds, 0.92)).toBe(true);
  });
});
