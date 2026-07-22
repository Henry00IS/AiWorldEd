import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { FaceSelectionHighlight } from '../../src/selection/face_selection_highlight.js';
import { FaceSelection } from '../../src/selection/face_selection_manager.js';
import { GizmoVisualStyle } from '../../src/transform/gizmo_visual_style.js';

describe('FaceSelectionHighlight', () => {
  let scene: THREE.Scene;
  let highlight: FaceSelectionHighlight;
  let testMesh: THREE.Mesh;
  let testGeometry: THREE.BufferGeometry;

  beforeEach(() => {
    scene = new THREE.Scene();
    highlight = new FaceSelectionHighlight(scene);
    testGeometry = createTestTriangleGeometry();
    testMesh = new THREE.Mesh(testGeometry, new THREE.MeshBasicMaterial());
    testMesh.position.set(0, 0, 0);
  });

  it('should create without errors', () => {
    expect(highlight).toBeDefined();
  });

  it('should add highlight group to scene', () => {
    const hasGroup = scene.children.some(
      (child) => child instanceof THREE.Group
    );
    expect(hasGroup).toBe(true);
  });

  it('should highlight a selected face', () => {
    scene.add(testMesh);
    const faces: FaceSelection[] = [{ mesh: testMesh, faceIndex: 0 }];
    highlight.setSelectedFaces(faces);
    expect(highlight.getHighlightCount()).toBe(1);
  });

  it('should use orange highlight color on both depth passes', () => {
    scene.add(testMesh);
    const faces: FaceSelection[] = [{ mesh: testMesh, faceIndex: 0 }];
    highlight.setSelectedFaces(faces);
    const materials = getHighlightMaterials(highlight);
    expect(materials.length).toBe(2);
    materials.forEach((material) => {
      expect(material.color.getHex()).toBe(Theme.selectionColor);
    });
  });

  it('should use front and occluded depth materials like gizmos', () => {
    scene.add(testMesh);
    highlight.setSelectedFaces([{ mesh: testMesh, faceIndex: 0 }]);
    const materials = getHighlightMaterials(highlight);
    const front = materials.find(
      (material) => material.depthFunc === THREE.LessEqualDepth
    );
    const occluded = materials.find(
      (material) => material.depthFunc === THREE.GreaterDepth
    );
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
    expect(front!.depthTest).toBe(true);
    expect(occluded!.depthTest).toBe(true);
    expect(front!.depthWrite).toBe(false);
    expect(occluded!.depthWrite).toBe(false);
    expect(front!.transparent).toBe(true);
    expect(occluded!.transparent).toBe(true);
    expect(front!.opacity).toBeGreaterThan(occluded!.opacity);
  });

  it('should apply gizmo-style render orders to depth passes', () => {
    scene.add(testMesh);
    highlight.setSelectedFaces([{ mesh: testMesh, faceIndex: 0 }]);
    const meshes = getHighlightMeshes(highlight);
    const front = meshes.find(
      (mesh) => mesh.renderOrder === GizmoVisualStyle.frontRenderOrder
    );
    const occluded = meshes.find(
      (mesh) => mesh.renderOrder === GizmoVisualStyle.occludedRenderOrder
    );
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
  });

  it('should use polygon offset to avoid z-fighting the owning mesh', () => {
    scene.add(testMesh);
    highlight.setSelectedFaces([{ mesh: testMesh, faceIndex: 0 }]);
    const materials = getHighlightMaterials(highlight);
    materials.forEach((material) => {
      expect(material.polygonOffset).toBe(true);
      expect(material.polygonOffsetFactor).toBeLessThan(0);
    });
  });

  it('should highlight multiple faces', () => {
    const geometry = createMultiFaceGeometry(4);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const faces: FaceSelection[] = [
      { mesh, faceIndex: 0 },
      { mesh, faceIndex: 1 },
      { mesh, faceIndex: 2 }
    ];
    highlight.setSelectedFaces(faces);
    expect(highlight.getHighlightCount()).toBe(3);
  });

  it('should remove stale highlights when selection changes', () => {
    const geometry = createMultiFaceGeometry(4);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    scene.add(mesh);
    highlight.setSelectedFaces([{ mesh, faceIndex: 0 }, { mesh, faceIndex: 1 }]);
    expect(highlight.getHighlightCount()).toBe(2);
    highlight.setSelectedFaces([{ mesh, faceIndex: 2 }]);
    expect(highlight.getHighlightCount()).toBe(1);
  });

  it('should clear all highlights when given empty array', () => {
    scene.add(testMesh);
    highlight.setSelectedFaces([{ mesh: testMesh, faceIndex: 0 }]);
    expect(highlight.getHighlightCount()).toBe(1);
    highlight.setSelectedFaces([]);
    expect(highlight.getHighlightCount()).toBe(0);
  });

  it('should handle empty selection initially', () => {
    highlight.setSelectedFaces([]);
    expect(highlight.getHighlightCount()).toBe(0);
  });

  it('should dispose and clean up highlights', () => {
    scene.add(testMesh);
    highlight.setSelectedFaces([{ mesh: testMesh, faceIndex: 0 }]);
    expect(highlight.getHighlightCount()).toBe(1);
    highlight.dispose();
    expect(highlight.getHighlightCount()).toBe(0);
  });

  it('should dispose without error when no highlights exist', () => {
    expect(() => highlight.dispose()).not.toThrow();
  });
});

/**
 * Creates a simple triangle geometry with 1 face.
 * @returns A buffer geometry with 3 vertices.
 */
function createTestTriangleGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Creates a geometry with multiple faces.
 * @param faceCount The number of triangular faces.
 * @returns A buffer geometry with the requested number of faces.
 */
function createMultiFaceGeometry(faceCount: number): THREE.BufferGeometry {
  const vertexCount = faceCount * 3;
  const vertices = new Float32Array(vertexCount * 3);
  for (let i = 0; i < faceCount; i++) {
    const base = i * 3;
    vertices[base * 3] = i;
    vertices[base * 3 + 1] = 0;
    vertices[base * 3 + 2] = 0;
    vertices[(base + 1) * 3] = i + 1;
    vertices[(base + 1) * 3 + 1] = 0;
    vertices[(base + 1) * 3 + 2] = 0;
    vertices[(base + 2) * 3] = i + 0.5;
    vertices[(base + 2) * 3 + 1] = 1;
    vertices[(base + 2) * 3 + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Extracts all highlight pass meshes from a highlight instance.
 * @param highlight The highlight instance to inspect.
 * @returns An array of front and occluded mesh objects.
 */
function getHighlightMeshes(highlight: FaceSelectionHighlight): THREE.Mesh[] {
  const faceGroups = (highlight as unknown as {
    faceGroups: Map<string, THREE.Group>;
  }).faceGroups;
  const meshes: THREE.Mesh[] = [];
  faceGroups.forEach((group) => {
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
  });
  return meshes;
}

/**
 * Collects unique materials used by active face highlight meshes.
 * @param highlight The highlight instance to inspect.
 * @returns Distinct basic materials from the highlight passes.
 */
function getHighlightMaterials(
  highlight: FaceSelectionHighlight
): THREE.MeshBasicMaterial[] {
  const materials = new Set<THREE.MeshBasicMaterial>();
  getHighlightMeshes(highlight).forEach((mesh) => {
    if (mesh.material instanceof THREE.MeshBasicMaterial) {
      materials.add(mesh.material);
    }
  });
  return Array.from(materials);
}
