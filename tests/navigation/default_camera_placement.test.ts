import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  getDefaultFrontCameraPosition,
  getDefaultPerspectiveCameraPosition,
  getDefaultSceneFocus,
  getDefaultSideCameraPosition,
  getDefaultTopCameraPosition
} from '../../src/navigation/default_camera_placement.js';
import {
  DEFAULT_CUBE_CENTER_Y,
  DEFAULT_PERSPECTIVE_CAMERA_OFFSET
} from '../../src/types/editor_config.js';

/**
 * Projects a world point into orthographic camera view space.
 * @param camera The orthographic camera defining view space.
 * @param worldPoint The world-space point to project.
 * @returns View-space coordinates of the point.
 */
function projectToViewSpace(
  camera: THREE.OrthographicCamera,
  worldPoint: THREE.Vector3
): THREE.Vector3 {
  camera.updateMatrixWorld(true);
  return worldPoint.clone().applyMatrix4(camera.matrixWorldInverse);
}

/**
 * Builds a unit box matching the editor default cube placement.
 * @returns A mesh with size 1 centered above the ground plane.
 */
function createDefaultCubeMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.copy(getDefaultSceneFocus());
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('default_camera_placement', () => {
  it('should focus on the default cube center height', () => {
    const focus = getDefaultSceneFocus();
    expect(focus.x).toBe(0);
    expect(focus.y).toBe(DEFAULT_CUBE_CENTER_Y);
    expect(focus.z).toBe(0);
  });

  it('should raise the perspective camera above the diagonal offset', () => {
    const position = getDefaultPerspectiveCameraPosition();
    const offset = DEFAULT_PERSPECTIVE_CAMERA_OFFSET;
    expect(position.x).toBe(offset);
    expect(position.y).toBe(offset + DEFAULT_CUBE_CENTER_Y);
    expect(position.z).toBe(offset);
  });

  it('should elevate front and side cameras to the cube center height', () => {
    expect(getDefaultFrontCameraPosition().y).toBe(DEFAULT_CUBE_CENTER_Y);
    expect(getDefaultSideCameraPosition().y).toBe(DEFAULT_CUBE_CENTER_Y);
    expect(getDefaultTopCameraPosition().y).toBe(50);
  });

  it('should center the default cube in front orthographic view space', () => {
    const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 1000);
    camera.position.copy(getDefaultFrontCameraPosition());
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    const cubeCenter = createDefaultCubeMesh().position;
    const view = projectToViewSpace(camera, cubeCenter);
    expect(view.x).toBeCloseTo(0, 5);
    expect(view.y).toBeCloseTo(0, 5);
  });

  it('should center the default cube in side orthographic view space', () => {
    const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 1000);
    camera.position.copy(getDefaultSideCameraPosition());
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    const cubeCenter = createDefaultCubeMesh().position;
    const view = projectToViewSpace(camera, cubeCenter);
    expect(view.x).toBeCloseTo(0, 5);
    expect(view.y).toBeCloseTo(0, 5);
  });

  it('should aim the perspective camera at the default cube center', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.copy(getDefaultPerspectiveCameraPosition());
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    camera.updateMatrixWorld(true);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toFocus = focus.clone().sub(camera.position).normalize();
    expect(forward.dot(toFocus)).toBeCloseTo(1, 5);
    expect(camera.position.y).toBeGreaterThan(DEFAULT_PERSPECTIVE_CAMERA_OFFSET);
  });
});
