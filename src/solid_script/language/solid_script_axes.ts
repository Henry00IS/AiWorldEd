import * as THREE from 'three';

/**
 * Script space is the editor's: X points right, Y up and Z toward the front
 * (toward the viewer), in metres. Scripts, generators and the editor share it,
 * so a script point is an editor point.
 */
export const SOLID_SCRIPT_AXES_UP = Object.freeze(new THREE.Vector3(0, 1, 0));

/** Direction each Facing word names, in script space. */
export const SOLID_SCRIPT_AXES_FACING: Readonly<Record<string, THREE.Vector3>> = {
  Up: new THREE.Vector3(0, 1, 0),
  Down: new THREE.Vector3(0, -1, 0),
  Left: new THREE.Vector3(-1, 0, 0),
  Right: new THREE.Vector3(1, 0, 0),
  Front: new THREE.Vector3(0, 0, 1),
  Back: new THREE.Vector3(0, 0, -1),
};

/**
 * Lays a flat drawing on the ground: a drawing point (x, y) with a height h
 * lands at (x, h, -y), so the drawing's Y runs to the back and its height up.
 * Linear Extrude and Rotate Extrude lift every flat shape through it.
 */
export const SOLID_SCRIPT_AXES_FLAT = Object.freeze(
  new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1),
);

/**
 * Returns the height of a point or direction: how far it is up.
 *
 * @param vector Point or direction.
 * @returns Height.
 */
export function solidScriptAxesHeight(vector: THREE.Vector3): number {
  return vector.dot(SOLID_SCRIPT_AXES_UP);
}
