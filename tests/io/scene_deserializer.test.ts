import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SceneDeserializer } from '../../src/io/scene_deserializer.js';
import { SceneSerializer } from '../../src/io/scene_serializer.js';
import { SceneJSON, ObjectEntry } from '../../src/io/io_types.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '../../src/managers/clip_plane_preview.js';
import {
  getGeometrySource,
  resolveGeometrySourceType
} from '../../src/texture/geometry_source.js';

describe('SceneDeserializer', () => {
  let worldGroup: THREE.Group;
  let deserializer: SceneDeserializer;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    deserializer = new SceneDeserializer();
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should deserialize empty objects to empty group', () => {
    const data: SceneJSON = { version: 1, objects: [] };
    const result = deserializer.deserialize(data, worldGroup);
    expect(result.length).toBe(0);
    expect(worldGroup.children.length).toBe(0);
  });

  it('should preserve clip plane preview helpers when clearing the world', () => {
    const previewRoot = createClipPreviewHelper();
    const staleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    staleMesh.name = 'StaleContent';
    worldGroup.add(previewRoot);
    worldGroup.add(staleMesh);
    const data = createSceneJSON([
      createBoxEntry('box-load', 'LoadedCube', 1, 1, 1)
    ]);
    deserializer.deserialize(data, worldGroup);
    expect(worldGroup.children).toContain(previewRoot);
    expect(previewRoot.parent).toBe(worldGroup);
    expect(previewRoot.children.length).toBe(1);
    expect(worldGroup.children).not.toContain(staleMesh);
    const loadedMeshes = worldGroup.children.filter(
      (child) => child instanceof THREE.Mesh
    );
    expect(loadedMeshes.length).toBe(1);
    expect(loadedMeshes[0].name).toBe('LoadedCube');
  });

  it('should deserialize single mesh with correct geometry', () => {
    const data = createSceneJSON([
      createBoxEntry('box-001', 'Cube001', 1, 1, 1)
    ]);
    const result = deserializer.deserialize(data, worldGroup);
    expect(result.length).toBe(1);
    expect(worldGroup.children.length).toBe(1);
    expect(worldGroup.children[0]).toBeInstanceOf(THREE.Mesh);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('box');
  });

  it('should deserialize mesh with correct position', () => {
    const entry = createBoxEntry('box-002', 'PosCube', 1, 1, 1);
    entry.position = { x: 5, y: 10, z: 15 };
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(mesh.position.x).toBe(5);
    expect(mesh.position.y).toBe(10);
    expect(mesh.position.z).toBe(15);
  });

  it('should deserialize mesh with correct rotation', () => {
    const entry = createBoxEntry('box-003', 'RotCube', 1, 1, 1);
    entry.rotation = { x: Math.PI / 6, y: Math.PI / 4, z: Math.PI / 3 };
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 6);
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(mesh.rotation.z).toBeCloseTo(Math.PI / 3);
  });

  it('should deserialize mesh with correct scale', () => {
    const entry = createBoxEntry('box-004', 'ScaleCube', 1, 1, 1);
    entry.scale = { x: 2, y: 3, z: 4 };
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(mesh.scale.x).toBe(2);
    expect(mesh.scale.y).toBe(3);
    expect(mesh.scale.z).toBe(4);
  });

  it('should deserialize sphere geometry correctly', () => {
    const entry = createSphereEntry('sphere-001', 'Sphere001', 2.5);
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('sphere');
    expect(getGeometrySource(mesh.geometry)?.params.radius).toBe(2.5);
  });

  it('should deserialize cylinder geometry correctly', () => {
    const entry = createCylinderEntry('cyl-001', 'Cylinder001', 0.5, 1.0, 3);
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('cylinder');
    const params = getGeometrySource(mesh.geometry)?.params ?? {};
    expect(params.radiusTop).toBe(0.5);
    expect(params.radiusBottom).toBe(1.0);
    expect(params.height).toBe(3);
  });

  it('should deserialize plane geometry correctly', () => {
    const entry = createPlaneEntry('plane-001', 'Plane001', 4, 3);
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('plane');
    const params = getGeometrySource(mesh.geometry)?.params ?? {};
    expect(params.width).toBe(4);
    expect(params.height).toBe(3);
  });

  it('should deserialize group correctly', () => {
    const entry = createGroupEntry('group-001', 'Group001');
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    expect(worldGroup.children.length).toBe(1);
    expect(worldGroup.children[0]).toBeInstanceOf(THREE.Group);
  });

  it('should deserialize nested groups with parent-child hierarchy', () => {
    const parentEntry = createGroupEntry('group-002', 'ParentGroup');
    const childEntry = createBoxEntry('box-005', 'ChildCube', 1, 1, 1);
    childEntry.parentId = 'group-002';
    const data = createSceneJSON([parentEntry, childEntry]);
    deserializer.deserialize(data, worldGroup);
    expect(worldGroup.children.length).toBe(1);
    const parentGroup = worldGroup.children[0] as THREE.Group;
    expect(parentGroup.children.length).toBe(1);
    expect(parentGroup.children[0].name).toBe('ChildCube');
  });

  it('should dispose existing children before loading', () => {
    const existingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    worldGroup.add(existingMesh);
    expect(worldGroup.children.length).toBe(1);
    const data = createSceneJSON([
      createBoxEntry('box-006', 'NewCube', 1, 1, 1)
    ]);
    deserializer.deserialize(data, worldGroup);
    expect(worldGroup.children.length).toBe(1);
    expect(worldGroup.children[0].name).toBe('NewCube');
    expect(worldGroup.children.includes(existingMesh)).toBe(false);
  });

  it('should fallback to box geometry for unknown geometry type', () => {
    const entry = createBoxEntry('box-007', 'FallbackCube', 1, 1, 1);
    entry.geometryType = undefined;
    entry.geometryParams = undefined;
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('box');
  });

  it('should use default geometry params when missing', () => {
    const entry = createBoxEntry('box-008', 'DefaultCube', 1, 1, 1);
    entry.geometryParams = {};
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('box');
  });

  it('should deserialize mesh visibility correctly', () => {
    const entry = createBoxEntry('box-009', 'HiddenCube', 1, 1, 1);
    entry.visible = false;
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(false);
  });

  it('should deserialize material color correctly', () => {
    const entry = createBoxEntry('box-010', 'RedCube', 1, 1, 1);
    entry.materialColor = 0xff0000;
    const data = createSceneJSON([entry]);
    deserializer.deserialize(data, worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0xff0000);
  });

  it('should round-trip serialize then deserialize preserving scene', () => {
    const originalGroup = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    mesh.name = 'RoundTripCube';
    mesh.position.set(10, 20, 30);
    mesh.scale.set(0.5, 1.5, 2.5);
    originalGroup.add(mesh);

    const serializer = new SceneSerializer();
    const data = serializer.serialize(originalGroup);

    const targetGroup = new THREE.Group();
    deserializer.deserialize(data, targetGroup);

    const restoredMesh = targetGroup.children[0] as THREE.Mesh;
    expect(restoredMesh.name).toBe('RoundTripCube');
    expect(restoredMesh.position.x).toBe(10);
    expect(restoredMesh.position.y).toBe(20);
    expect(restoredMesh.position.z).toBe(30);
    expect(restoredMesh.scale.x).toBe(0.5);
    expect(restoredMesh.scale.y).toBe(1.5);
    expect(restoredMesh.scale.z).toBe(2.5);
    expect(resolveGeometrySourceType(restoredMesh.geometry)).toBe('box');
    const geoParams = getGeometrySource(restoredMesh.geometry)?.params ?? {};
    expect(geoParams.width).toBe(2);
    expect(geoParams.height).toBe(3);
    expect(geoParams.depth).toBe(4);
    const mat = restoredMesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x00ff00);
  });

  it('should round-trip with groups preserving hierarchy', () => {
    const originalGroup = new THREE.Group();
    const parentGroup = new THREE.Group();
    parentGroup.name = 'Parent';
    parentGroup.position.set(5, 0, 0);
    originalGroup.add(parentGroup);

    const childMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x0000ff })
    );
    childMesh.name = 'ChildSphere';
    childMesh.position.set(0, 2, 0);
    parentGroup.add(childMesh);

    const serializer = new SceneSerializer();
    const data = serializer.serialize(originalGroup);

    const targetGroup = new THREE.Group();
    deserializer.deserialize(data, targetGroup);

    expect(targetGroup.children.length).toBe(1);
    const restoredParent = targetGroup.children[0] as THREE.Group;
    expect(restoredParent.name).toBe('Parent');
    expect(restoredParent.children.length).toBe(1);
    const restoredChild = restoredParent.children[0] as THREE.Mesh;
    expect(restoredChild.name).toBe('ChildSphere');
    expect(resolveGeometrySourceType(restoredChild.geometry)).toBe('sphere');
    const childMat = restoredChild.material as THREE.MeshStandardMaterial;
    expect(childMat.color.getHex()).toBe(0x0000ff);
  });

  it('should round-trip custom BufferGeometry without collapsing to a unit box', () => {
    const positions = [
      -2, -1, 0,
      2, -1, 0,
      2, 1, 0,
      -2, -1, 0,
      2, 1, 0,
      -2, 1, 0
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.computeVertexNormals();
    const originalMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xff8800 })
    );
    originalMesh.name = 'CsgMesh';
    originalMesh.position.set(3, 4, 5);
    const sourceGroup = new THREE.Group();
    sourceGroup.add(originalMesh);

    const serializer = new SceneSerializer();
    const data = serializer.serialize(sourceGroup);
    expect(data.objects[0].geometryType).toBe('buffer');

    deserializer.deserialize(data, worldGroup);
    const restored = worldGroup.children[0] as THREE.Mesh;
    expect(restored.name).toBe('CsgMesh');
    expect(restored.position.x).toBe(3);
    expect(restored.geometry).not.toBeInstanceOf(THREE.BoxGeometry);
    const restoredPositions = Array.from(
      restored.geometry.getAttribute('position').array as ArrayLike<number>
    );
    expect(restoredPositions).toEqual(positions);
    const mat = restored.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xff8800);
  });

  it('should rebuild decorative edges after loading a mesh', () => {
    const entry = createBoxEntry('box-edges', 'EdgeCube', 1, 1, 1);
    deserializer.deserialize(createSceneJSON([entry]), worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    const edgeChildren = mesh.children.filter(
      (child) => child instanceof THREE.LineSegments
    );
    expect(edgeChildren.length).toBeGreaterThan(0);
  });

  it('should use Checker when loading a mesh with no texture maps', () => {
    const paint = new TexturePaintState();
    paint.setLastTextureId('walls/brick.png');
    setTexturePaintStateForTests(paint);
    const entry = createBoxEntry('box-no-tex', 'BareCube', 1, 1, 1);
    delete entry.faceTextureMaps;
    deserializer.deserialize(createSceneJSON([entry]), worldGroup);
    const mesh = worldGroup.children[0] as THREE.Mesh;
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((mapEntry) => {
      expect(mapEntry.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    });
  });
});

/**
 * Creates a clip plane preview helper group as attached under the world root.
 * @returns Preview root with a marker mesh child.
 */
function createClipPreviewHelper(): THREE.Group {
  const previewRoot = new THREE.Group();
  previewRoot.name = 'clip_plane_preview';
  previewRoot.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  marker.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
  previewRoot.add(marker);
  return previewRoot;
}

/**
 * Creates a scene JSON with the given entries.
 * @param entries The object entries.
 * @returns A SceneJSON object.
 */
function createSceneJSON(entries: ObjectEntry[]): SceneJSON {
  return { version: 1, objects: entries };
}

/**
 * Creates a box object entry.
 * @param uuid The UUID.
 * @param name The name.
 * @param width Box width.
 * @param height Box height.
 * @param depth Box depth.
 * @returns A box ObjectEntry.
 */
function createBoxEntry(
  uuid: string,
  name: string,
  width: number,
  height: number,
  depth: number
): ObjectEntry {
  return {
    uuid: uuid,
    name: name,
    type: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    geometryType: 'box',
    geometryParams: { width, height, depth },
    materialColor: 0x888888
  };
}

/**
 * Creates a sphere object entry.
 * @param uuid The UUID.
 * @param name The name.
 * @param radius The sphere radius.
 * @returns A sphere ObjectEntry.
 */
function createSphereEntry(
  uuid: string,
  name: string,
  radius: number
): ObjectEntry {
  return {
    uuid: uuid,
    name: name,
    type: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    geometryType: 'sphere',
    geometryParams: { radius, widthSegments: 32, heightSegments: 32 },
    materialColor: 0x888888
  };
}

/**
 * Creates a cylinder object entry.
 * @param uuid The UUID.
 * @param name The name.
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Cylinder height.
 * @returns A cylinder ObjectEntry.
 */
function createCylinderEntry(
  uuid: string,
  name: string,
  radiusTop: number,
  radiusBottom: number,
  height: number
): ObjectEntry {
  return {
    uuid: uuid,
    name: name,
    type: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    geometryType: 'cylinder',
    geometryParams: { radiusTop, radiusBottom, height, radialSegments: 32 },
    materialColor: 0x888888
  };
}

/**
 * Creates a plane object entry.
 * @param uuid The UUID.
 * @param name The name.
 * @param width Plane width.
 * @param height Plane height.
 * @returns A plane ObjectEntry.
 */
function createPlaneEntry(
  uuid: string,
  name: string,
  width: number,
  height: number
): ObjectEntry {
  return {
    uuid: uuid,
    name: name,
    type: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    geometryType: 'plane',
    geometryParams: { width, height },
    materialColor: 0x888888
  };
}

/**
 * Creates a group object entry.
 * @param uuid The UUID.
 * @param name The name.
 * @returns A group ObjectEntry.
 */
function createGroupEntry(uuid: string, name: string): ObjectEntry {
  return {
    uuid: uuid,
    name: name,
    type: 'group',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null
  };
}
