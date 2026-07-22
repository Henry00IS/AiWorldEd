import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SplitMeshCommand } from '../../src/commands/split_mesh_command.js';

describe('SplitMeshCommand', () => {
  it('should replace the source with both results on execute', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    world.add(source);
    const command = new SplitMeshCommand(source, front, back, world);
    command.execute();
    expect(world.children.includes(source)).toBe(false);
    expect(world.children.includes(front)).toBe(true);
    expect(world.children.includes(back)).toBe(true);
  });

  it('should restore the source and remove both results on undo', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    world.add(source);
    const command = new SplitMeshCommand(source, front, back, world);
    command.execute();
    command.undo();
    expect(world.children.includes(source)).toBe(true);
    expect(world.children.includes(front)).toBe(false);
    expect(world.children.includes(back)).toBe(false);
  });

  it('should expose both result meshes', () => {
    const world = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1));
    const command = new SplitMeshCommand(source, front, back, world);
    expect(command.getResultMeshes()).toEqual([front, back]);
  });
});
