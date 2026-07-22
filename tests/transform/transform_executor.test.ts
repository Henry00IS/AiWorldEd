import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { TransformExecutor } from '../../src/transform/transform_executor.js';

describe('TransformExecutor.computePivot', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should return origin for empty object list', () => {
    const pivot = executor.computePivot([]);
    expect(pivot.x).toBe(0);
    expect(pivot.y).toBe(0);
    expect(pivot.z).toBe(0);
  });

  it('should return single object position as pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(5, 10, 15);
    const pivot = executor.computePivot([mesh]);
    expect(pivot.x).toBe(5);
    expect(pivot.y).toBe(10);
    expect(pivot.z).toBe(15);
  });

  it('should compute bounding box center for multiple objects with geometry', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh1.position.set(0, 0, 0);
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh2.position.set(10, 10, 10);
    const pivot = executor.computePivot([mesh1, mesh2]);
    expect(pivot.x).toBeCloseTo(5, 1);
    expect(pivot.y).toBeCloseTo(5, 1);
    expect(pivot.z).toBeCloseTo(5, 1);
  });
});

describe('TransformExecutor.executeTranslation', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should translate objects by delta', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    executor.executeTranslation([mesh], new THREE.Vector3(1, 2, 3));
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
  });

  it('should translate multiple objects', () => {
    const mesh1 = new THREE.Mesh();
    mesh1.position.set(0, 0, 0);
    const mesh2 = new THREE.Mesh();
    mesh2.position.set(10, 10, 10);
    executor.executeTranslation([mesh1, mesh2], new THREE.Vector3(5, 5, 5));
    expect(mesh1.position.x).toBe(5);
    expect(mesh1.position.y).toBe(5);
    expect(mesh1.position.z).toBe(5);
    expect(mesh2.position.x).toBe(15);
    expect(mesh2.position.y).toBe(15);
    expect(mesh2.position.z).toBe(15);
  });

  it('should snap absolute positions when snap is enabled', () => {
    const snapEnabled = new GridSnap(true, 1.0);
    const snapExecutor = new TransformExecutor(snapEnabled);
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    snapExecutor.executeTranslation([mesh], new THREE.Vector3(0.4, 0.6, 0.2));
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.y).toBe(1);
    expect(mesh.position.z).toBe(0);
  });

  it('should apply absolute translation from initial positions', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, new THREE.Vector3(0, 0, 0));
    executor.applyAbsoluteTranslation([mesh], initials, new THREE.Vector3(2, 3, 4));
    expect(mesh.position.x).toBe(2);
    expect(mesh.position.y).toBe(3);
    expect(mesh.position.z).toBe(4);
  });

  it('should snap only moved axes during absolute translation', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh();
    mesh.position.set(0.3, 0.7, 0.2);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, new THREE.Vector3(0.3, 0.7, 0.2));
    snapExecutor.applyAbsoluteTranslation(
      [mesh],
      initials,
      new THREE.Vector3(1.1, 0, 0)
    );
    expect(mesh.position.x).toBeCloseTo(1);
    expect(mesh.position.y).toBeCloseTo(0.7);
    expect(mesh.position.z).toBeCloseTo(0.2);
  });

  it('should snap odd-sized boxes so faces land on the grid, not only the pivot', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 0.25));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1.25, 1.875, 2.5);
    mesh.scale.set(0.5, 3.75, 3.0);
    mesh.updateMatrixWorld(true);
    const start = mesh.position.clone();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, start.clone());
    snapExecutor.applyAbsoluteTranslation(
      [mesh],
      initials,
      new THREE.Vector3(0, 0.05, 0)
    );
    expect(mesh.position.y).toBeCloseTo(1.875, 5);
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.y % 0.25).toBeCloseTo(0, 5);
    expect(box.max.y % 0.25).toBeCloseTo(0, 5);
  });

  it('should move an odd-sized box by whole grid steps while keeping faces on grid', () => {
    const snapExecutor = new TransformExecutor(new GridSnap(true, 0.25));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1.25, 1.875, 2.5);
    mesh.scale.set(0.5, 3.75, 3.0);
    const start = mesh.position.clone();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, start.clone());
    snapExecutor.applyAbsoluteTranslation(
      [mesh],
      initials,
      new THREE.Vector3(0, 0.3, 0)
    );
    expect(mesh.position.y).toBeCloseTo(2.125, 5);
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.y).toBeCloseTo(0.25, 5);
    expect(box.max.y).toBeCloseTo(4.0, 5);
  });
});

describe('TransformExecutor.executeRotation', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should rotate object around pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const angle = Math.PI / 2;
    executor.executeRotation([mesh], pivot, axis, angle);
    expect(mesh.position.x).toBeCloseTo(0, 1);
    expect(mesh.position.y).toBeCloseTo(1, 1);
  });

  it('should update object quaternion during rotation', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 0, 0);
    const before = mesh.quaternion.clone();
    executor.executeRotation(
      [mesh],
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2
    );
    expect(mesh.quaternion.equals(before)).toBe(false);
  });

  it('should rotate multiple objects', () => {
    const mesh1 = new THREE.Mesh();
    mesh1.position.set(1, 0, 0);
    const mesh2 = new THREE.Mesh();
    mesh2.position.set(0, 1, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const angle = Math.PI;
    executor.executeRotation([mesh1, mesh2], pivot, axis, angle);
    expect(mesh1.position.x).toBeCloseTo(-1, 1);
    expect(mesh1.position.y).toBeCloseTo(0, 1);
    expect(mesh2.position.x).toBeCloseTo(0, 1);
    expect(mesh2.position.y).toBeCloseTo(-1, 1);
  });
});

describe('TransformExecutor.executeScale', () => {
  let executor: TransformExecutor;

  beforeEach(() => {
    executor = new TransformExecutor(new GridSnap(false, 1.0));
  });

  it('should scale object along axis from pivot', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(2, 0, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    executor.executeScale([mesh], pivot, axis, 2.0);
    expect(mesh.position.x).toBeCloseTo(4, 1);
    expect(mesh.position.y).toBeCloseTo(0, 1);
    expect(mesh.position.z).toBeCloseTo(0, 1);
  });

  it('should update mesh.scale along axis', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    executor.executeScale(
      [mesh],
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      2.0
    );
    expect(mesh.scale.x).toBeCloseTo(2);
    expect(mesh.scale.y).toBeCloseTo(1);
  });

  it('should preserve perpendicular components during scale', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(2, 3, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(1, 0, 0);
    executor.executeScale([mesh], pivot, axis, 2.0);
    expect(mesh.position.x).toBeCloseTo(4, 1);
    expect(mesh.position.y).toBeCloseTo(3, 1);
  });
});

describe('TransformExecutor.getGridSnap', () => {
  it('should return the grid snap instance', () => {
    const snap = new GridSnap(true, 2.0);
    const executor = new TransformExecutor(snap);
    expect(executor.getGridSnap()).toBe(snap);
    expect(executor.getGridSnap().isEnabled()).toBe(true);
    expect(executor.getGridSnap().getInterval()).toBe(2.0);
  });
});
