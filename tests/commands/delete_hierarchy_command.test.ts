import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DeleteHierarchyCommand } from '../../src/commands/delete_hierarchy_command.js';

describe('DeleteHierarchyCommand', () => {
  let world: THREE.Group;
  let group: THREE.Group;
  let mesh: THREE.Mesh;

  beforeEach(() => {
    world = new THREE.Group();
    group = new THREE.Group();
    group.name = 'EmptyGroup';
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    mesh.name = 'Cube';
    world.add(group);
    world.add(mesh);
  });

  it('should remove an empty group from the world', () => {
    const command = new DeleteHierarchyCommand([group]);
    command.execute();
    expect(world.children).not.toContain(group);
    expect(world.children).toContain(mesh);
  });

  it('should restore an empty group on undo', () => {
    const command = new DeleteHierarchyCommand([group]);
    command.execute();
    command.undo();
    expect(world.children).toContain(group);
    expect(group.parent).toBe(world);
  });

  it('should remove a group and keep its subtree attached to the group', () => {
    group.add(mesh);
    world.remove(mesh);
    const command = new DeleteHierarchyCommand([group]);
    command.execute();
    expect(world.children).not.toContain(group);
    expect(group.children).toContain(mesh);
    command.undo();
    expect(world.children).toContain(group);
    expect(group.children).toContain(mesh);
  });
});
