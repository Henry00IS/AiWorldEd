import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BoundsFace } from '../../../src/types/bounds_face.js';
import {
  cursorFromScreenDelta,
  resolveBoundsResizeCursor,
} from '../../../src/transform/bounds/bounds_resize_cursor.js';
import type { OrientedBoundsData } from '../../../src/transform/bounds/oriented_bounds.js';

describe('bounds resize cursor', () => {
  it('maps axis-aligned screen deltas to dual-arrow CSS cursors', () => {
    expect(cursorFromScreenDelta(1, 0)).toBe('ew-resize');
    expect(cursorFromScreenDelta(0, 1)).toBe('ns-resize');
    expect(cursorFromScreenDelta(1, 1)).toBe('nwse-resize');
    expect(cursorFromScreenDelta(1, -1)).toBe('nesw-resize');
  });

  it('uses axis-aligned cursors in orthographic top view for unrotated bounds', () => {
    const bounds = unitBounds();
    const camera = createTopOrthoCamera();
    expect(resolveBoundsResizeCursor(BoundsFace.POS_X, bounds, camera, 'xz')).toBe('ew-resize');
    expect(resolveBoundsResizeCursor(BoundsFace.POS_Z, bounds, camera, 'xz')).toBe('ns-resize');
    expect(resolveBoundsResizeCursor(BoundsFace.POS_Y, bounds, camera, 'xz')).toBe('default');
  });

  it('uses axis-aligned cursors in orthographic front view for unrotated bounds', () => {
    const bounds = unitBounds();
    const camera = createFrontOrthoCamera();
    expect(resolveBoundsResizeCursor(BoundsFace.POS_X, bounds, camera, 'xy')).toBe('ew-resize');
    expect(resolveBoundsResizeCursor(BoundsFace.POS_Y, bounds, camera, 'xy')).toBe('ns-resize');
  });

  it('uses diagonal cursors in top view when the OBB is rotated 45 degrees', () => {
    // Yaw 45°: local +X faces toward world +X/+Z (up-right on a top map with Z up).
    const bounds: OrientedBoundsData = {
      center: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4),
      halfExtents: new THREE.Vector3(1, 1, 1),
    };
    const camera = createTopOrthoCamera();
    const posX = resolveBoundsResizeCursor(BoundsFace.POS_X, bounds, camera, 'xz');
    const negX = resolveBoundsResizeCursor(BoundsFace.NEG_X, bounds, camera, 'xz');
    expect(['nwse-resize', 'nesw-resize']).toContain(posX);
    expect(['nwse-resize', 'nesw-resize']).toContain(negX);
    // Opposite faces pull opposite directions but same diagonal family.
    expect(posX).toBe(negX);
  });

  it('resolves a horizontal cursor for a +X face from a side-looking perspective camera', () => {
    const bounds = unitBounds();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(5, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const cursor = resolveBoundsResizeCursor(BoundsFace.POS_X, bounds, camera, 'xyz');
    expect(['ew-resize', 'ns-resize', 'nwse-resize', 'nesw-resize', 'default']).toContain(cursor);
  });
});

/**
 * Builds a unit OBB at the origin.
 *
 * @returns Oriented bounds data.
 */
function unitBounds(): OrientedBoundsData {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(1, 1, 1),
  };
}

/**
 * Top orthographic camera looking down −Y (X right, Z up on screen).
 *
 * @returns Configured orthographic camera.
 */
function createTopOrthoCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Front orthographic camera looking along −Z (X right, Y up on screen).
 *
 * @returns Configured orthographic camera.
 */
function createFrontOrthoCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}
