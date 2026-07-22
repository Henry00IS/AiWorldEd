import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SetScaleCommand } from '../../src/commands/set_scale_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('SetScaleCommand', () => {
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;

  beforeEach(() => {
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.scale.set(1, 1, 1);
    mesh2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh2.scale.set(2, 3, 4);
  });

  it('should snapshot original scale on construction', () => {
    const newScale = new THREE.Vector3(10, 20, 30);
    const command = new SetScaleCommand([mesh1], [newScale]);
    expect(mesh1.scale.x).toBeCloseTo(1);
    expect(mesh1.scale.y).toBeCloseTo(1);
    expect(mesh1.scale.z).toBeCloseTo(1);
  });

  it('should execute and set new scale', () => {
    const newScale = new THREE.Vector3(5, 10, 15);
    const command = new SetScaleCommand([mesh1], [newScale]);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(5);
    expect(mesh1.scale.y).toBeCloseTo(10);
    expect(mesh1.scale.z).toBeCloseTo(15);
  });

  it('should undo and restore original scale', () => {
    const originalX = mesh1.scale.x;
    const originalY = mesh1.scale.y;
    const originalZ = mesh1.scale.z;
    const newScale = new THREE.Vector3(100, 200, 300);
    const command = new SetScaleCommand([mesh1], [newScale]);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(100);
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(originalX);
    expect(mesh1.scale.y).toBeCloseTo(originalY);
    expect(mesh1.scale.z).toBeCloseTo(originalZ);
  });

  it('should redo by executing again after undo', () => {
    const newScale = new THREE.Vector3(3, 6, 9);
    const command = new SetScaleCommand([mesh1], [newScale]);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(3);
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(1);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(3);
  });

  it('should handle zero scale', () => {
    const newScale = new THREE.Vector3(0, 0, 0);
    const command = new SetScaleCommand([mesh1], [newScale]);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(0);
    expect(mesh1.scale.y).toBeCloseTo(0);
    expect(mesh1.scale.z).toBeCloseTo(0);
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(1);
    expect(mesh1.scale.y).toBeCloseTo(1);
    expect(mesh1.scale.z).toBeCloseTo(1);
  });

  it('should handle negative scale', () => {
    const newScale = new THREE.Vector3(-1, -2, -3);
    const command = new SetScaleCommand([mesh1], [newScale]);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(-1);
    expect(mesh1.scale.y).toBeCloseTo(-2);
    expect(mesh1.scale.z).toBeCloseTo(-3);
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(1);
  });

  it('should handle non-uniform scale', () => {
    const newScale = new THREE.Vector3(1, 5, 0.5);
    const command = new SetScaleCommand([mesh2], [newScale]);
    command.execute();
    expect(mesh2.scale.x).toBeCloseTo(1);
    expect(mesh2.scale.y).toBeCloseTo(5);
    expect(mesh2.scale.z).toBeCloseTo(0.5);
    command.undo();
    expect(mesh2.scale.x).toBeCloseTo(2);
    expect(mesh2.scale.y).toBeCloseTo(3);
    expect(mesh2.scale.z).toBeCloseTo(4);
  });

  it('should handle multiple objects with different scales', () => {
    const scale1 = new THREE.Vector3(2, 2, 2);
    const scale2 = new THREE.Vector3(4, 4, 4);
    const command = new SetScaleCommand(
      [mesh1, mesh2],
      [scale1, scale2]
    );
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(2);
    expect(mesh2.scale.x).toBeCloseTo(4);
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(1);
    expect(mesh2.scale.x).toBeCloseTo(2);
  });

  it('should work with command stack for undo and redo', () => {
    const stack = new CommandStack(64);
    const newScale = new THREE.Vector3(7, 14, 21);
    const command = new SetScaleCommand([mesh1], [newScale]);
    stack.push(command);
    expect(mesh1.scale.x).toBeCloseTo(7);
    expect(mesh1.scale.y).toBeCloseTo(14);
    expect(mesh1.scale.z).toBeCloseTo(21);
    stack.undo();
    expect(mesh1.scale.x).toBeCloseTo(1);
    stack.redo();
    expect(mesh1.scale.x).toBeCloseTo(7);
  });

  it('should clone input vectors to avoid external mutation', () => {
    const newScale = new THREE.Vector3(10, 20, 30);
    const command = new SetScaleCommand([mesh1], [newScale]);
    newScale.set(999, 999, 999);
    command.execute();
    expect(mesh1.scale.x).toBeCloseTo(10);
    expect(mesh1.scale.y).toBeCloseTo(20);
    expect(mesh1.scale.z).toBeCloseTo(30);
  });
});
