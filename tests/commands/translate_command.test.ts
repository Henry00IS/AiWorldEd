import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TranslateCommand, ObjectTransformSnapshot } from '../../src/commands/translate_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('TranslateCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let snapshots: ObjectTransformSnapshot[];
  let delta: THREE.Vector3;

  beforeEach(() => {
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.position.set(1, 2, 3);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.position.set(4, 5, 6);
    snapshots = [
      { object: mesh1, position: mesh1.position.clone() },
      { object: mesh2, position: mesh2.position.clone() }
    ];
    delta = new THREE.Vector3(10, 20, 30);
  });

  it('should execute and move objects by delta', () => {
    const command = new TranslateCommand(snapshots, delta);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(11);
    expect(mesh1.position.y).toBeCloseTo(22);
    expect(mesh1.position.z).toBeCloseTo(33);
    expect(mesh2.position.x).toBeCloseTo(14);
    expect(mesh2.position.y).toBeCloseTo(25);
    expect(mesh2.position.z).toBeCloseTo(36);
  });

  it('should undo and restore original positions', () => {
    const command = new TranslateCommand(snapshots, delta);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
    expect(mesh2.position.x).toBeCloseTo(4);
    expect(mesh2.position.y).toBeCloseTo(5);
    expect(mesh2.position.z).toBeCloseTo(6);
  });

  it('should redo by executing again after undo', () => {
    const command = new TranslateCommand(snapshots, delta);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(11);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(11);
  });

  it('should handle multiple objects independently', () => {
    const command = new TranslateCommand(snapshots, delta);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh2.position.x).toBeCloseTo(4);
  });

  it('should be a no-op when delta is zero', () => {
    const zeroDelta = new THREE.Vector3(0, 0, 0);
    const command = new TranslateCommand(snapshots, zeroDelta);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should work with command stack for undo/redo', () => {
    const stack = new CommandStack(64);
    const command = new TranslateCommand(snapshots, delta);
    stack.push(command);
    expect(mesh1.position.x).toBeCloseTo(11);
    stack.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    stack.redo();
    expect(mesh1.position.x).toBeCloseTo(11);
  });

  it('should prefer finalPosition over delta when provided', () => {
    const finalSnapshots: ObjectTransformSnapshot[] = [
      {
        object: mesh1,
        position: new THREE.Vector3(1, 2, 3),
        finalPosition: new THREE.Vector3(5, 2, 3)
      }
    ];
    const command = new TranslateCommand(finalSnapshots, new THREE.Vector3(100, 0, 0));
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(5);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
  });
});
