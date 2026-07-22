import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  collapseToHierarchyRoots,
  findCommonParent
} from '../../src/utils/hierarchy_selection.js';

describe('collapseToHierarchyRoots', () => {
  it('should drop children when their parent is also selected', () => {
    const world = new THREE.Group();
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();
    world.add(group);
    group.add(mesh);
    const roots = collapseToHierarchyRoots([group, mesh]);
    expect(roots).toEqual([group]);
  });

  it('should keep sibling objects', () => {
    const world = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    world.add(a);
    world.add(b);
    const roots = collapseToHierarchyRoots([a, b]);
    expect(roots).toContain(a);
    expect(roots).toContain(b);
    expect(roots.length).toBe(2);
  });
});

describe('findCommonParent', () => {
  it('should return the shared parent of siblings', () => {
    const world = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    world.add(a);
    world.add(b);
    expect(findCommonParent([a, b], world)).toBe(world);
  });

  it('should return nested parent when grouping under an existing group', () => {
    const world = new THREE.Group();
    const group = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    world.add(group);
    group.add(a);
    group.add(b);
    expect(findCommonParent([a, b], world)).toBe(group);
  });
});
