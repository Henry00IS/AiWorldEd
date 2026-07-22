import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ExtrudeFacesCommand } from '../../src/commands/extrude_faces_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('ExtrudeFacesCommand', () => {
  let parent: THREE.Group;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    parent = new THREE.Group();
    meshA = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    meshA.name = 'Extrude001';
    meshB = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    meshB.name = 'Extrude002';
  });

  it('should add all created meshes to the parent on execute', () => {
    const command = new ExtrudeFacesCommand([meshA, meshB], parent);
    command.execute();
    expect(parent.children.includes(meshA)).toBe(true);
    expect(parent.children.includes(meshB)).toBe(true);
  });

  it('should remove all meshes on undo', () => {
    const command = new ExtrudeFacesCommand([meshA, meshB], parent);
    command.execute();
    command.undo();
    expect(parent.children.includes(meshA)).toBe(false);
    expect(parent.children.includes(meshB)).toBe(false);
  });

  it('should re-add all meshes on redo', () => {
    const command = new ExtrudeFacesCommand([meshA, meshB], parent);
    command.execute();
    command.undo();
    command.execute();
    expect(parent.children.length).toBe(2);
  });

  it('should work with the command stack', () => {
    const stack = new CommandStack(16);
    stack.push(new ExtrudeFacesCommand([meshA, meshB], parent));
    expect(parent.children.length).toBe(2);
    stack.undo();
    expect(parent.children.length).toBe(0);
    stack.redo();
    expect(parent.children.length).toBe(2);
  });

  it('should expose all created meshes', () => {
    const command = new ExtrudeFacesCommand([meshA, meshB], parent);
    expect(command.getCreatedMeshes()).toEqual([meshA, meshB]);
    expect(command.getCreatedMesh()).toBe(meshA);
  });
});
