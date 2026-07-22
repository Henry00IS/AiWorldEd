import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '../../src/io/scene_serializer.js';
import { SceneDeserializer } from '../../src/io/scene_deserializer.js';
import { SceneJSON, ObjectEntry } from '../../src/io/io_types.js';

describe('SceneJSON round-trip validation', () => {
  let serializer: SceneSerializer;
  let deserializer: SceneDeserializer;

  beforeEach(() => {
    serializer = new SceneSerializer();
    deserializer = new SceneDeserializer();
  });

  it('should produce SceneJSON with numeric version from serializer', () => {
    const group = new THREE.Group();
    const result = serializer.serialize(group);
    expect(typeof result.version).toBe('number');
    expect(result.version).toBeGreaterThan(0);
  });

  it('should produce SceneJSON with objects array from serializer', () => {
    const group = new THREE.Group();
    const result = serializer.serialize(group);
    expect(Array.isArray(result.objects)).toBe(true);
  });

  it('should produce valid ObjectEntry with all required fields', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.uuid).toBeDefined();
    expect(typeof entry.uuid).toBe('string');
    expect(typeof entry.name).toBe('string');
    expect(entry.type).toBe('mesh');
    expect(entry.position).toBeDefined();
    expect(entry.rotation).toBeDefined();
    expect(entry.scale).toBeDefined();
    expect(typeof entry.visible).toBe('boolean');
    expect(entry.parentId).toBeDefined();
  });

  it('should produce ObjectEntry with geometry fields for mesh types', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.geometryType).toBeDefined();
    expect(entry.geometryParams).toBeDefined();
    expect(typeof entry.materialColor).toBe('number');
  });

  it('should produce ObjectEntry with group UUID as parentId for direct children', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.parentId).toBe(group.uuid);
  });

  it('should produce ObjectEntry with group type and no geometry fields', () => {
    const group = new THREE.Group();
    const childGroup = new THREE.Group();
    childGroup.name = 'TestGroup';
    group.add(childGroup);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.type).toBe('group');
    expect(entry.geometryType).toBeUndefined();
    expect(entry.geometryParams).toBeUndefined();
    expect(entry.materialColor).toBeUndefined();
  });

  it('should produce ObjectEntry with string parentId for nested objects', () => {
    const group = new THREE.Group();
    const parentGroup = new THREE.Group();
    parentGroup.name = 'Parent';
    group.add(parentGroup);
    const mesh = createMeshWithGeometry('box');
    mesh.name = 'Child';
    parentGroup.add(mesh);
    const sceneData = serializer.serialize(group);
    const parentEntry = sceneData.objects.find(
      (o) => o.name === 'Parent'
    );
    const childEntry = sceneData.objects.find(
      (o) => o.name === 'Child'
    );
    if (parentEntry && childEntry) {
      expect(typeof childEntry.parentId).toBe('string');
      expect(childEntry.parentId).toBe(parentEntry.uuid);
    }
  });

  it('should produce ObjectEntry with position containing x, y, z', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    mesh.position.set(-5, 10, -3);
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.position.x).toBe(-5);
    expect(entry.position.y).toBe(10);
    expect(entry.position.z).toBe(-3);
  });

  it('should produce ObjectEntry with rotation containing x, y, z', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    mesh.rotation.set(Math.PI / 4, Math.PI / 3, 0);
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.rotation.x).toBeCloseTo(Math.PI / 4);
    expect(entry.rotation.y).toBeCloseTo(Math.PI / 3);
    expect(entry.rotation.z).toBe(0);
  });

  it('should produce ObjectEntry with scale containing x, y, z', () => {
    const group = new THREE.Group();
    const mesh = createMeshWithGeometry('box');
    mesh.scale.set(2, 3, 4);
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.scale.x).toBe(2);
    expect(entry.scale.y).toBe(3);
    expect(entry.scale.z).toBe(4);
  });

  it('should round-trip all geometry types through deserializer', () => {
    const sourceGroup = new THREE.Group();
    const boxMesh = createMeshWithGeometry('box');
    boxMesh.name = 'BoxMesh';
    sourceGroup.add(boxMesh);
    const sphereMesh = createMeshWithGeometry('sphere');
    sphereMesh.name = 'SphereMesh';
    sourceGroup.add(sphereMesh);
    const cylinderMesh = createMeshWithGeometry('cylinder');
    cylinderMesh.name = 'CylinderMesh';
    sourceGroup.add(cylinderMesh);
    const planeMesh = createMeshWithGeometry('plane');
    planeMesh.name = 'PlaneMesh';
    sourceGroup.add(planeMesh);

    const sceneData = serializer.serialize(sourceGroup);

    const targetGroup = new THREE.Group();
    deserializer.deserialize(sceneData, targetGroup);

    expect(targetGroup.children.length).toBe(4);
  });

  it('should round-trip buffer geometry type through deserializer', () => {
    const sourceGroup = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x123456 })
    );
    mesh.name = 'BufferMesh';
    sourceGroup.add(mesh);
    const sceneData = serializer.serialize(sourceGroup);
    expect(sceneData.objects[0].geometryType).toBe('buffer');
    const targetGroup = new THREE.Group();
    deserializer.deserialize(sceneData, targetGroup);
    const restored = targetGroup.children[0] as THREE.Mesh;
    expect(restored.geometry.getAttribute('position').count).toBe(3);
  });

  it('should accept SceneJSON with version zero in deserializer', () => {
    const data: SceneJSON = { version: 0, objects: [] };
    const targetGroup = new THREE.Group();
    deserializer.deserialize(data, targetGroup);
    expect(targetGroup.children.length).toBe(0);
  });

  it('should accept ObjectEntry with empty name string', () => {
    const mesh = createMeshWithGeometry('box');
    mesh.name = '';
    const group = new THREE.Group();
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.name).toBe('');

    const targetGroup = new THREE.Group();
    deserializer.deserialize(sceneData, targetGroup);
    expect(targetGroup.children[0].name).toBe('');
  });

  it('should accept ObjectEntry with visible false', () => {
    const mesh = createMeshWithGeometry('box');
    mesh.visible = false;
    const group = new THREE.Group();
    group.add(mesh);
    const sceneData = serializer.serialize(group);
    const entry = sceneData.objects[0];
    expect(entry.visible).toBe(false);

    const targetGroup = new THREE.Group();
    deserializer.deserialize(sceneData, targetGroup);
    expect(targetGroup.children[0].visible).toBe(false);
  });
});

/**
 * Creates a mesh with the specified geometry type.
 * @param geometryType The type of geometry to create.
 * @returns The created mesh.
 */
function createMeshWithGeometry(
  geometryType: 'box' | 'sphere' | 'cylinder' | 'plane'
): THREE.Mesh {
  let geometry: THREE.BufferGeometry;
  if (geometryType === 'box') {
    geometry = new THREE.BoxGeometry(1, 1, 1);
  } else if (geometryType === 'sphere') {
    geometry = new THREE.SphereGeometry(1, 32, 32);
  } else if (geometryType === 'cylinder') {
    geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
  } else {
    geometry = new THREE.PlaneGeometry(1, 1);
  }
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  return new THREE.Mesh(geometry, material);
}
