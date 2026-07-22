import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  getDescendants,
  getAncestors,
  findByName,
  reparentSafely,
  getAllMeshes,
  getGroupChildren,
  getMeshChildren,
  getDepth
} from '../../src/utils/hierarchy_utils.js';

describe('getDescendants', () => {
  let root: THREE.Group;
  let child1: THREE.Mesh;
  let child2: THREE.Mesh;
  let grandchild1: THREE.Mesh;

  beforeEach(() => {
    root = new THREE.Group();
    child1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    grandchild1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    root.add(child1);
    root.add(child2);
    child1.add(grandchild1);
  });

  it('should return all descendants recursively', () => {
    const descendants = getDescendants(root);
    expect(descendants.length).toBe(3);
    expect(descendants).toContain(child1);
    expect(descendants).toContain(child2);
    expect(descendants).toContain(grandchild1);
  });

  it('should return empty array for object with no children', () => {
    const empty = new THREE.Group();
    const descendants = getDescendants(empty);
    expect(descendants.length).toBe(0);
  });

  it('should include deeply nested descendants', () => {
    const level2 = new THREE.Group();
    const level3 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    level2.add(level3);
    child1.add(level2);
    const descendants = getDescendants(root);
    expect(descendants).toContain(level2);
    expect(descendants).toContain(level3);
  });
});

describe('getAncestors', () => {
  let root: THREE.Group;
  let child1: THREE.Group;
  let grandchild1: THREE.Mesh;

  beforeEach(() => {
    root = new THREE.Group();
    child1 = new THREE.Group();
    grandchild1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(child1);
    child1.add(grandchild1);
  });

  it('should return ancestors from immediate parent to root', () => {
    const ancestors = getAncestors(grandchild1);
    expect(ancestors.length).toBe(2);
    expect(ancestors[0]).toBe(child1);
    expect(ancestors[1]).toBe(root);
  });

  it('should return empty array for root object', () => {
    const ancestors = getAncestors(root);
    expect(ancestors.length).toBe(0);
  });

  it('should return single parent for direct child', () => {
    const ancestors = getAncestors(child1);
    expect(ancestors.length).toBe(1);
    expect(ancestors[0]).toBe(root);
  });
});

describe('findByName', () => {
  let root: THREE.Group;
  let child1: THREE.Mesh;
  let grandchild1: THREE.Mesh;

  beforeEach(() => {
    root = new THREE.Group();
    root.name = 'Root';
    child1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    child1.name = 'Child1';
    grandchild1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    grandchild1.name = 'Grandchild1';
    root.add(child1);
    child1.add(grandchild1);
  });

  it('should find root by name', () => {
    const found = findByName(root, 'Root');
    expect(found).toBe(root);
  });

  it('should find child by name', () => {
    const found = findByName(root, 'Child1');
    expect(found).toBe(child1);
  });

  it('should find deeply nested object by name', () => {
    const found = findByName(root, 'Grandchild1');
    expect(found).toBe(grandchild1);
  });

  it('should return null for non-existent name', () => {
    const found = findByName(root, 'NonExistent');
    expect(found).toBeNull();
  });

  it('should return null when searching from object that does not contain target', () => {
    const found = findByName(child1, 'Root');
    expect(found).toBeNull();
  });
});

describe('reparentSafely', () => {
  let rootA: THREE.Group;
  let rootB: THREE.Group;
  let child: THREE.Mesh;

  beforeEach(() => {
    rootA = new THREE.Group();
    rootB = new THREE.Group();
    child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    rootA.add(child);
  });

  it('should reparent child to new parent', () => {
    const result = reparentSafely(child, rootB);
    expect(result).toBe(true);
    expect(child.parent).toBe(rootB);
    expect(rootA.children.length).toBe(0);
    expect(rootB.children.length).toBe(1);
  });

  it('should prevent reparenting to self', () => {
    const result = reparentSafely(child, child);
    expect(result).toBe(false);
    expect(child.parent).toBe(rootA);
  });

  it('should prevent reparenting that creates a cycle', () => {
    const subgroup = new THREE.Group();
    rootA.add(subgroup);
    subgroup.add(child);
    const originalParent = child.parent;
    const result = reparentSafely(rootA, child);
    expect(result).toBe(false);
    expect(child.parent).toBe(originalParent);
  });

  it('should handle reparenting orphan object', () => {
    const orphan = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    const result = reparentSafely(orphan, rootB);
    expect(result).toBe(true);
    expect(orphan.parent).toBe(rootB);
  });

  it('should prevent reparenting child to its descendant', () => {
    const mid = new THREE.Group();
    rootA.add(mid);
    mid.add(child);
    const result = reparentSafely(rootA, mid);
    expect(result).toBe(false);
    expect(rootA.parent).toBeNull();
  });
});

describe('getAllMeshes', () => {
  let root: THREE.Group;

  beforeEach(() => {
    root = new THREE.Group();
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const group1 = new THREE.Group();
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    const mesh3 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    group1.add(mesh2);
    mesh2.add(mesh3);
    root.add(mesh1);
    root.add(group1);
  });

  it('should collect all meshes recursively', () => {
    const meshes = getAllMeshes(root);
    expect(meshes.length).toBe(3);
  });

  it('should return empty array for group with only non-mesh children', () => {
    const emptyGroup = new THREE.Group();
    const subGroup = new THREE.Group();
    emptyGroup.add(subGroup);
    const meshes = getAllMeshes(emptyGroup);
    expect(meshes.length).toBe(0);
  });
});

describe('getGroupChildren', () => {
  let root: THREE.Group;

  beforeEach(() => {
    root = new THREE.Group();
    const group1 = new THREE.Group();
    const group2 = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(group1);
    root.add(mesh);
    root.add(group2);
  });

  it('should return only direct group children', () => {
    const groups = getGroupChildren(root);
    expect(groups.length).toBe(2);
    expect(groups[0] instanceof THREE.Group).toBe(true);
    expect(groups[1] instanceof THREE.Group).toBe(true);
  });

  it('should exclude non-group children', () => {
    const groups = getGroupChildren(root);
    groups.forEach((g) => {
      expect(g instanceof THREE.Group).toBe(true);
    });
  });
});

describe('getMeshChildren', () => {
  let root: THREE.Group;

  beforeEach(() => {
    root = new THREE.Group();
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    const group = new THREE.Group();
    root.add(mesh1);
    root.add(group);
    root.add(mesh2);
  });

  it('should return only direct mesh children', () => {
    const meshes = getMeshChildren(root);
    expect(meshes.length).toBe(2);
    expect(meshes[0] instanceof THREE.Mesh).toBe(true);
    expect(meshes[1] instanceof THREE.Mesh).toBe(true);
  });
});

describe('getDepth', () => {
  let root: THREE.Group;
  let child: THREE.Group;
  let grandchild: THREE.Mesh;

  beforeEach(() => {
    root = new THREE.Group();
    child = new THREE.Group();
    grandchild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(child);
    child.add(grandchild);
  });

  it('should return 0 for direct child of root', () => {
    const depth = getDepth(child, root);
    expect(depth).toBe(0);
  });

  it('should return 1 for grandchild of root', () => {
    const depth = getDepth(grandchild, root);
    expect(depth).toBe(1);
  });

  it('should return increasing depth for deeper nesting', () => {
    const level3 = new THREE.Group();
    const level4 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    grandchild.add(level3);
    level3.add(level4);
    expect(getDepth(level3, root)).toBe(2);
    expect(getDepth(level4, root)).toBe(3);
  });
});
