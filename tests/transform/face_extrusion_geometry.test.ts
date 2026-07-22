import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  computeFaceNormal,
  computeAverageNormals,
  getUniqueVertexIndicesForFaces,
  extrudeVertexPositions,
  splitSharedVertices,
  mergeCoincidentVertices
} from '../../src/transform/face_extrusion_geometry.js';

describe('computeFaceNormal', () => {
  let geometry: THREE.BufferGeometry;

  beforeEach(() => {
    geometry = createTriangleOnXYPlane();
  });

  it('should compute normal for a triangle on XY plane', () => {
    const normal = computeFaceNormal(geometry, 0);
    expect(normal.z).toBeCloseTo(1);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(0);
  });

  it('should return a normalized vector', () => {
    const normal = computeFaceNormal(geometry, 0);
    expect(normal.length()).toBeCloseTo(1);
  });

  it('should compute correct normal for XZ plane triangle', () => {
    const xzGeometry = createTriangleOnXZPlane();
    const normal = computeFaceNormal(xzGeometry, 0);
    expect(normal.y).toBeCloseTo(1);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.z).toBeCloseTo(0);
  });
});

describe('computeAverageNormals', () => {
  it('should average normals of parallel faces', () => {
    const geometry = createMultiFaceParallelGeometry(3);
    const faceIndices = [0, 1, 2];
    const normal = computeAverageNormals(geometry, faceIndices);
    expect(normal.length()).toBeCloseTo(1);
    expect(normal.z).toBeCloseTo(1);
  });

  it('should return zero-ish vector for empty face list', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = computeAverageNormals(geometry, []);
    expect(normal.x).toBeCloseTo(0, 3);
    expect(normal.y).toBeCloseTo(0, 3);
    expect(normal.z).toBeCloseTo(0, 3);
  });

  it('should return normalized average for single face', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = computeAverageNormals(geometry, [0]);
    expect(normal.length()).toBeCloseTo(1);
  });
});

describe('getUniqueVertexIndicesForFaces', () => {
  it('should return 3 vertices for a single face', () => {
    const geometry = createTriangleOnXYPlane();
    const indices = getUniqueVertexIndicesForFaces(geometry, [0]);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('should return 6 vertices for two non-overlapping faces', () => {
    const geometry = createMultiFaceParallelGeometry(2);
    const indices = getUniqueVertexIndicesForFaces(geometry, [0, 1]);
    expect(indices.length).toBe(6);
  });

  it('should deduplicate shared vertex indices', () => {
    const geometry = createSharedVertexGeometry();
    const indices = getUniqueVertexIndicesForFaces(geometry, [0, 1]);
    expect(indices.length).toBe(6);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('should return sorted vertex indices', () => {
    const geometry = createTriangleOnXYPlane();
    const indices = getUniqueVertexIndicesForFaces(geometry, [0]);
    expect(indices).toEqual(indices.slice().sort((a, b) => a - b));
  });

  it('should return empty array for empty face list', () => {
    const geometry = createTriangleOnXYPlane();
    const indices = getUniqueVertexIndicesForFaces(geometry, []);
    expect(indices).toEqual([]);
  });
});

describe('extrudeVertexPositions', () => {
  it('should displace vertices of selected faces', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0], 1.0, normal);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(1);
  });

  it('should not displace vertices of unselected faces', () => {
    const geometry = createMultiFaceParallelGeometry(2);
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0], 1.0, normal);
    expect(result[9]).toBeCloseTo(1);
    expect(result[10]).toBeCloseTo(0);
    expect(result[11]).toBeCloseTo(0);
  });

  it('should respect the displacement magnitude', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0], 5.0, normal);
    expect(result[2]).toBeCloseTo(5);
  });

  it('should work with negative displacement', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0], -2.0, normal);
    expect(result[2]).toBeCloseTo(-2);
  });

  it('should produce array of correct length', () => {
    const geometry = createMultiFaceParallelGeometry(3);
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0, 1], 1.0, normal);
    expect(result.length).toBe(geometry.getAttribute('position').count * 3);
  });

  it('should handle zero displacement', () => {
    const geometry = createTriangleOnXYPlane();
    const normal = new THREE.Vector3(0, 0, 1);
    const result = extrudeVertexPositions(geometry, [0], 0, normal);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(0);
  });
});

describe('splitSharedVertices', () => {
  it('should create geometry with extra vertices for shared vertices', () => {
    const geometry = createSharedVertexGeometry();
    const newGeometry = splitSharedVertices(geometry, [0]);
    const originalCount = geometry.getAttribute('position').count;
    const newCount = newGeometry.getAttribute('position').count;
    expect(newCount).toBeGreaterThanOrEqual(originalCount);
  });

  it('should return geometry with correct original vertex count for non-shared', () => {
    const geometry = createMultiFaceParallelGeometry(2);
    const newGeometry = splitSharedVertices(geometry, [0]);
    const originalCount = geometry.getAttribute('position').count;
    const newCount = newGeometry.getAttribute('position').count;
    expect(newCount).toBe(originalCount);
  });
});

describe('mergeCoincidentVertices', () => {
  it('should merge vertices within threshold', () => {
    const geometry = createCoincidentVertexGeometry();
    const newGeometry = mergeCoincidentVertices(geometry, 0.1);
    const originalPositions = geometry.getAttribute('position').array;
    const newPositions = newGeometry.getAttribute('position').array;
    const vertexA = 0;
    const vertexB = 3;
    const distBefore = Math.sqrt(
      (originalPositions[vertexA * 3] - originalPositions[vertexB * 3]) ** 2 +
      (originalPositions[vertexA * 3 + 1] - originalPositions[vertexB * 3 + 1]) ** 2 +
      (originalPositions[vertexA * 3 + 2] - originalPositions[vertexB * 3 + 2]) ** 2
    );
    const distAfter = Math.sqrt(
      (newPositions[vertexA * 3] - newPositions[vertexB * 3]) ** 2 +
      (newPositions[vertexA * 3 + 1] - newPositions[vertexB * 3 + 1]) ** 2 +
      (newPositions[vertexA * 3 + 2] - newPositions[vertexB * 3 + 2]) ** 2
    );
    expect(distAfter).toBeCloseTo(0);
    expect(distBefore).toBeGreaterThan(0);
  });

  it('should not merge vertices beyond threshold', () => {
    const geometry = createDistantVertexGeometry();
    const newGeometry = mergeCoincidentVertices(geometry, 0.01);
    const originalPositions = geometry.getAttribute('position').array;
    const newPositions = newGeometry.getAttribute('position').array;
    expect(newPositions[3]).toBeCloseTo(originalPositions[3]);
    expect(newPositions[4]).toBeCloseTo(originalPositions[4]);
    expect(newPositions[5]).toBeCloseTo(originalPositions[5]);
  });

  it('should return geometry with same vertex count', () => {
    const geometry = createTriangleOnXYPlane();
    const newGeometry = mergeCoincidentVertices(geometry, 0.1);
    expect(newGeometry.getAttribute('position').count).toBe(
      geometry.getAttribute('position').count
    );
  });
});

// ---------------------------------------------------------------------------
// Test geometry factories
// ---------------------------------------------------------------------------

/**
 * Creates a single triangle on the XY plane.
 * @returns A buffer geometry with 3 vertices.
 */
function createTriangleOnXYPlane(): THREE.BufferGeometry {
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
 * Creates a single triangle on the XZ plane.
 * @returns A buffer geometry with 3 vertices.
 */
function createTriangleOnXZPlane(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    0.5, 0, 1,
    1, 0, 0
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Creates multiple parallel triangles on the XY plane.
 * @param count The number of faces to create.
 * @returns A buffer geometry with count faces.
 */
function createMultiFaceParallelGeometry(count: number): THREE.BufferGeometry {
  const vertexCount = count * 3;
  const vertices = new Float32Array(vertexCount * 3);
  for (let i = 0; i < count; i++) {
    const base = i * 9;
    vertices[base] = i;
    vertices[base + 1] = 0;
    vertices[base + 2] = 0;
    vertices[base + 3] = i + 1;
    vertices[base + 4] = 0;
    vertices[base + 5] = 0;
    vertices[base + 6] = i + 0.5;
    vertices[base + 7] = 1;
    vertices[base + 8] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Creates two triangles sharing one vertex (vertex index 2 and 3 are same position).
 * @returns A buffer geometry with 6 vertices where vertices 2 and 3 coincide.
 */
function createSharedVertexGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0.5, 1, 0,
    0.5, 1, 0,
    1, 0, 0,
    1.5, 1, 0
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Creates geometry with two nearly coincident vertices.
 * @returns A buffer geometry with 6 vertices where 2 pairs are close together.
 */
function createCoincidentVertexGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0.5, 0, 0,
    0.001, 0, 0,
    2, 0, 0,
    1.5, 0, 0
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

/**
 * Creates geometry with well-separated vertices.
 * @returns A buffer geometry with 6 vertices far apart.
 */
function createDistantVertexGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    10, 0, 0,
    5, 10, 0,
    20, 0, 0,
    30, 0, 0,
    25, 10, 0
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}
