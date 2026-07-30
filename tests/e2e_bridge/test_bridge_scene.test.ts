import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collectSceneSummary, findWorldMeshByName, summarizeObject } from '../../src/e2e_bridge/test_bridge_scene.js';

/**
 * Builds a fresh mesh with a name derived from its generated uuid to keep tests
 * free of hardcoded scene content.
 *
 * @returns Named mesh for world population.
 */
function createNamedMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = `mesh-${mesh.uuid}`;
  return mesh;
}

describe('collectSceneSummary', () => {
  it('lists direct world children with names and types', () => {
    const worldObject = new THREE.Group();
    expect(collectSceneSummary(worldObject).objects).toEqual([]);
    const mesh = createNamedMesh();
    worldObject.add(mesh);
    const summary = collectSceneSummary(worldObject);
    expect(summary.objects).toHaveLength(1);
    expect(summary.objects[0]).toEqual({ name: mesh.name, type: mesh.type });
  });

  it('excludes nested descendants so summaries match the outliner roots', () => {
    const worldObject = new THREE.Group();
    const parent = createNamedMesh();
    const nestedChild = createNamedMesh();
    parent.add(nestedChild);
    worldObject.add(parent);
    const names = collectSceneSummary(worldObject).objects.map((object) => object.name);
    expect(names).toContain(parent.name);
    expect(names).not.toContain(nestedChild.name);
  });
});

describe('summarizeObject', () => {
  it('reports the live name and type of the object', () => {
    const mesh = createNamedMesh();
    expect(summarizeObject(mesh)).toEqual({ name: mesh.name, type: 'Mesh' });
  });
});

describe('findWorldMeshByName', () => {
  it('finds meshes, ignores non-mesh children, and reports misses', () => {
    const worldObject = new THREE.Group();
    const group = new THREE.Group();
    const mesh = createNamedMesh();
    group.name = mesh.name;
    worldObject.add(group);
    expect(findWorldMeshByName(worldObject, mesh.name)).toBeNull();
    worldObject.add(mesh);
    expect(findWorldMeshByName(worldObject, mesh.name)).toBe(mesh);
    expect(findWorldMeshByName(worldObject, `${mesh.name}-missing`)).toBeNull();
  });
});
