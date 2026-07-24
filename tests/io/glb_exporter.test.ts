import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GlbExporter } from '../../src/io/glb_exporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import { buildExportRootTransform } from '../../src/io/coordinate_space_transform.js';
import type { GameProfile } from '../../src/settings/settings_types.js';

/** GLB file format magic number (little-endian 'glTF'). */
const GLB_MAGIC_NUMBER = 0x46546c67;

describe('GlbExporter', () => {
  let worldGroup: THREE.Group;
  let exporter: GlbExporter;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    exporter = new GlbExporter();
  });

  it('should produce non-empty ArrayBuffer for a single mesh', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should produce valid GLB header for empty group', async () => {
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    expect(magic).toBe(GLB_MAGIC_NUMBER);
  });

  it('should produce larger buffer for multiple meshes', async () => {
    const mesh1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    const mesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    const mesh3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1, 2, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    worldGroup.add(mesh1);
    worldGroup.add(mesh2);
    worldGroup.add(mesh3);
    const buffer = await exporter.export(worldGroup);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });

  it('should export scene with groups as valid binary', async () => {
    const group = new THREE.Group();
    group.name = 'TestGroup';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    group.add(mesh);
    worldGroup.add(group);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    expect(magic).toBe(GLB_MAGIC_NUMBER);
  });

  it('should export plane geometry correctly', async () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    mesh.rotation.x = -Math.PI / 2;
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should bake the active Blender centimeter profile into the export root transform', () => {
    const profile = createDefaultGameProfile('p-blender-cm', 'Blender cm');
    profile.metricUnit = 'centimeter';
    profile.coordinateSpace = getBuiltInCoordinateSpace('blender')!;
    const matrix = buildExportRootTransform(profile);
    const editorUpUnit = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
    expect(editorUpUnit.z).toBeCloseTo(100, 5);
  });

  it('should produce a valid GLB buffer through the profile-aware path', async () => {
    const profile = createDefaultGameProfile('p-blender-cm', 'Blender cm');
    profile.metricUnit = 'centimeter';
    profile.coordinateSpace = getBuiltInCoordinateSpace('blender')!;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup, profile);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    expect(magic).toBe(GLB_MAGIC_NUMBER);
  });

  it('should keep the original world group parented after a profile-aware export', async () => {
    const profile = createDefaultGameProfile('p-blender-cm', 'Blender cm');
    profile.metricUnit = 'centimeter';
    profile.coordinateSpace = getBuiltInCoordinateSpace('blender')!;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    worldGroup.add(mesh);
    const originalParent = mesh.parent;
    await exporter.export(worldGroup, profile);
    expect(mesh.parent).toBe(originalParent);
  });

  it.each([
    ['Unity', createLeftHandedProfile('unity')],
    ['Unreal Engine', createLeftHandedProfile('unreal')],
    ['custom', createCustomLeftHandedProfile()]
  ])(
    'should round-trip %s geometry with reflected positions normals and winding',
    async (_name, profile) => {
      const sourceMesh = createNamedTriangleMesh();
      const sourcePositions = readTrianglePositions(sourceMesh);
      const sourceNormal = readFirstNormal(sourceMesh);
      worldGroup.add(sourceMesh);

      const buffer = await exporter.export(worldGroup, profile);
      const exportedMesh = await loadNamedMesh(buffer, sourceMesh.name);
      const exportedPositions = readTrianglePositions(exportedMesh);
      const expectedTransform = buildExportRootTransform(profile);
      const expectedPositions = transformPositions(sourcePositions, expectedTransform);
      const expectedNormal = transformNormal(sourceNormal, expectedTransform);
      const exportedNormal = transformNormal(
        readFirstNormal(exportedMesh),
        exportedMesh.matrixWorld
      );

      expectVectorsToMatch(exportedPositions, expectedPositions);
      expect(readFirstNormal(exportedMesh)).toEqual(sourceNormal);
      expect(exportedMesh.matrixWorld.determinant()).toBeLessThan(0);
      expect(exportedNormal.dot(expectedNormal)).toBeCloseTo(1, 6);
      expect(getTriangleNormal(exportedPositions).dot(exportedNormal)).toBeCloseTo(-1, 6);
    }
  );
});

/**
 * Creates a meter-based profile for one built-in left-handed coordinate space.
 * @param presetId Built-in left-handed preset identifier.
 * @returns Game profile using the requested coordinate space.
 */
function createLeftHandedProfile(presetId: 'unity' | 'unreal'): GameProfile {
  const profile = createDefaultGameProfile(`profile-${presetId}`, presetId);
  profile.coordinateSpace = getBuiltInCoordinateSpace(presetId)!;
  return profile;
}

/**
 * Creates a custom left-handed profile whose axes define its handedness.
 * @returns Game profile using a custom left-handed coordinate space.
 */
function createCustomLeftHandedProfile(): GameProfile {
  const profile = createDefaultGameProfile('profile-custom-left', 'Custom Left');
  profile.coordinateSpace = {
    ...getBuiltInCoordinateSpace('godot')!,
    presetId: 'custom-left',
    name: 'Custom Left',
    handedness: 'left',
    forward: '+z',
    isCustom: true
  };
  return profile;
}

/**
 * Creates a named, indexed triangle with a computed normal.
 * @returns Source mesh used to verify GLB coordinate conversion.
 */
function createNamedTriangleMesh(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 1
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'HandednessTriangle';
  return mesh;
}

/**
 * Loads a GLB buffer and returns its named mesh with current world matrices.
 * @param buffer Binary GLB data.
 * @param meshName Name of the mesh to locate.
 * @returns Loaded mesh.
 */
function loadNamedMesh(buffer: ArrayBuffer, meshName: string): Promise<THREE.Mesh> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const mesh = findNamedMesh(gltf.scene, meshName);
      mesh ? resolve(mesh) : reject(new Error(`Missing mesh ${meshName}`));
    }, reject);
  });
}

/**
 * Finds a mesh by name within an object hierarchy.
 * @param root Root object to search.
 * @param meshName Expected mesh name.
 * @returns Matching mesh, or null when absent.
 */
function findNamedMesh(root: THREE.Object3D, meshName: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name === meshName) {
      found = object;
    }
  });
  return found;
}

/**
 * Reads the three local triangle positions and converts them to world space.
 * @param mesh Mesh containing the indexed triangle.
 * @returns World-space positions in index order.
 */
function readTrianglePositions(mesh: THREE.Mesh): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  return [0, 1, 2].map((offset) => new THREE.Vector3().fromBufferAttribute(
    position,
    index ? index.getX(offset) : offset
  ).applyMatrix4(mesh.matrixWorld));
}

/**
 * Reads and normalizes the first vertex normal from a mesh.
 * @param mesh Mesh containing a normal attribute.
 * @returns First local-space vertex normal.
 */
function readFirstNormal(mesh: THREE.Mesh): THREE.Vector3 {
  const normal = mesh.geometry.getAttribute('normal');
  return new THREE.Vector3().fromBufferAttribute(normal, 0).normalize();
}

/**
 * Applies a coordinate transform to source positions.
 * @param positions Source positions.
 * @param transform Coordinate transform.
 * @returns Transformed positions.
 */
function transformPositions(
  positions: THREE.Vector3[],
  transform: THREE.Matrix4
): THREE.Vector3[] {
  return positions.map((position) => position.clone().applyMatrix4(transform));
}

/**
 * Transforms a normal using the inverse-transpose of a coordinate transform.
 * @param normal Source normal.
 * @param transform Coordinate transform.
 * @returns Normalized transformed normal.
 */
function transformNormal(normal: THREE.Vector3, transform: THREE.Matrix4): THREE.Vector3 {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  return normal.clone().applyNormalMatrix(normalMatrix).normalize();
}

/**
 * Calculates a normalized geometric normal from a triangle's winding order.
 * @param positions Triangle positions in winding order.
 * @returns Normalized geometric normal.
 */
function getTriangleNormal(positions: THREE.Vector3[]): THREE.Vector3 {
  return positions[1].clone().sub(positions[0]).cross(
    positions[2].clone().sub(positions[0])
  ).normalize();
}

/**
 * Verifies matching vector arrays to floating-point precision.
 * @param actual Actual vectors.
 * @param expected Expected vectors.
 */
function expectVectorsToMatch(actual: THREE.Vector3[], expected: THREE.Vector3[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((vector, index) => {
    expect(vector.distanceTo(expected[index])).toBeCloseTo(0, 6);
  });
}
