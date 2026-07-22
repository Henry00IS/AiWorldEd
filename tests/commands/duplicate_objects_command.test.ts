import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DuplicateObjectsCommand } from '../../src/commands/duplicate_objects_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('DuplicateObjectsCommand', () => {
  let parent: THREE.Group;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let offset: THREE.Vector3;

  beforeEach(() => {
    parent = new THREE.Group();
    offset = new THREE.Vector3(1, 0, 0);
    mesh1 = createBoxMesh('Cube001', new THREE.Vector3(0, 0, 0));
    parent.add(mesh1);
    mesh2 = createSphereMesh('Sphere001', new THREE.Vector3(5, 0, 0));
    parent.add(mesh2);
  });

  it('should execute and add clones to parent', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    expect(parent.children.length).toBe(3);
    const clone = parent.children[2];
    expect(clone.name).toBe('Cube001_copy');
    expect(clone.position.x).toBeCloseTo(1);
  });

  it('should undo and remove clones from parent', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    expect(parent.children.length).toBe(3);
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(parent.children[0].name).toBe('Cube001');
  });

  it('should redo and re-add clones after undo', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(2);
    command.execute();
    expect(parent.children.length).toBe(3);
  });

  it('should produce independent objects with separate resources', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    const clone = parent.children[2];
    mesh1.geometry.dispose();
    expect(clone.geometry).toBeDefined();
    const originalMaterial = mesh1.material as THREE.Material;
    originalMaterial.color.set(0xff0000);
    const cloneMaterial = (clone.material as THREE.Material).color;
    expect(cloneMaterial.getHex()).toBe(0x888888);
  });

  it('should duplicate multiple objects and preserve all clones', () => {
    const command = new DuplicateObjectsCommand([mesh1, mesh2], parent, offset);
    command.execute();
    expect(parent.children.length).toBe(4);
    expect(parent.children[2].name).toBe('Cube001_copy');
    expect(parent.children[3].name).toBe('Sphere001_copy');
  });

  it('should dispose resources on undo', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    const clonedMeshes = command.getClonedMeshes();
    expect(clonedMeshes.length).toBe(1);
    command.undo();
    const clonedMesh = clonedMeshes[0];
    expect(clonedMesh.geometry.parameters).toBeDefined();
    expect(clonedMesh.parent).toBeNull();
  });

  it('should handle empty input as no-op', () => {
    const command = new DuplicateObjectsCommand([], parent, offset);
    command.execute();
    expect(parent.children.length).toBe(2);
    command.undo();
    expect(parent.children.length).toBe(2);
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    stack.push(command);
    expect(parent.children.length).toBe(3);
    stack.undo();
    expect(parent.children.length).toBe(2);
    stack.redo();
    expect(parent.children.length).toBe(3);
  });

  it('should preserve rotation and scale on cloned mesh', () => {
    mesh1.scale.set(3, 3, 3);
    mesh1.rotation.set(0.5, 0.5, 0);
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    const clone = parent.children[2];
    expect(clone.scale.x).toBeCloseTo(3);
    expect(clone.scale.y).toBeCloseTo(3);
    expect(clone.scale.z).toBeCloseTo(3);
    const cloneEuler = new THREE.Euler().setFromQuaternion(clone.quaternion);
    expect(cloneEuler.x).toBeCloseTo(0.5);
    expect(cloneEuler.y).toBeCloseTo(0.5);
  });

  it('should not execute twice on double execute call', () => {
    const command = new DuplicateObjectsCommand([mesh1], parent, offset);
    command.execute();
    command.execute();
    expect(parent.children.length).toBe(3);
  });
});

/**
 * Creates a box mesh with wireframe edges for testing.
 * @param name The mesh display name.
 * @param position The mesh position vector.
 * @returns The configured box mesh.
 */
function createBoxMesh(name: string, position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xaaaaaa }));
  mesh.add(line);
  return mesh;
}

/**
 * Creates a sphere mesh for testing.
 * @param name The mesh display name.
 * @param position The mesh position vector.
 * @returns The configured sphere mesh.
 */
function createSphereMesh(name: string, position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x999999 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  return mesh;
}
