import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SetRotationCommand } from '../../src/commands/set_rotation_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('SetRotationCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;

  beforeEach(() => {
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.rotation.set(0, 0, 0);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.rotation.set(1, 2, 3);
  });

  it('should snapshot original rotations on construction', () => {
    const newRotation = new THREE.Euler(Math.PI, Math.PI / 2, Math.PI / 4);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    expect(mesh1.rotation.x).toBeCloseTo(0);
    expect(mesh1.rotation.y).toBeCloseTo(0);
    expect(mesh1.rotation.z).toBeCloseTo(0);
  });

  it('should execute and set new rotations', () => {
    const newRotation = new THREE.Euler(Math.PI / 2, Math.PI, 0);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(mesh1.rotation.y).toBeCloseTo(Math.PI);
    expect(mesh1.rotation.z).toBeCloseTo(0);
  });

  it('should undo and restore original rotations', () => {
    const originalX = mesh1.rotation.x;
    const originalY = mesh1.rotation.y;
    const originalZ = mesh1.rotation.z;
    const newRotation = new THREE.Euler(5, 6, 7);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(5);
    command.undo();
    expect(mesh1.rotation.x).toBeCloseTo(originalX);
    expect(mesh1.rotation.y).toBeCloseTo(originalY);
    expect(mesh1.rotation.z).toBeCloseTo(originalZ);
  });

  it('should redo by executing again after undo', () => {
    const newRotation = new THREE.Euler(Math.PI / 4, Math.PI / 3, Math.PI / 6);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 4);
    command.undo();
    expect(mesh1.rotation.x).toBeCloseTo(0);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 4);
  });

  it('should handle PI/2 rotation values', () => {
    const newRotation = new THREE.Euler(Math.PI / 2, 0, 0);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 2);
    command.undo();
    expect(mesh1.rotation.x).toBeCloseTo(0);
  });

  it('should handle PI rotation values', () => {
    const newRotation = new THREE.Euler(0, Math.PI, 0);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.y).toBeCloseTo(Math.PI);
    command.undo();
    expect(mesh1.rotation.y).toBeCloseTo(0);
  });

  it('should handle full two-PI rotations', () => {
    const newRotation = new THREE.Euler(0, 0, Math.PI * 2);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    command.execute();
    expect(mesh1.rotation.z).toBeCloseTo(Math.PI * 2);
    command.undo();
    expect(mesh1.rotation.z).toBeCloseTo(0);
  });

  it('should handle zero rotation values', () => {
    const newRotation = new THREE.Euler(0, 0, 0);
    const command = new SetRotationCommand([mesh2], [newRotation]);
    command.execute();
    expect(mesh2.rotation.x).toBeCloseTo(0);
    expect(mesh2.rotation.y).toBeCloseTo(0);
    expect(mesh2.rotation.z).toBeCloseTo(0);
    command.undo();
    expect(mesh2.rotation.x).toBeCloseTo(1);
    expect(mesh2.rotation.y).toBeCloseTo(2);
    expect(mesh2.rotation.z).toBeCloseTo(3);
  });

  it('should handle multiple objects with different rotations', () => {
    const rot1 = new THREE.Euler(1, 0, 0);
    const rot2 = new THREE.Euler(0, 2, 0);
    const command = new SetRotationCommand(
      [mesh1, mesh2],
      [rot1, rot2]
    );
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(1);
    expect(mesh2.rotation.y).toBeCloseTo(2);
    command.undo();
    expect(mesh1.rotation.x).toBeCloseTo(0);
    expect(mesh2.rotation.x).toBeCloseTo(1);
  });

  it('should work with command stack for undo and redo', () => {
    const stack = new CommandStack(64);
    const newRotation = new THREE.Euler(Math.PI / 2, Math.PI, 0);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    stack.push(command);
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 2);
    stack.undo();
    expect(mesh1.rotation.x).toBeCloseTo(0);
    stack.redo();
    expect(mesh1.rotation.x).toBeCloseTo(Math.PI / 2);
  });

  it('should clone input Euler vectors to avoid external mutation', () => {
    const newRotation = new THREE.Euler(1, 2, 3);
    const command = new SetRotationCommand([mesh1], [newRotation]);
    newRotation.set(99, 99, 99);
    command.execute();
    expect(mesh1.rotation.x).toBeCloseTo(1);
    expect(mesh1.rotation.y).toBeCloseTo(2);
    expect(mesh1.rotation.z).toBeCloseTo(3);
  });
});
