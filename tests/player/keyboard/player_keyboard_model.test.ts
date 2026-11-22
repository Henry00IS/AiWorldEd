import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLAYER_KEYBOARD_KEY_COUNT } from '@/player/keyboard/player_keyboard_constants.js';
import { PlayerKeyboardModel } from '@/player/keyboard/player_keyboard_model.js';

const AXES = ['x', 'y', 'z'] as const;

/**
 * Returns the world boxes of the model's unrotated meshes.
 *
 * @param model Keyboard model.
 * @returns Boxes in traversal order.
 */
function unrotatedBoxes(model: PlayerKeyboardModel): THREE.Box3[] {
  model.root.updateMatrixWorld(true);
  const boxes: THREE.Box3[] = [];
  model.root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.rotation.equals(new THREE.Euler()))
      boxes.push(new THREE.Box3().setFromObject(child));
  });
  return boxes;
}

/**
 * Returns the faces where two boxes share a same-facing plane over an area
 * (those z-fight).
 *
 * @param a First box.
 * @param b Second box.
 * @returns Clashing faces as side and axis.
 */
function sharedFaces(a: THREE.Box3, b: THREE.Box3): string[] {
  return AXES.flatMap((axis) =>
    (['min', 'max'] as const)
      .filter((side) => Math.abs(a[side][axis] - b[side][axis]) <= 1e-7)
      .filter(() =>
        AXES.filter((other) => other !== axis).every(
          (other) => Math.min(a.max[other], b.max[other]) - Math.max(a.min[other], b.min[other]) > 1e-7,
        ),
      )
      .map((side) => `${side} ${axis}`),
  );
}

/**
 * Lists the overlapping same-facing coplanar faces of the model's unrotated
 * boxes, as mesh index pairs with the side and axis.
 *
 * @param model Keyboard model.
 * @returns Clashing face descriptions.
 */
function coplanarFaces(model: PlayerKeyboardModel): string[] {
  const boxes = unrotatedBoxes(model);
  return boxes.flatMap((a, i) =>
    boxes.slice(i + 1).flatMap((b, offset) => sharedFaces(a, b).map((face) => `${i}/${i + offset + 1} ${face}`)),
  );
}

describe('PlayerKeyboardModel', () => {
  it('has no overlapping coplanar faces at rest or with every key held, and crossed legs never share a face plane', () => {
    const model = new PlayerKeyboardModel(0xff0000);
    model.place(new THREE.Vector3(), 0);
    expect(coplanarFaces(model)).toEqual([]);
    model.setHeld(new Set(Array.from({ length: PLAYER_KEYBOARD_KEY_COUNT }, (_, index) => index)));
    expect(coplanarFaces(model)).toEqual([]);
    const legs = model.root.children.filter((child) => child.rotation.z !== 0).map((leg) => leg.position.z);
    expect(new Set(legs).size).toBe(legs.length);
    model.dispose();
  });
});
