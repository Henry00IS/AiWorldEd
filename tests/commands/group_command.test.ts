import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GroupCommand } from '../../src/commands/group_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('GroupCommand', () => {
  let parent: THREE.Group;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;

  beforeEach(() => {
    parent = new THREE.Group();
    mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh1.name = 'Mesh1';
    mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    mesh2.name = 'Mesh2';
    parent.add(mesh1);
    parent.add(mesh2);
  });

  it('should execute and create a group containing the children', () => {
    const command = new GroupCommand([mesh1, mesh2], parent, 'TestGroup');
    command.execute();
    const group = command.getGroup();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(group);
    expect(group.name).toBe('TestGroup');
    expect(group.children.length).toBe(2);
    expect(group.children).toContain(mesh1);
    expect(group.children).toContain(mesh2);
  });

  it('should undo and restore children to original parent', () => {
    const command = new GroupCommand([mesh1, mesh2], parent, 'TestGroup');
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(parent.children[0]).toBe(mesh1);
    expect(parent.children[1]).toBe(mesh2);
    expect(mesh1.parent).toBe(parent);
    expect(mesh2.parent).toBe(parent);
  });

  it('should redo and re-group children', () => {
    const command = new GroupCommand([mesh1, mesh2], parent, 'TestGroup');
    command.execute();
    command.undo();
    command.execute();
    const group = command.getGroup();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(group);
    expect(group.children.length).toBe(2);
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new GroupCommand([mesh1, mesh2], parent, 'StackGroup');
    stack.push(command);
    expect(parent.children.length).toBe(1);
    stack.undo();
    expect(parent.children.length).toBe(2);
    stack.redo();
    expect(parent.children.length).toBe(1);
  });

  it('should group single object', () => {
    const command = new GroupCommand([mesh1], parent, 'SingleGroup');
    command.execute();
    const group = command.getGroup();
    expect(group.children.length).toBe(1);
    expect(group.children[0]).toBe(mesh1);
  });

  it('should handle objects from different parents', () => {
    const otherParent = new THREE.Group();
    const mesh3 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh3.name = 'Mesh3';
    otherParent.add(mesh3);
    const command = new GroupCommand([mesh1, mesh3], parent, 'MixedGroup');
    command.execute();
    const group = command.getGroup();
    expect(group.children.length).toBe(2);
    expect(group.children).toContain(mesh1);
    expect(group.children).toContain(mesh3);
    expect(parent.children.length).toBe(2);
    expect(otherParent.children.length).toBe(0);
  });

  it('should restore sibling order on undo', () => {
    const mesh3 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh3.name = 'Mesh3';
    parent.add(mesh3);
    const command = new GroupCommand([mesh1, mesh2], parent, 'OrderGroup');
    command.execute();
    command.undo();
    expect(parent.children[0].name).toBe('Mesh1');
    expect(parent.children[1].name).toBe('Mesh2');
    expect(parent.children[2].name).toBe('Mesh3');
  });

  it('should preserve object transforms on group/ungroup', () => {
    mesh1.position.set(5, 10, 15);
    const command = new GroupCommand([mesh1], parent, 'TransformGroup');
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBe(5);
    expect(mesh1.position.y).toBe(10);
    expect(mesh1.position.z).toBe(15);
  });

  it('should return the group via getGroup method', () => {
    const command = new GroupCommand([mesh1], parent, 'GetGroup');
    const group = command.getGroup();
    expect(group).toBeDefined();
    expect(group instanceof THREE.Group).toBe(true);
    expect(group.name).toBe('GetGroup');
  });

  it('should not execute twice', () => {
    const command = new GroupCommand([mesh1, mesh2], parent, 'OnceGroup');
    command.execute();
    command.execute();
    expect(parent.children.length).toBe(1);
  });

  it('should nest an existing group under a new group without emptying it', () => {
    const inner = new THREE.Group();
    inner.name = 'Inner';
    parent.add(inner);
    inner.add(mesh1);
    parent.remove(mesh1);
    const command = new GroupCommand([inner], parent, 'Outer');
    command.execute();
    const outer = command.getGroup();
    expect(outer.children).toContain(inner);
    expect(inner.children).toContain(mesh1);
    expect(parent.children).toContain(outer);
    expect(parent.children).not.toContain(inner);
  });
});
