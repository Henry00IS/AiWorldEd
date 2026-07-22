import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DeleteObjectCommand, DeleteSnapshot } from '../../src/commands/delete_object_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('DeleteObjectCommand', () => {
  let parent: THREE.Group;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let snapshots: DeleteSnapshot[];

  beforeEach(() => {
    parent = new THREE.Group();
    mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh1.position.set(1, 2, 3);
    mesh1.rotation.set(0.1, 0.2, 0.3);
    mesh1.scale.set(2, 2, 2);
    mesh1.name = 'Mesh1';
    parent.add(mesh1);

    mesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x999999 })
    );
    mesh2.position.set(4, 5, 6);
    mesh2.rotation.set(0.4, 0.5, 0.6);
    mesh2.scale.set(0.5, 0.5, 0.5);
    mesh2.name = 'Mesh2';
    parent.add(mesh2);

    snapshots = [
      {
        mesh: mesh1,
        parent: parent,
        siblingIndex: 0,
        position: mesh1.position.clone(),
        rotation: mesh1.quaternion.clone(),
        scale: mesh1.scale.clone(),
        name: mesh1.name,
        geometry: mesh1.geometry.clone(),
        material: (mesh1.material as THREE.Material).clone()
      },
      {
        mesh: mesh2,
        parent: parent,
        siblingIndex: 1,
        position: mesh2.position.clone(),
        rotation: mesh2.quaternion.clone(),
        scale: mesh2.scale.clone(),
        name: mesh2.name,
        geometry: mesh2.geometry.clone(),
        material: (mesh2.material as THREE.Material).clone()
      }
    ];
  });

  it('should execute and remove meshes from parent', () => {
    const command = new DeleteObjectCommand(snapshots);
    command.execute();
    expect(parent.children.length).toBe(0);
  });

  it('should undo and restore full state for single mesh', () => {
    const singleSnapshot = snapshots[0];
    const command = new DeleteObjectCommand([singleSnapshot]);
    command.execute();
    expect(parent.children.length).toBe(1);
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(parent.children[0]).toBe(mesh1);
    expect(mesh1.position.x).toBeCloseTo(1);
    expect(mesh1.position.y).toBeCloseTo(2);
    expect(mesh1.position.z).toBeCloseTo(3);
    expect(mesh1.name).toBe('Mesh1');
  });

  it('should redo and remove meshes again', () => {
    const command = new DeleteObjectCommand(snapshots);
    command.execute();
    command.undo();
    command.execute();
    expect(parent.children.length).toBe(0);
  });

  it('should restore multiple objects with correct sibling order', () => {
    const command = new DeleteObjectCommand(snapshots);
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(parent.children[0].name).toBe('Mesh1');
    expect(parent.children[1].name).toBe('Mesh2');
  });

  it('should restore rotation and scale on undo', () => {
    const command = new DeleteObjectCommand(snapshots);
    command.execute();
    command.undo();
    expect(mesh1.scale.x).toBeCloseTo(2);
    expect(mesh1.scale.y).toBeCloseTo(2);
    expect(mesh1.scale.z).toBeCloseTo(2);
  });

  it('should work with command stack for undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new DeleteObjectCommand(snapshots);
    stack.push(command);
    expect(parent.children.length).toBe(0);
    stack.undo();
    expect(parent.children.length).toBe(2);
    stack.redo();
    expect(parent.children.length).toBe(0);
  });

  it('should handle mesh with no parent gracefully', () => {
    const orphanMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    orphanMesh.name = 'Orphan';
    const orphanSnapshot: DeleteSnapshot = {
      mesh: orphanMesh,
      parent: null,
      siblingIndex: 0,
      position: orphanMesh.position.clone(),
      rotation: orphanMesh.quaternion.clone(),
      scale: orphanMesh.scale.clone(),
      name: orphanMesh.name,
      geometry: orphanMesh.geometry.clone(),
      material: (orphanMesh.material as THREE.Material).clone()
    };
    const command = new DeleteObjectCommand([orphanSnapshot]);
    command.execute();
    command.undo();
    expect(orphanMesh.parent).toBe(null);
  });
});
