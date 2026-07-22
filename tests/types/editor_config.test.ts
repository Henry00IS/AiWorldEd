import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_COMMAND_STACK_MAX_SIZE,
  DEFAULT_CUBE_CENTER_Y,
  DEFAULT_GRID_SNAP_INTERVAL,
  DEFAULT_ORTHO_HALF_EXTENT,
  DEFAULT_PERSPECTIVE_CAMERA_OFFSET
} from '../../src/types/editor_config.js';
import { SNAP_PRESETS } from '../../src/types/snap_presets.js';
import { CameraFramer } from '../../src/navigation/camera_framer.js';
import { BoundingVolumeComputer } from '../../src/navigation/bounding_volume_computer.js';
import {
  getDefaultPerspectiveCameraPosition,
  getDefaultSceneFocus
} from '../../src/navigation/default_camera_placement.js';

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

describe('editor_config', () => {
  it('should expose a positive command stack max size', () => {
    expect(DEFAULT_COMMAND_STACK_MAX_SIZE).toBeGreaterThan(0);
  });

  it('should use a default grid snap that exists in SNAP_PRESETS', () => {
    expect(SNAP_PRESETS).toContain(DEFAULT_GRID_SNAP_INTERVAL);
  });

  it('should place the default cube center above the ground plane', () => {
    expect(DEFAULT_CUBE_CENTER_Y).toBe(0.5);
  });
});

describe('default viewport framing constants', () => {
  it('should use an orthographic half-extent that keeps the unit cube large on screen', () => {
    const cubeHeight = 1;
    const visibleHeight = DEFAULT_ORTHO_HALF_EXTENT * 2;
    const screenFraction = cubeHeight / visibleHeight;
    expect(DEFAULT_ORTHO_HALF_EXTENT).toBeGreaterThan(0);
    expect(screenFraction).toBeGreaterThan(0.2);
    expect(screenFraction).toBeLessThan(0.75);
  });

  it('should place the perspective camera closer than the previous far default', () => {
    const previousOffset = 5;
    expect(DEFAULT_PERSPECTIVE_CAMERA_OFFSET).toBeGreaterThan(0);
    expect(DEFAULT_PERSPECTIVE_CAMERA_OFFSET).toBeLessThan(previousOffset);
  });

  it('should frame the default cube without pulling the perspective camera farther out', () => {
    const mesh = createDefaultCubeMesh();
    const computer = new BoundingVolumeComputer();
    const framer = new CameraFramer();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.copy(getDefaultPerspectiveCameraPosition());
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    camera.updateMatrixWorld(true);
    const box = computer.computeWorldBoundingBox([mesh]);
    const sphere = computer.computeBoundingSphere(box);
    const target = framer.computePerspectiveTarget(sphere, camera, 1.5);
    const startupDistance = camera.position.distanceTo(sphere.center);
    const fitDistance = target.targetPosition.distanceTo(target.targetLookAt);
    expect(startupDistance).toBeLessThanOrEqual(fitDistance * 1.35);
    expect(startupDistance).toBeGreaterThan(fitDistance * 0.4);
  });

  it('should keep orthographic startup zoom tighter than a loose scene overview', () => {
    const mesh = createDefaultCubeMesh();
    const computer = new BoundingVolumeComputer();
    const framer = new CameraFramer();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 50, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const box = computer.computeWorldBoundingBox([mesh]);
    const target = framer.computeOrthographicTarget(box, camera, 1.5);
    const fitHalfHeight = (target.top - target.bottom) / 2;
    expect(DEFAULT_ORTHO_HALF_EXTENT).toBeLessThanOrEqual(fitHalfHeight * 2.5);
    expect(DEFAULT_ORTHO_HALF_EXTENT).toBeGreaterThanOrEqual(fitHalfHeight * 0.5);
  });
});
