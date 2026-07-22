import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformDragSession } from '../../src/transform/transform_drag_session.js';

describe('TransformDragSession', () => {
  /**
   * Creates a mesh with a non-default transform for snapshot tests.
   * @returns A mesh with position, rotation, and scale set.
   */
  function createTransformedMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    mesh.position.set(1, 2, 3);
    mesh.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    mesh.scale.set(2, 3, 4);
    return mesh;
  }

  it('should start idle with empty snapshots', () => {
    const session = new TransformDragSession();
    expect(session.dragActive).toBe(false);
    expect(session.initialPositions.size).toBe(0);
    expect(session.dragScaleFactor).toBe(1);
  });

  it('should snapshot pre-drag transforms for selected meshes', () => {
    const session = new TransformDragSession();
    const mesh = createTransformedMesh();
    session.snapshotPreDragState([mesh]);
    const position = session.initialPositions.get(mesh);
    const scale = session.initialScales.get(mesh);
    expect(position?.equals(mesh.position)).toBe(true);
    expect(scale?.equals(mesh.scale)).toBe(true);
    mesh.position.set(9, 9, 9);
    expect(position?.equals(new THREE.Vector3(1, 2, 3))).toBe(true);
  });

  it('should reset drag accumulators without clearing snapshots', () => {
    const session = new TransformDragSession();
    const mesh = createTransformedMesh();
    session.snapshotPreDragState([mesh]);
    session.dragDeltaAccumulator.set(5, 5, 5);
    session.dragRotationAngle = 1.5;
    session.dragScaleFactor = 2;
    session.resetDragAccumulator();
    expect(session.dragDeltaAccumulator.length()).toBe(0);
    expect(session.dragRotationAngle).toBe(0);
    expect(session.dragScaleFactor).toBe(1);
    expect(session.initialPositions.has(mesh)).toBe(true);
  });

  it('should clear interaction targets after pointer up', () => {
    const session = new TransformDragSession();
    session.dragActive = true;
    session.isBoundsResize = true;
    session.boundsDeltaAlongNormal = 3;
    session.clearInteractionTargets();
    expect(session.dragActive).toBe(false);
    expect(session.isBoundsResize).toBe(false);
    expect(session.boundsDeltaAlongNormal).toBe(0);
    expect(session.activeHandle).toBeNull();
  });
});
