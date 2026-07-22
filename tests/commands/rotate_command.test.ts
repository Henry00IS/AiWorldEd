import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RotateCommand, ObjectRotationSnapshot } from '../../src/commands/rotate_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('RotateCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let snapshots: ObjectRotationSnapshot[];
  let pivot: THREE.Vector3;
  let axis: THREE.Vector3;
  let angle: number;

  beforeEach(() => {
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.position.set(2, 0, 0);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.position.set(0, 2, 0);
    snapshots = [
      {
        object: mesh1,
        originalPosition: mesh1.position.clone(),
        originalQuaternion: mesh1.quaternion.clone()
      },
      {
        object: mesh2,
        originalPosition: mesh2.position.clone(),
        originalQuaternion: mesh2.quaternion.clone()
      }
    ];
    pivot = new THREE.Vector3(0, 0, 0);
    axis = new THREE.Vector3(0, 0, 1);
    angle = Math.PI / 2;
  });

  it('should execute and apply rotation around pivot', () => {
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(0);
    expect(mesh1.position.y).toBeCloseTo(2);
  });

  it('should rotate object orientation not only position', () => {
    const before = mesh1.quaternion.clone();
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    command.execute();
    expect(mesh1.quaternion.equals(before)).toBe(false);
  });

  it('should undo and restore original positions and orientations', () => {
    const originalQuat = mesh1.quaternion.clone();
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(2);
    expect(mesh1.position.y).toBeCloseTo(0);
    expect(mesh2.position.x).toBeCloseTo(0);
    expect(mesh2.position.y).toBeCloseTo(2);
    expect(mesh1.quaternion.angleTo(originalQuat)).toBeCloseTo(0, 5);
  });

  it('should redo by executing again after undo', () => {
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    command.execute();
    command.undo();
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(0);
    expect(mesh1.position.y).toBeCloseTo(2);
  });

  it('should handle multiple objects with independent positions', () => {
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(2);
    expect(mesh2.position.y).toBeCloseTo(2);
  });

  it('should work with a non-origin pivot', () => {
    const offPivot = new THREE.Vector3(1, 0, 0);
    const snapshots2: ObjectRotationSnapshot[] = [
      {
        object: mesh1,
        originalPosition: mesh1.position.clone(),
        originalQuaternion: mesh1.quaternion.clone()
      }
    ];
    const command = new RotateCommand(snapshots2, offPivot, axis, angle);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(2);
    expect(mesh1.position.y).toBeCloseTo(0);
  });

  it('should work with command stack for undo/redo', () => {
    const stack = new CommandStack(64);
    const command = new RotateCommand(snapshots, pivot, axis, angle);
    stack.push(command);
    expect(mesh1.position.y).toBeCloseTo(2);
    stack.undo();
    expect(mesh1.position.y).toBeCloseTo(0);
    stack.redo();
    expect(mesh1.position.y).toBeCloseTo(2);
  });
});
