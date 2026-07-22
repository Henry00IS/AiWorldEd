import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '../../src/io/scene_serializer.js';

describe('SceneSerializer', () => {
  let worldGroup: THREE.Group;
  let serializer: SceneSerializer;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    serializer = new SceneSerializer();
  });

  it('should serialize empty group to empty objects array', () => {
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(0);
  });

  it('should set version number to 3', () => {
    const result = serializer.serialize(worldGroup);
    expect(result.version).toBe(3);
  });

  it('should serialize single mesh with correct position', () => {
    const mesh = createBoxAtPosition(1, 2, 3);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(1);
    expect(result.objects[0].position.x).toBe(1);
    expect(result.objects[0].position.y).toBe(2);
    expect(result.objects[0].position.z).toBe(3);
  });

  it('should serialize single mesh with correct rotation', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.rotation.set(Math.PI / 6, Math.PI / 4, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].rotation.x).toBeCloseTo(Math.PI / 6);
    expect(result.objects[0].rotation.y).toBeCloseTo(Math.PI / 4);
    expect(result.objects[0].rotation.z).toBe(0);
  });

  it('should serialize single mesh with correct scale', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.scale.set(2, 3, 4);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].scale.x).toBe(2);
    expect(result.objects[0].scale.y).toBe(3);
    expect(result.objects[0].scale.z).toBe(4);
  });

  it('should serialize mesh name correctly', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.name = 'MyCube';
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].name).toBe('MyCube');
  });

  it('should serialize mesh visibility correctly', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.visible = false;
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].visible).toBe(false);
  });

  it('should preserve UUID from the mesh', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].uuid).toBe(mesh.uuid);
  });

  it('should serialize mesh type as mesh', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].type).toBe('mesh');
  });

  it('should serialize box geometry type correctly', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryType).toBe('box');
  });

  it('should serialize box geometry parameters', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.geometry = new THREE.BoxGeometry(2, 3, 4);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryParams?.width).toBe(2);
    expect(result.objects[0].geometryParams?.height).toBe(3);
    expect(result.objects[0].geometryParams?.depth).toBe(4);
  });

  it('should serialize sphere geometry type and parameters', () => {
    const mesh = createSphereAtPosition(1.5, 0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryType).toBe('sphere');
    expect(result.objects[0].geometryParams?.radius).toBe(1.5);
    expect(result.objects[0].geometryParams?.widthSegments).toBe(32);
    expect(result.objects[0].geometryParams?.heightSegments).toBe(32);
  });

  it('should serialize cylinder geometry type and parameters', () => {
    const mesh = createCylinderAtPosition(0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryType).toBe('cylinder');
    expect(result.objects[0].geometryParams?.radiusTop).toBe(0.5);
    expect(result.objects[0].geometryParams?.radiusBottom).toBe(1.0);
    expect(result.objects[0].geometryParams?.height).toBe(2);
  });

  it('should serialize plane geometry type and parameters', () => {
    const mesh = createPlaneAtPosition(0, 0, 0);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryType).toBe('plane');
    expect(result.objects[0].geometryParams?.width).toBe(3);
    expect(result.objects[0].geometryParams?.height).toBe(2);
  });

  it('should serialize material color', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.color.setHex(0xff0000);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].materialColor).toBe(0xff0000);
  });

  it('should serialize nested groups with correct parent ID', () => {
    const group = new THREE.Group();
    group.name = 'NestedGroup';
    worldGroup.add(group);
    const mesh = createBoxAtPosition(1, 0, 0);
    mesh.name = 'ChildMesh';
    group.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(2);
    const groupEntry = result.objects.find((o) => o.name === 'NestedGroup');
    const meshEntry = result.objects.find((o) => o.name === 'ChildMesh');
    expect(groupEntry).toBeDefined();
    expect(meshEntry).toBeDefined();
    if (groupEntry && meshEntry) {
      expect(meshEntry.parentId).toBe(groupEntry.uuid);
    }
  });

  it('should serialize group type correctly', () => {
    const group = new THREE.Group();
    group.name = 'TestGroup';
    worldGroup.add(group);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].type).toBe('group');
  });

  it('should serialize group with transform data', () => {
    const group = new THREE.Group();
    group.name = 'TransformedGroup';
    group.position.set(5, 10, 15);
    group.scale.set(2, 2, 2);
    worldGroup.add(group);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].position.x).toBe(5);
    expect(result.objects[0].position.y).toBe(10);
    expect(result.objects[0].position.z).toBe(15);
    expect(result.objects[0].scale.x).toBe(2);
  });

  it('should serialize multiple meshes independently', () => {
    const mesh1 = createBoxAtPosition(0, 0, 0);
    mesh1.name = 'Cube1';
    worldGroup.add(mesh1);
    const mesh2 = createSphereAtPosition(1, 5, 0, 0);
    mesh2.name = 'Sphere1';
    worldGroup.add(mesh2);
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(2);
  });

  it('should serialize deeply nested hierarchy', () => {
    const outerGroup = new THREE.Group();
    outerGroup.name = 'Outer';
    worldGroup.add(outerGroup);
    const innerGroup = new THREE.Group();
    innerGroup.name = 'Inner';
    outerGroup.add(innerGroup);
    const mesh = createBoxAtPosition(0, 0, 0);
    mesh.name = 'DeepMesh';
    innerGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(3);
    const outerEntry = result.objects.find((o) => o.name === 'Outer');
    const innerEntry = result.objects.find((o) => o.name === 'Inner');
    const meshEntry = result.objects.find((o) => o.name === 'DeepMesh');
    if (outerEntry && innerEntry && meshEntry) {
      expect(innerEntry.parentId).toBe(outerEntry.uuid);
      expect(meshEntry.parentId).toBe(innerEntry.uuid);
    }
  });

  it('should serialize custom BufferGeometry as buffer type with vertex data', () => {
    const mesh = createCustomBufferMesh();
    mesh.name = 'CsgResult';
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects[0].geometryType).toBe('buffer');
    expect(result.objects[0].geometryData).toBeDefined();
    expect(result.objects[0].geometryData!.position.length).toBeGreaterThan(0);
  });

  it('should not serialize decorative edge line children as objects', () => {
    const mesh = createBoxAtPosition(0, 0, 0);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    mesh.add(edges);
    worldGroup.add(mesh);
    const result = serializer.serialize(worldGroup);
    expect(result.objects.length).toBe(1);
    expect(result.objects[0].type).toBe('mesh');
  });
});

/**
 * Creates a box mesh at a given position with a standard material.
 * @param x X position.
 * @param y Y position.
 * @param z Z position.
 * @returns The created mesh.
 */
function createBoxAtPosition(x: number, y: number, z: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Creates a sphere mesh at a given position with a standard material.
 * @param radius The sphere radius.
 * @param x X position.
 * @param y Y position.
 * @param z Z position.
 * @returns The created mesh.
 */
function createSphereAtPosition(
  radius: number,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Creates a cylinder mesh at a given position with a standard material.
 * @param x X position.
 * @param y Y position.
 * @param z Z position.
 * @returns The created mesh.
 */
function createCylinderAtPosition(x: number, y: number, z: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.5, 1.0, 2, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Creates a plane mesh at a given position with a standard material.
 * @param x X position.
 * @param y Y position.
 * @param z Z position.
 * @returns The created mesh.
 */
function createPlaneAtPosition(x: number, y: number, z: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(3, 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Creates a mesh with plain BufferGeometry similar to CSG output.
 * @returns A mesh whose geometry is not a named primitive class.
 */
function createCustomBufferMesh(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -1, -1, 0,
        1, -1, 0,
        1, 1, 0,
        -1, -1, 0,
        1, 1, 0,
        -1, 1, 0
      ],
      3
    )
  );
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x4488ff });
  return new THREE.Mesh(geometry, material);
}
