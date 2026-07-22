import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CreatePrimitiveCommand } from '../../src/commands/create_primitive_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('CreatePrimitiveCommand', () => {
  let parent: THREE.Group;
  let mesh: THREE.Mesh;
  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  beforeEach(() => {
    parent = new THREE.Group();
    geometry = new THREE.BoxGeometry(1, 1, 1);
    material = new THREE.MeshStandardMaterial({ color: 0x888888 });
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'TestCube';
  });

  it('should execute and add mesh to parent', () => {
    const command = new CreatePrimitiveCommand(mesh, parent);
    command.execute();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(mesh);
    expect(mesh.parent).toBe(parent);
  });

  it('should undo and remove mesh from parent', () => {
    const command = new CreatePrimitiveCommand(mesh, parent);
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(0);
    expect(mesh.parent).toBe(null);
  });

  it('should preserve geometry on undo for redo support', () => {
    const command = new CreatePrimitiveCommand(mesh, parent);
    command.execute();
    command.undo();
    expect(mesh.geometry).not.toBeNull();
  });

  it('should preserve material on undo for redo support', () => {
    const command = new CreatePrimitiveCommand(mesh, parent);
    command.execute();
    command.undo();
    expect(mesh.material).not.toBeNull();
  });

  it('should redo re-add mesh to parent', () => {
    const command = new CreatePrimitiveCommand(mesh, parent);
    command.execute();
    command.undo();
    command.execute();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(mesh);
  });

  it('should handle sphere primitives correctly', () => {
    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereMesh.name = 'TestSphere';
    const command = new CreatePrimitiveCommand(sphereMesh, parent);
    command.execute();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0].name).toBe('TestSphere');
    command.undo();
    expect(parent.children.length).toBe(0);
    expect(sphereMesh.geometry).not.toBeNull();
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new CreatePrimitiveCommand(mesh, parent);
    stack.push(command);
    expect(parent.children.length).toBe(1);
    stack.undo();
    expect(parent.children.length).toBe(0);
  });
});
