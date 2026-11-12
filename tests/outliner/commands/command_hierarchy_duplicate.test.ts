import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { hierarchyDuplicateKindOf } from '@/outliner/hierarchy/hierarchy_duplicate_clone.js';
import { CommandStack } from '@/commands/command_stack.js';
import { isDecorativeEdge, rebuildDecorativeEdges } from '@/utils/mesh_edge_sync.js';
import { formatHierarchyHexIndex, hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

describe('CommandHierarchyDuplicate', () => {
  let parent: THREE.Group;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;
  let offset: THREE.Vector3;

  beforeEach(() => {
    parent = new THREE.Group();
    offset = new THREE.Vector3(1, 0, 0);
    mesh1 = createBoxMesh('Cube001', new THREE.Vector3(0, 0, 0));
    parent.add(mesh1);
    mesh2 = createSphereMesh('Sphere001', new THREE.Vector3(5, 0, 0));
    parent.add(mesh2);
  });

  it('should execute and add the clone right after its source', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    expect(parent.children.length).toBe(3);
    expect(parent.children[2]).toBe(mesh2);
    const clone = parent.children[1]!;
    expect(clone.name.startsWith('Cube001.') || clone.name.startsWith('Cube.')).toBe(true);
    expect(clone.name).not.toBe('Cube001');
    expect(clone.position.x).toBeCloseTo(1);
  });

  it('should undo and remove clones from parent', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    expect(parent.children.length).toBe(3);
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(parent.children[0]!.name).toBe('Cube001');
  });

  it('should redo and re-add clones after undo', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(2);
    command.execute();
    expect(parent.children.length).toBe(3);
  });

  it('should produce independent objects with separate resources', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    const clone = parent.children[1] as THREE.Mesh;
    mesh1.geometry.dispose();
    expect(clone.geometry).toBeDefined();
    const originalMaterial = mesh1.material as THREE.MeshStandardMaterial;
    originalMaterial.color.set(0xff0000);
    const cloneMaterial = (clone.material as THREE.MeshStandardMaterial).color;
    expect(cloneMaterial.getHex()).toBe(0x888888);
  });

  it('should duplicate multiple objects and preserve all clones', () => {
    const command = new CommandHierarchyDuplicate([mesh1, mesh2], offset);
    command.execute();
    expect(parent.children.length).toBe(4);
    expect(parent.children[0]).toBe(mesh1);
    expect(parent.children[2]).toBe(mesh2);
    expect(parent.children[1]!.name).not.toBe('Cube001');
    expect(parent.children[3]!.name).not.toBe('Sphere001');
    expect(parent.children[1]!.name).not.toBe(parent.children[3]!.name);
  });

  it('should detach the clone on undo and put the same clone back on redo', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    const clones = command.getClones();
    expect(clones.length).toBe(1);
    command.undo();
    const clone = clones[0]!;
    expect(clone.parent).toBeNull();
    command.execute();
    expect(parent.children[1]).toBe(clone);
  });

  it('should handle empty input as no-op', () => {
    const command = new CommandHierarchyDuplicate([], offset);
    command.execute();
    expect(parent.children.length).toBe(2);
    command.undo();
    expect(parent.children.length).toBe(2);
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    stack.push(command);
    expect(parent.children.length).toBe(3);
    stack.undo();
    expect(parent.children.length).toBe(2);
    stack.redo();
    expect(parent.children.length).toBe(3);
  });

  it('should preserve rotation and scale on cloned mesh', () => {
    mesh1.scale.set(3, 3, 3);
    mesh1.rotation.set(0.5, 0.5, 0);
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    const clone = parent.children[1]!;
    expect(clone.scale.x).toBeCloseTo(3);
    expect(clone.scale.y).toBeCloseTo(3);
    expect(clone.scale.z).toBeCloseTo(3);
    const cloneEuler = new THREE.Euler().setFromQuaternion(clone.quaternion);
    expect(cloneEuler.x).toBeCloseTo(0.5);
    expect(cloneEuler.y).toBeCloseTo(0.5);
  });

  it('should not execute twice on double execute call', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    command.execute();
    expect(parent.children.length).toBe(3);
  });

  it('should no-op undo when execute has not run', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.undo();
    expect(parent.children.length).toBe(2);
    expect(command.getClones().length).toBe(0);
  });

  it('should ignore mutations to the source array after construction', () => {
    const sources = [mesh1];
    const command = new CommandHierarchyDuplicate(sources, offset);
    sources.pop();
    command.execute();
    expect(parent.children.length).toBe(3);
    expect(parent.children[1]!.name).not.toBe('Cube001');
  });

  it('should copy a plain group with its meshes and leave editor helpers out', () => {
    const group = new THREE.Group();
    group.name = 'Props';
    parent.add(group);
    group.add(createBoxMesh('Crate', new THREE.Vector3(1, 0, 0)));
    const guide = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    guide.userData['isBoundsGuideLines'] = true;
    group.add(guide);
    const command = new CommandHierarchyDuplicate([group], offset);
    command.execute();
    const clone = command.getClones()[0]!;
    expect(clone.parent).toBe(parent);
    expect(clone.position.x).toBeCloseTo(1);
    expect(clone.children).toHaveLength(1);
    expect(clone.children[0]).toBeInstanceOf(THREE.Mesh);
    expect(clone.children[0]!.position.x).toBeCloseTo(1);
  });

  it('should leave internal render objects out without an error', () => {
    const group = new THREE.Group();
    parent.add(group);
    group.add(createBoxMesh('Crate', new THREE.Vector3()));
    group.add(new THREE.PointLight());
    group.add(new THREE.Object3D());
    expect(hierarchyDuplicateKindOf(group.children[1]!)).toBe('helper');
    expect(hierarchyDuplicateKindOf(group.children[2]!)).toBe('helper');
    const command = new CommandHierarchyDuplicate([group], offset);
    command.execute();
    const clone = command.getClones()[0]!;
    expect(clone.children).toHaveLength(1);
    expect(clone.children[0]).toBeInstanceOf(THREE.Mesh);
  });

  it('should copy the decorative outline of a mesh but not its selection highlight', () => {
    const highlight = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    highlight.userData['isSelectionHighlight'] = true;
    mesh1.add(highlight);
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    const clone = command.getClones()[0]!;
    expect(clone.children.some((child) => child.userData['isSelectionHighlight'] === true)).toBe(false);
    expect(clone.children.filter(isDecorativeEdge)).toHaveLength(1);
  });

  it('should allocate unique hex names for copies', () => {
    hierarchyNameAllocator.reset();
    mesh1.name = `Cube.${formatHierarchyHexIndex(1)}`;
    mesh2.name = `Sphere.${formatHierarchyHexIndex(2)}`;
    hierarchyNameAllocator.noteExistingName(mesh1.name);
    hierarchyNameAllocator.noteExistingName(mesh2.name);
    const command = new CommandHierarchyDuplicate([mesh1, mesh2], new THREE.Vector3());
    command.execute();
    const [cube, sphere] = command.getClones();
    expect(cube!.name).toBe(`Cube.${formatHierarchyHexIndex(3)}`);
    expect(sphere!.name).toBe(`Sphere.${formatHierarchyHexIndex(4)}`);
    expect(cube!.position.toArray()).toEqual(mesh1.position.toArray());
  });

  it('should return a defensive copy from getClones', () => {
    const command = new CommandHierarchyDuplicate([mesh1], offset);
    command.execute();
    const first = command.getClones();
    first.length = 0;
    expect(command.getClones().length).toBe(1);
  });
});

/**
 * Creates a box mesh with wireframe edges for testing.
 *
 * @param name The mesh display name.
 * @param position The mesh position vector.
 * @returns The configured box mesh.
 */
function createBoxMesh(name: string, position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  rebuildDecorativeEdges(mesh);
  return mesh;
}

/**
 * Creates a sphere mesh for testing.
 *
 * @param name The mesh display name.
 * @param position The mesh position vector.
 * @returns The configured sphere mesh.
 */
function createSphereMesh(name: string, position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x999999 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  return mesh;
}
