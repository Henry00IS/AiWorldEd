import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { SelectionHighlight } from '../../src/selection/selection_highlight.js';

describe('SelectionHighlight', () => {
  let scene: THREE.Scene;
  let highlight: SelectionHighlight;
  let testMesh: THREE.Mesh;

  beforeEach(() => {
    scene = new THREE.Scene();
    highlight = new SelectionHighlight(scene, Theme);
    testMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
  });

  it('should create without errors', () => {
    expect(highlight).toBeDefined();
  });

  it('should apply highlight to a mesh', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    );
    expect(lineSegments).toBeDefined();
  });

  it('should not reparent a mesh into the scene when applying highlight', () => {
    const world = new THREE.Group();
    world.add(testMesh);
    scene.add(world);
    highlight.apply(testMesh);
    expect(testMesh.parent).toBe(world);
    expect(scene.children.includes(testMesh)).toBe(false);
  });

  it('should ignore meshes that are not in this scene graph', () => {
    highlight.apply(testMesh);
    expect(testMesh.children.length).toBe(0);
    expect(highlight.getHighlightedMeshes().size).toBe(0);
  });

  it('should use the correct selection color for highlights', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    ) as THREE.LineSegments;
    const material = lineSegments.material as THREE.LineBasicMaterial;
    expect(material.color.getHex()).toBe(Theme.selectionColor);
  });

  it('should not duplicate highlights on repeated apply calls', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.apply(testMesh);
    const lineCount = testMesh.children.filter(
      (child) => child instanceof THREE.LineSegments
    ).length;
    expect(lineCount).toBe(1);
  });

  it('should remove highlight from a mesh', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.remove(testMesh);
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    );
    expect(lineSegments).toBeUndefined();
  });

  it('should handle removal of non-highlighted mesh without error', () => {
    scene.add(testMesh);
    expect(() => highlight.remove(testMesh)).not.toThrow();
  });

  it('should clear all highlights', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh1);
    scene.add(mesh2);
    highlight.apply(mesh1);
    highlight.apply(mesh2);
    highlight.clearAll();
    const lines1 = mesh1.children.filter(
      (child) => child instanceof THREE.LineSegments
    ).length;
    const lines2 = mesh2.children.filter(
      (child) => child instanceof THREE.LineSegments
    ).length;
    expect(lines1).toBe(0);
    expect(lines2).toBe(0);
  });

  it('should update color on all active highlights', () => {
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh1);
    scene.add(mesh2);
    highlight.apply(mesh1);
    highlight.apply(mesh2);
    const newColor = 0xff0000;
    highlight.updateColor(newColor);
    mesh1.children.forEach((child) => {
      if (child instanceof THREE.LineSegments) {
        const mat = child.material as THREE.LineBasicMaterial;
        expect(mat.color.getHex()).toBe(newColor);
      }
    });
    mesh2.children.forEach((child) => {
      if (child instanceof THREE.LineSegments) {
        const mat = child.material as THREE.LineBasicMaterial;
        expect(mat.color.getHex()).toBe(newColor);
      }
    });
  });

  it('should track highlighted meshes correctly', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const highlighted = highlight.getHighlightedMeshes();
    expect(highlighted.has(testMesh)).toBe(true);
    expect(highlighted.size).toBe(1);
  });

  it('should dispose and clean up highlights', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    highlight.dispose();
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    );
    expect(lineSegments).toBeUndefined();
  });

  it('should keep outline parented at local origin after syncTransforms', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    testMesh.position.set(4, 5, 6);
    highlight.syncTransforms();
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    ) as THREE.LineSegments;
    expect(lineSegments.parent).toBe(testMesh);
    expect(lineSegments.position.x).toBe(0);
    expect(lineSegments.position.y).toBe(0);
    expect(lineSegments.position.z).toBe(0);
  });

  it('should follow mesh translation because outline is a child', () => {
    scene.add(testMesh);
    highlight.apply(testMesh);
    const lineSegments = testMesh.children.find(
      (child) => child instanceof THREE.LineSegments
    ) as THREE.LineSegments;
    testMesh.position.set(7, 8, 9);
    testMesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    lineSegments.getWorldPosition(worldPos);
    expect(worldPos.x).toBeCloseTo(7);
    expect(worldPos.y).toBeCloseTo(8);
    expect(worldPos.z).toBeCloseTo(9);
  });
});
