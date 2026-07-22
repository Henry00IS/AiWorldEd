import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SetPositionCommand } from '../../src/commands/set_position_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('SetPositionCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;

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
  });

  it('should snapshot original positions on construction', () => {
    const newPosition1 = new THREE.Vector3(10, 20, 30);
    const newPosition2 = new THREE.Vector3(40, 50, 60);
    const command = new SetPositionCommand(
      [mesh1, mesh2],
      [newPosition1, newPosition2]
    );
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
    expect(mesh2.position.x).toBeCloseTo(4);
    expect(mesh2.position.y).toBeCloseTo(5);
    expect(mesh2.position.z).toBeCloseTo(6);
  });

  it('should execute and set new positions', () => {
    const newPosition1 = new THREE.Vector3(10, 20, 30);
    const newPosition2 = new THREE.Vector3(40, 50, 60);
    const command = new SetPositionCommand(
      [mesh1, mesh2],
      [newPosition1, newPosition2]
    );
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(30);
    expect(mesh2.position.x).toBeCloseTo(40);
    expect(mesh2.position.y).toBeCloseTo(50);
    expect(mesh2.position.z).toBeCloseTo(60);
  });

  it('should undo and restore original positions', () => {
    const newPosition = new THREE.Vector3(100, 200, 300);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(100);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
  });

  it('should redo by executing again after undo', () => {
    const newPosition = new THREE.Vector3(77, 88, 99);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(77);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(77);
  });

  it('should handle multiple objects independently', () => {
    const newPosition1 = new THREE.Vector3(10, 20, 30);
    const newPosition2 = new THREE.Vector3(40, 50, 60);
    const command = new SetPositionCommand(
      [mesh1, mesh2],
      [newPosition1, newPosition2]
    );
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh2.position.x).toBeCloseTo(4);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh2.position.y).toBeCloseTo(5);
  });

  it('should handle negative coordinates', () => {
    const newPosition = new THREE.Vector3(-10, -20, -30);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(-10);
    expect(mesh1.position.y).toBeCloseTo(-20);
    expect(mesh1.position.z).toBeCloseTo(-30);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
  });

  it('should handle zero coordinates', () => {
    const newPosition = new THREE.Vector3(0, 0, 0);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(0);
    expect(mesh1.position.y).toBeCloseTo(0);
    expect(mesh1.position.z).toBeCloseTo(0);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
  });

  it('should handle large coordinate values', () => {
    const newPosition = new THREE.Vector3(10000, -5000, 25000);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10000);
    expect(mesh1.position.y).toBeCloseTo(-5000);
    expect(mesh1.position.z).toBeCloseTo(25000);
    command.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
  });

  it('should work with command stack for undo and redo', () => {
    const stack = new CommandStack(64);
    const newPosition = new THREE.Vector3(111, 222, 333);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    stack.push(command);
    expect(mesh1.position.x).toBeCloseTo(111);
    expect(mesh1.position.y).toBeCloseTo(222);
    expect(mesh1.position.z).toBeCloseTo(333);
    stack.undo();
    expect(mesh1.position.x).toBeCloseTo(1);
    stack.redo();
    expect(mesh1.position.x).toBeCloseTo(111);
  });

  it('should clone input vectors to avoid external mutation', () => {
    const newPosition = new THREE.Vector3(10, 20, 30);
    const command = new SetPositionCommand([mesh1], [newPosition]);
    newPosition.set(999, 999, 999);
    command.execute();
    expect(mesh1.position.x).toBeCloseTo(10);
    expect(mesh1.position.y).toBeCloseTo(20);
    expect(mesh1.position.z).toBeCloseTo(30);
  });

  it('should work with Object3D groups', () => {
    const group = new THREE.Group();
    group.position.set(5, 10, 15);
    const newPosition = new THREE.Vector3(100, 200, 300);
    const command = new SetPositionCommand([group], [newPosition]);
    command.execute();
    expect(group.position.x).toBeCloseTo(100);
    expect(group.position.y).toBeCloseTo(200);
    expect(group.position.z).toBeCloseTo(300);
    command.undo();
    expect(group.position.x).toBeCloseTo(5);
    expect(group.position.y).toBeCloseTo(10);
    expect(group.position.z).toBeCloseTo(15);
  });
});
