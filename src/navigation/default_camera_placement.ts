import * as THREE from 'three';
import {
  DEFAULT_CUBE_CENTER_Y,
  DEFAULT_PERSPECTIVE_CAMERA_OFFSET
} from '../types/editor_config.js';

/**
 * Returns the world-space point cameras should frame on startup.
 * Matches the default unit cube center (box sitting on the ground).
 * @returns A new vector at the default focus location.
 */
export function getDefaultSceneFocus(): THREE.Vector3 {
  return new THREE.Vector3(0, DEFAULT_CUBE_CENTER_Y, 0);
}

/**
 * Returns the default perspective camera world position.
 * Raised by the cube center height so look-at stays on the cube.
 * @returns A new vector on the elevated (1,1,1) diagonal.
 */
export function getDefaultPerspectiveCameraPosition(): THREE.Vector3 {
  const offset = DEFAULT_PERSPECTIVE_CAMERA_OFFSET;
  const focusY = DEFAULT_CUBE_CENTER_Y;
  return new THREE.Vector3(offset, offset + focusY, offset);
}

/**
 * Returns the front (XY) orthographic camera world position.
 * Elevated so the default cube sits in the vertical center of the view.
 * @param distance Distance along +Z from the focus point.
 * @returns A new camera position vector.
 */
export function getDefaultFrontCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(0, DEFAULT_CUBE_CENTER_Y, distance);
}

/**
 * Returns the side (YZ) orthographic camera world position.
 * Elevated so the default cube sits in the vertical center of the view.
 * @param distance Distance along +X from the focus point.
 * @returns A new camera position vector.
 */
export function getDefaultSideCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(distance, DEFAULT_CUBE_CENTER_Y, 0);
}

/**
 * Returns the top (XZ) orthographic camera world position.
 * @param distance Distance along +Y from the origin.
 * @returns A new camera position vector.
 */
export function getDefaultTopCameraPosition(distance: number = 50): THREE.Vector3 {
  return new THREE.Vector3(0, distance, 0);
}
