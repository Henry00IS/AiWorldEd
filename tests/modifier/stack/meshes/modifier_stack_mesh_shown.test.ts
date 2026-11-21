import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ModifierStackMeshShown } from '@/modifier/stack/meshes/modifier_stack_mesh_shown.js';

/**
 * A shown generator mesh pinned to an anchor keeps its world pose relative to
 * that anchor however its parent moves, turns or stretches; unpinned it follows
 * its parent like any child.
 */

/**
 * Returns the largest element difference of two matrices.
 *
 * @param a First matrix.
 * @param b Second matrix.
 * @returns Largest absolute difference.
 */
function matrixDrift(a: THREE.Matrix4, b: THREE.Matrix4): number {
  return Math.max(...a.elements.map((value, index) => Math.abs(value - (b.elements[index] ?? 0))));
}

/**
 * Builds a world with an anchor and a moved, turned and stretched parent
 * holding a shown mesh.
 *
 * @returns World, anchor, parent and mesh.
 */
function pinnedFixture() {
  const world = new THREE.Group();
  const anchor = new THREE.Group();
  anchor.position.set(-2, 1, 0.5);
  const parent = new THREE.Group();
  parent.position.set(1, 2, 3);
  parent.rotation.set(0.2, 0.7, 0);
  parent.scale.set(16, 10, 13);
  world.add(anchor, parent);
  world.updateMatrixWorld(true);
  const mesh = new ModifierStackMeshShown(new THREE.BoxGeometry(1, 1, 1));
  parent.add(mesh);
  return { world, anchor, parent, mesh };
}

/** World pose the tests pin meshes at. */
const POSE = new THREE.Matrix4().compose(
  new THREE.Vector3(4, -1, 2),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0)),
  new THREE.Vector3(1, 1, 1),
);

describe('ModifierStackMeshShown', () => {
  it('stays at its pinned world pose while a stretched parent moves and turns', () => {
    const { world, parent, mesh, anchor } = pinnedFixture();
    mesh.pinTo(anchor, POSE);
    for (let step = 0; step < 5; step += 1) {
      parent.position.y -= 0.5;
      parent.rotation.y += 0.3;
      parent.rotation.z += 0.1;
      world.updateMatrixWorld(true);
      expect(matrixDrift(mesh.matrixWorld, POSE)).toBeLessThan(1e-9);
    }
  });

  it('stays put through updateWorldMatrix with parents, as bake and export read it', () => {
    const { parent, mesh, anchor } = pinnedFixture();
    mesh.pinTo(anchor, POSE);
    parent.position.x += 3;
    parent.rotation.x -= 0.6;
    mesh.updateWorldMatrix(true, false);
    expect(matrixDrift(mesh.matrixWorld, POSE)).toBeLessThan(1e-9);
  });

  it('moves with its anchor', () => {
    const { world, mesh, anchor } = pinnedFixture();
    mesh.pinTo(anchor, POSE);
    const offset = new THREE.Vector3(0.5, -3, 2);
    anchor.position.add(offset);
    world.updateMatrixWorld(true);
    const expected = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z).multiply(POSE);
    expect(matrixDrift(mesh.matrixWorld, expected)).toBeLessThan(1e-9);
    expect(mesh.pinnedAnchor()).toBe(anchor);
  });

  it('keeps the pin on a copy', () => {
    const { world, parent, mesh, anchor } = pinnedFixture();
    mesh.pinTo(anchor, POSE);
    const copy = mesh.clone();
    parent.add(copy);
    parent.rotation.y += 1.1;
    world.updateMatrixWorld(true);
    expect(copy.pinnedAnchor()).toBe(anchor);
    expect(matrixDrift(copy.matrixWorld, POSE)).toBeLessThan(1e-9);
  });

  it('follows its parent like any child when unpinned', () => {
    const { world, parent, mesh, anchor } = pinnedFixture();
    mesh.pinTo(anchor, POSE);
    mesh.pinTo(null, POSE);
    mesh.position.set(0.1, 0.2, 0.3);
    parent.position.y += 2;
    world.updateMatrixWorld(true);
    const expected = parent.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0.1, 0.2, 0.3));
    expect(matrixDrift(mesh.matrixWorld, expected)).toBeLessThan(1e-9);
    expect(mesh.pinnedAnchor()).toBeNull();
  });
});
