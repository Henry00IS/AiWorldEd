import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BoundsResizeCommand,
  BoundsResizeSnapshot
} from '../../src/commands/bounds_resize_command.js';

describe('BoundsResizeCommand', () => {
  it('should apply final position and scale on execute', () => {
    const mesh = createMesh();
    const snapshot = buildSnapshot(mesh);
    const command = new BoundsResizeCommand([snapshot]);
    command.execute();
    expect(mesh.position.x).toBeCloseTo(2, 5);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
  });

  it('should restore original position and scale on undo', () => {
    const mesh = createMesh();
    const snapshot = buildSnapshot(mesh);
    const command = new BoundsResizeCommand([snapshot]);
    command.execute();
    command.undo();
    expect(mesh.position.x).toBeCloseTo(0, 5);
    expect(mesh.scale.x).toBeCloseTo(1, 5);
  });

  it('should remain idempotent when execute is called twice', () => {
    const mesh = createMesh();
    const snapshot = buildSnapshot(mesh);
    const command = new BoundsResizeCommand([snapshot]);
    command.execute();
    command.execute();
    expect(mesh.position.x).toBeCloseTo(2, 5);
    expect(mesh.scale.x).toBeCloseTo(3, 5);
  });
});

/**
 * Creates a unit box mesh at the origin.
 * @returns A mesh for command tests.
 */
function createMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
}

/**
 * Builds a bounds resize snapshot with known original and final transforms.
 * @param mesh The mesh to snapshot.
 * @returns A BoundsResizeSnapshot for testing.
 */
function buildSnapshot(mesh: THREE.Mesh): BoundsResizeSnapshot {
  return {
    object: mesh,
    originalPosition: new THREE.Vector3(0, 0, 0),
    originalScale: new THREE.Vector3(1, 1, 1),
    finalPosition: new THREE.Vector3(2, 0, 0),
    finalScale: new THREE.Vector3(3, 1, 1)
  };
}
