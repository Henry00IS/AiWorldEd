import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { HierarchyReparentHandler } from '../../src/managers/hierarchy_reparent_handler.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('HierarchyReparentHandler', () => {
  let world: THREE.Group;
  let groupA: THREE.Group;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;
  let stack: CommandStack;
  let handler: HierarchyReparentHandler;

  beforeEach(() => {
    world = new THREE.Group();
    groupA = new THREE.Group();
    groupA.name = 'GroupA';
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshA.name = 'MeshA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshB.name = 'MeshB';
    world.add(groupA);
    world.add(meshA);
    world.add(meshB);
    stack = new CommandStack(16);
    handler = new HierarchyReparentHandler(world, stack);
  });

  it('should reparent a mesh into a group on drop', () => {
    handler.reparentFromDrop(meshA, groupA);
    expect(meshA.parent).toBe(groupA);
  });

  it('should reparent beside a mesh as a sibling', () => {
    handler.reparentFromDrop(meshB, meshA);
    expect(meshB.parent).toBe(world);
    expect(world.children.indexOf(meshB)).toBeLessThan(world.children.indexOf(meshA));
  });

  it('should reject dropping a parent onto its own descendant', () => {
    handler.reparentFromDrop(meshA, groupA);
    handler.reparentFromDrop(groupA, meshA);
    expect(groupA.parent).toBe(world);
  });

  it('should call sync and refresh callbacks', () => {
    const sync = vi.fn();
    const refresh = vi.fn();
    handler.setSyncViewports(sync);
    handler.setRefreshOutliner(refresh);
    handler.reparentFromDrop(meshA, groupA);
    expect(sync).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('should support undo of reparent', () => {
    handler.reparentFromDrop(meshA, groupA);
    expect(meshA.parent).toBe(groupA);
    stack.undo();
    expect(meshA.parent).toBe(world);
  });
});
