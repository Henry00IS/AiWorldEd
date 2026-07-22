import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ReparentCommand } from '../../src/commands/reparent_command.js';

describe('ReparentCommand', () => {
  let world: THREE.Group;
  let groupA: THREE.Group;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    world = new THREE.Group();
    world.name = 'World';
    groupA = new THREE.Group();
    groupA.name = 'GroupA';
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshA.name = 'MeshA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshB.name = 'MeshB';
    meshA.position.set(2, 0, 0);
    world.add(groupA);
    world.add(meshA);
    world.add(meshB);
  });

  it('should reparent a mesh under a group on execute', () => {
    const command = new ReparentCommand(meshA, groupA);
    command.execute();
    expect(meshA.parent).toBe(groupA);
    expect(groupA.children.includes(meshA)).toBe(true);
  });

  it('should preserve world position after reparent', () => {
    meshA.position.set(5, 3, 1);
    const worldPosBefore = new THREE.Vector3();
    meshA.getWorldPosition(worldPosBefore);
    const command = new ReparentCommand(meshA, groupA);
    command.execute();
    const worldPosAfter = new THREE.Vector3();
    meshA.getWorldPosition(worldPosAfter);
    expect(worldPosAfter.x).toBeCloseTo(worldPosBefore.x);
    expect(worldPosAfter.y).toBeCloseTo(worldPosBefore.y);
    expect(worldPosAfter.z).toBeCloseTo(worldPosBefore.z);
  });

  it('should restore original parent on undo', () => {
    const command = new ReparentCommand(meshA, groupA);
    command.execute();
    command.undo();
    expect(meshA.parent).toBe(world);
  });

  it('should re-apply reparent on redo via second execute', () => {
    const command = new ReparentCommand(meshA, groupA);
    command.execute();
    command.undo();
    command.execute();
    expect(meshA.parent).toBe(groupA);
  });

  it('should insert before a sibling when requested', () => {
    const command = new ReparentCommand(meshB, world, meshA);
    command.execute();
    expect(meshB.parent).toBe(world);
    expect(world.children.indexOf(meshB)).toBeLessThan(world.children.indexOf(meshA));
  });

  it('should reject reparenting an object into itself', () => {
    const command = new ReparentCommand(meshA, meshA);
    command.execute();
    expect(meshA.parent).toBe(world);
  });
});
