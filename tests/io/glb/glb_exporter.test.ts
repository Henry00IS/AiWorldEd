import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
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
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    const mesh2 = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    const mesh3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1, 2, 32),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
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
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mesh.rotation.x = -Math.PI / 2;
    worldGroup.add(mesh);
    const buffer = await exporter.export(worldGroup);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should export solid models without brush hulls as valid GLB', async () => {
    const model = new SolidModel('GlbSolid');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    worldGroup.add(model.root);
    const liveBrushCount = model.root.children.filter((child) => SolidBrushVisual.isBrushObject(child)).length;
    expect(liveBrushCount).toBeGreaterThanOrEqual(2);
    const filtered = buildExportScene(worldGroup);
    const exportMeshes: THREE.Mesh[] = [];
    filtered.traverse((obj) => {
      if (obj instanceof THREE.Mesh) exportMeshes.push(obj);
    });
    expect(exportMeshes.length).toBe(1);
    expect(SolidBrushVisual.isBrushObject(exportMeshes[0]!)).toBe(false);
    const buffer = await exporter.export(worldGroup);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new DataView(buffer);
    expect(view.getUint32(0, true)).toBe(GLB_MAGIC_NUMBER);
  });

  it('should export canonical glTF coordinates without a profile root transform', async () => {
    const sourceMesh = createNamedTriangleMesh();
    const sourcePositions = readTrianglePositions(sourceMesh);
    const sourceNormal = readFirstNormal(sourceMesh);
    worldGroup.add(sourceMesh);

    const buffer = await exporter.export(worldGroup);
    const exportedMesh = await loadNamedMesh(buffer, sourceMesh.name);
    const exportedPositions = readTrianglePositions(exportedMesh);

    expectVectorsToMatch(exportedPositions, sourcePositions);
    expect(readFirstNormal(exportedMesh)).toEqual(sourceNormal);
    expect(exportedMesh.matrixWorld.determinant()).toBeGreaterThan(0);
    expect(exportedMesh.parent?.matrixWorld.determinant()).toBeCloseTo(1, 6);
    expect(getTriangleNormal(exportedPositions).dot(readFirstNormal(exportedMesh))).toBeCloseTo(1, 6);
  });

  it('should preserve one meter geometry without centimeter scaling', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mesh.name = 'MeterBox';
    worldGroup.add(mesh);

    const buffer = await exporter.export(worldGroup);
    const exportedMesh = await loadNamedMesh(buffer, mesh.name);
    const bounds = new THREE.Box3().setFromObject(exportedMesh);
    const dimensions = bounds.getSize(new THREE.Vector3());

    expect(dimensions.x).toBeCloseTo(1, 5);
    expect(dimensions.y).toBeCloseTo(2, 5);
    expect(dimensions.z).toBeCloseTo(3, 5);
  });
});

/**
 * Creates a named, indexed triangle with a computed normal.
 *
 * @returns Source mesh used to verify GLB coordinate conversion.
 */
function createNamedTriangleMesh(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 1], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'HandednessTriangle';
  return mesh;
}

/**
 * Loads a GLB buffer and returns its named mesh with current world matrices.
 *
 * @param buffer Binary GLB data.
 * @param meshName Name of the mesh to locate.
 * @returns Loaded mesh.
 */
function loadNamedMesh(buffer: ArrayBuffer, meshName: string): Promise<THREE.Mesh> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const mesh = findNamedMesh(gltf.scene, meshName);
        mesh ? resolve(mesh) : reject(new Error(`Missing mesh ${meshName}`));
      },
      reject,
    );
  });
}

/**
 * Finds a mesh by name within an object hierarchy.
 *
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
 *
 * @param mesh Mesh containing the indexed triangle.
 * @returns World-space positions in index order.
 */
function readTrianglePositions(mesh: THREE.Mesh): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  return [0, 1, 2].map((offset) =>
    new THREE.Vector3()
      .fromBufferAttribute(position, index ? index.getX(offset) : offset)
      .applyMatrix4(mesh.matrixWorld),
  );
}

/**
 * Reads and normalizes the first vertex normal from a mesh.
 *
 * @param mesh Mesh containing a normal attribute.
 * @returns First local-space vertex normal.
 */
function readFirstNormal(mesh: THREE.Mesh): THREE.Vector3 {
  const normal = mesh.geometry.getAttribute('normal');
  return new THREE.Vector3().fromBufferAttribute(normal, 0).normalize();
}

/**
 * Calculates a normalized geometric normal from a triangle's winding order.
 *
 * @param positions Triangle positions in winding order.
 * @returns Normalized geometric normal.
 */
function getTriangleNormal(positions: THREE.Vector3[]): THREE.Vector3 {
  return positions[1]!.clone().sub(positions[0]!).cross(positions[2]!.clone().sub(positions[0]!)).normalize();
}

/**
 * Verifies matching vector arrays to floating-point precision.
 *
 * @param actual Actual vectors.
 * @param expected Expected vectors.
 */
function expectVectorsToMatch(actual: THREE.Vector3[], expected: THREE.Vector3[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((vector, index) => {
    expect(vector.distanceTo(expected[index]!)).toBeCloseTo(0, 6);
  });
}
