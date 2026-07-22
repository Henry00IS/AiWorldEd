import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ObjectDuplicator } from '../../src/managers/object_duplicator.js';

describe('ObjectDuplicator', () => {
  let originalMesh: THREE.Mesh;
  let originalGeometry: THREE.BufferGeometry;
  let originalMaterial: THREE.Material;

  beforeEach(() => {
    originalGeometry = new THREE.BoxGeometry(1, 1, 1);
    originalMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    originalMesh = new THREE.Mesh(originalGeometry, originalMaterial);
    originalMesh.position.set(2, 3, 4);
    originalMesh.rotation.set(0.1, 0.2, 0.3);
    originalMesh.scale.set(2, 2, 2);
    originalMesh.name = 'Cube001';
    const edges = new THREE.EdgesGeometry(originalGeometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xaaaaaa }));
    originalMesh.add(line);
  });

  it('should produce independent geometry clone', () => {
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    expect(clones.length).toBe(1);
    const cloneGeometry = clones[0].geometry;
    const originalPositions = originalGeometry.attributes.position;
    const clonePositions = cloneGeometry.attributes.position;
    originalPositions.setX(0, 999);
    expect(clonePositions.getX(0)).not.toBe(999);
  });

  it('should produce independent material clone', () => {
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const cloneMaterial = clones[0].material as THREE.Material;
    originalMaterial.color.set(0xff0000);
    expect(cloneMaterial.color.getHex()).toBe(0x888888);
  });

  it('should preserve wireframe edges on clone', () => {
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const clone = clones[0];
    const lineChildren = clone.children.filter(
      (c) => c instanceof THREE.LineSegments
    );
    expect(lineChildren.length).toBe(1);
  });

  it('should not copy selection highlight overlays onto the clone', () => {
    const highlightEdges = new THREE.EdgesGeometry(originalGeometry);
    const highlight = new THREE.LineSegments(
      highlightEdges,
      new THREE.LineBasicMaterial({ color: 0xe86a17 })
    );
    highlight.userData.isSelectionHighlight = true;
    originalMesh.add(highlight);
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const clone = clones[0];
    const highlightCopies = clone.children.filter(
      (child) =>
        child instanceof THREE.LineSegments &&
        child.userData.isSelectionHighlight === true
    );
    expect(highlightCopies.length).toBe(0);
    const decorativeLines = clone.children.filter(
      (child) => child instanceof THREE.LineSegments
    );
    expect(decorativeLines.length).toBe(1);
  });

  it('should keep the same position when offset is zero', () => {
    const offset = new THREE.Vector3(0, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const clone = clones[0];
    expect(clone.position.x).toBeCloseTo(2);
    expect(clone.position.y).toBeCloseTo(3);
    expect(clone.position.z).toBeCloseTo(4);
  });

  it('should still apply a non-zero offset when one is provided', () => {
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const clone = clones[0];
    expect(clone.position.x).toBeCloseTo(3);
    expect(clone.position.y).toBeCloseTo(3);
    expect(clone.position.z).toBeCloseTo(4);
  });

  it('should generate first copy name correctly', () => {
    const name = ObjectDuplicator.getNextDuplicateName('Cube001');
    expect(name).toBe('Cube001_copy');
  });

  it('should generate subsequent copy names correctly', () => {
    const firstCopy = ObjectDuplicator.getNextDuplicateName('Cube001');
    expect(firstCopy).toBe('Cube001_copy');
    const secondCopy = ObjectDuplicator.getNextDuplicateName(firstCopy);
    expect(secondCopy).toBe('Cube001_copy2');
    const thirdCopy = ObjectDuplicator.getNextDuplicateName(secondCopy);
    expect(thirdCopy).toBe('Cube001_copy3');
  });

  it('should duplicate multiple objects', () => {
    const mesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x999999 })
    );
    mesh2.position.set(5, 6, 7);
    mesh2.name = 'Sphere001';
    const offset = new THREE.Vector3(1, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh, mesh2], offset);
    expect(clones.length).toBe(2);
    expect(clones[0].name).toBe('Cube001_copy');
    expect(clones[1].name).toBe('Sphere001_copy');
    expect(clones[0].position.x).toBeCloseTo(3);
    expect(clones[1].position.x).toBeCloseTo(6);
  });

  it('should duplicate single object and not add to any parent', () => {
    const offset = new THREE.Vector3(0, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    expect(clones.length).toBe(1);
    expect(clones[0].parent).toBeNull();
  });

  it('should preserve rotation and scale on clone', () => {
    const offset = new THREE.Vector3(0, 0, 0);
    const clones = ObjectDuplicator.duplicate([originalMesh], offset);
    const clone = clones[0];
    expect(clone.scale.x).toBeCloseTo(2);
    expect(clone.scale.y).toBeCloseTo(2);
    expect(clone.scale.z).toBeCloseTo(2);
    const originalEuler = new THREE.Euler().setFromQuaternion(originalMesh.quaternion);
    const cloneEuler = new THREE.Euler().setFromQuaternion(clone.quaternion);
    expect(cloneEuler.x).toBeCloseTo(originalEuler.x);
    expect(cloneEuler.y).toBeCloseTo(originalEuler.y);
    expect(cloneEuler.z).toBeCloseTo(originalEuler.z);
  });
});
