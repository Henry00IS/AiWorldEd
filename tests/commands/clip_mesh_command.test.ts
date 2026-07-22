import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ClipMeshCommand } from '../../src/commands/clip_mesh_command.js';

describe('ClipMeshCommand', () => {
  it('should replace the source mesh with the result on execute', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const result = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    source.name = 'Source';
    result.name = 'Result';
    world.add(source);
    const command = new ClipMeshCommand(source, result, world);
    command.execute();
    expect(world.children.includes(source)).toBe(false);
    expect(world.children.includes(result)).toBe(true);
  });

  it('should restore the source mesh on undo', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const result = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    world.add(source);
    const command = new ClipMeshCommand(source, result, world);
    command.execute();
    command.undo();
    expect(world.children.includes(source)).toBe(true);
    expect(world.children.includes(result)).toBe(false);
  });

  it('should expose the result mesh', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const result = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    world.add(source);
    const command = new ClipMeshCommand(source, result, world);
    expect(command.getResultMesh()).toBe(result);
  });
});
