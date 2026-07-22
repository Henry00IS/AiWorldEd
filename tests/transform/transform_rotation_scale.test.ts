import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { TransformExecutor } from '../../src/transform/transform_executor.js';
import { TransformConstraint } from '../../src/transform/transform_constraint.js';

describe('TransformExecutor rotation snapping', () => {
  it('should snap rotation angles when snap is enabled', () => {
    const executor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const quats = new Map<THREE.Mesh, THREE.Quaternion>();
    initials.set(mesh, mesh.position.clone());
    quats.set(mesh, mesh.quaternion.clone());
    const twelveDegrees = (12 * Math.PI) / 180;
    executor.applyAbsoluteRotation(
      [mesh],
      initials,
      quats,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      twelveDegrees
    );
    const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
    expect(euler.y).toBeCloseTo((15 * Math.PI) / 180, 4);
  });

  it('should not snap rotation when snap is disabled', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.quaternion.identity();
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const quats = new Map<THREE.Mesh, THREE.Quaternion>();
    initials.set(mesh, mesh.position.clone());
    quats.set(mesh, mesh.quaternion.clone());
    const twelveDegrees = (12 * Math.PI) / 180;
    executor.applyAbsoluteRotation(
      [mesh],
      initials,
      quats,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      twelveDegrees
    );
    const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'YXZ');
    expect(euler.y).toBeCloseTo(twelveDegrees, 4);
  });
});

describe('TransformExecutor scale snapping', () => {
  it('should snap scale factors when snap is enabled', () => {
    const executor = new TransformExecutor(new GridSnap(true, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const scales = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, mesh.position.clone());
    scales.set(mesh, mesh.scale.clone());
    executor.applyAbsoluteScale(
      [mesh],
      initials,
      scales,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      1.24
    );
    expect(mesh.scale.x).toBeCloseTo(1.2);
  });

  it('should not snap scale factors when snap is disabled', () => {
    const executor = new TransformExecutor(new GridSnap(false, 1.0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.scale.set(1, 1, 1);
    const initials = new Map<THREE.Mesh, THREE.Vector3>();
    const scales = new Map<THREE.Mesh, THREE.Vector3>();
    initials.set(mesh, mesh.position.clone());
    scales.set(mesh, mesh.scale.clone());
    executor.applyAbsoluteScale(
      [mesh],
      initials,
      scales,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      1.37
    );
    expect(mesh.scale.x).toBeCloseTo(1.37);
  });
});

describe('TransformConstraint helpers used by gizmo drags', () => {
  it('should compute signed rotation angles around an axis', () => {
    const initial = new THREE.Vector3(1, 0, 0);
    const current = new THREE.Vector3(0, 0, 1);
    const axis = new THREE.Vector3(0, 1, 0);
    const angle = TransformConstraint.computeRotationAngle(initial, current, axis);
    expect(Math.abs(angle)).toBeCloseTo(Math.PI / 2, 4);
  });

  it('should compute scale factors from distance ratios', () => {
    expect(TransformConstraint.computeScaleFactor(2, 4)).toBeCloseTo(2);
    expect(TransformConstraint.computeScaleFactor(1, 0.5)).toBeCloseTo(0.5);
  });
});
