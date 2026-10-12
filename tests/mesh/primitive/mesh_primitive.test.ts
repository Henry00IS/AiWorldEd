import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { detectPackedCoincidentPositions } from '@/edit/topology/topology_coincident.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { createMeshDocumentPlane } from '@/mesh/primitive/mesh_primitive_plane.js';
import { createMeshDocumentSphere } from '@/mesh/primitive/mesh_primitive_sphere.js';
import { createMeshDocumentCylinder } from '@/mesh/primitive/mesh_primitive_cylinder.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyCountBoundaryHalfEdges,
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';

describe('mesh primitives', () => {
  it('creates a closed box with six quad faces and no boundary', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const topology = document.getTopology();
    expect(topology.getVertexCount()).toBe(8);
    expect(topology.getFaceCount()).toBe(6);
    expect(topology.getHalfEdgeCount()).toBe(24);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
    const cornerUvs = document.getAttributes().getCornerUvs().getValues();
    expect(cornerUvs.length).toBe(24 * 2);
    const hasCenteredOffset = Array.from(cornerUvs).some((value) => Math.abs(value) > 0.1);
    expect(hasCenteredOffset).toBe(true);
  });

  it('creates a box with outward-facing normals after buffer conversion', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const geometry = meshDocumentToBufferGeometry(document);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    expect(positions).toBeTruthy();
    expect(normals).toBeTruthy();
    if (!positions || !normals) {
      return;
    }
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
      const px = positions.getX(vertexIndex);
      const py = positions.getY(vertexIndex);
      const pz = positions.getZ(vertexIndex);
      const nx = normals.getX(vertexIndex);
      const ny = normals.getY(vertexIndex);
      const nz = normals.getZ(vertexIndex);
      const outwardDot = px * nx + py * ny + pz * nz;
      expect(outwardDot).toBeGreaterThan(0);
    }
  });

  it('creates an open plane with quad faces and boundary edges', () => {
    const document = createMeshDocumentPlane(2, 2, 2, 2);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBe(4);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBeGreaterThan(0);
    expect(validateMeshTopology(topology).isValid).toBe(true);
  });

  it('creates a sphere with corner UVs and no planar surface table thrash', () => {
    const document = createMeshDocumentSphere(0.5, 16, 12);
    const topology = document.getTopology();
    expect(topology.getFaceCount()).toBeGreaterThan(100);
    expect(validateMeshTopology(topology).isValid).toBe(true);
    const surfaces = document.getAttributes().getFaceSurfaces();
    for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
      expect(surfaces.get(faceIndex)).toBeUndefined();
    }
    const cornerUvs = document.getAttributes().getCornerUvs().getValues();
    expect(cornerUvs.length).toBe(topology.getHalfEdgeCount() * 2);
    expect(cornerUvs.some((value) => value !== 0)).toBe(true);
  });

  it('creates a sphere without a duplicated longitude seam', () => {
    const segmentsX = 16;
    const segmentsY = 12;
    const document = createMeshDocumentSphere(0.5, segmentsX, segmentsY);
    const topology = document.getTopology();
    expect(validateMeshTopology(topology).isValid).toBe(true);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(0);
    expect(topology.getVertexCount()).toBe(2 + (segmentsY - 1) * segmentsX);
    expect(detectPackedCoincidentPositions(topology.getPositions())).toEqual([]);
    expect(sphereFacesOutward(document)).toBe(true);
    expect(sphereUvReachesSeam(document)).toBe(true);
  });

  it('creates a cylinder that converts to buffer geometry', () => {
    const document = createMeshDocumentCylinder(0.5, 0.5, 1, 12, 1, false);
    expect(validateMeshTopology(document.getTopology()).isValid).toBe(true);
    const geometry = meshDocumentToBufferGeometry(document);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    expect(position.count).toBeGreaterThan(0);
    expect(uv.count).toBe(position.count);
  });

  it('creates a closed cylinder with outward sides and unique vertices', () => {
    const segments = 12;
    const document = createMeshDocumentCylinder(0.5, 0.5, 1, segments, 1, false);
    const topology = document.getTopology();
    expect(validateMeshTopology(topology).isValid).toBe(true);
    expect(topology.getVertexCount()).toBe(segments * 2);
    expect(meshTopologyCountBoundaryHalfEdges(topology)).toBe(0);
    expect(detectPackedCoincidentPositions(topology.getPositions())).toEqual([]);
    expect(cylinderSidesFaceOutward(document)).toBe(true);
    expect(cylinderCapsFaceOutward(document)).toBe(true);
  });
});

/**
 * Returns whether every side quad faces away from the cylinder axis.
 *
 * @param document Cylinder document.
 * @returns True when each side normal points outward.
 */
/**
 * Returns whether every sphere face points away from the origin.
 *
 * @param document Sphere document.
 * @returns True when each face normal agrees with its centroid.
 */
function sphereFacesOutward(document: MeshDocument): boolean {
  const topology = document.getTopology();
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    const corners = readFaceCorners(document, faceIndex);
    if (polygonNormal(corners).dot(cornerAverage(corners)) <= 0) {
      return false;
    }
  }
  return topology.getFaceCount() > 0;
}

/**
 * Returns whether corner UVs still include both sides of the longitude seam.
 *
 * @param document Sphere document.
 * @returns True when some corner is at U 0 and some corner is at U 1.
 */
function sphereUvReachesSeam(document: MeshDocument): boolean {
  const uvs = document.getAttributes().getCornerUvs().getValues();
  let sawZero = false;
  let sawOne = false;
  for (let index = 0; index < uvs.length; index += 2) {
    const u = uvs[index] ?? 0;
    sawZero = sawZero || Math.abs(u) < 1e-6;
    sawOne = sawOne || Math.abs(u - 1) < 1e-6;
  }
  return sawZero && sawOne;
}

function cylinderSidesFaceOutward(document: MeshDocument): boolean {
  const topology = document.getTopology();
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    const corners = readFaceCorners(document, faceIndex);
    if (corners.length !== 4) {
      continue;
    }
    if (!sideFacesOutward(corners)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether a side quad's normal points away from the Y axis.
 *
 * @param corners Face corners.
 * @returns True when the radial dot is positive.
 */
function sideFacesOutward(corners: readonly THREE.Vector3[]): boolean {
  const normal = polygonNormal(corners);
  const radial = cornerAverage(corners);
  radial.y = 0;
  return normal.dot(radial) > 0.1;
}

/**
 * Returns whether the top cap faces +Y and the bottom cap faces -Y.
 *
 * @param document Cylinder document.
 * @returns True when both caps face outward.
 */
function cylinderCapsFaceOutward(document: MeshDocument): boolean {
  const topology = document.getTopology();
  let sawTop = false;
  let sawBottom = false;
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    const corners = readFaceCorners(document, faceIndex);
    if (corners.length <= 4) {
      continue;
    }
    const normal = polygonNormal(corners);
    const height = cornerAverage(corners).y;
    if (height > 0 && normal.y > 0.5) {
      sawTop = true;
    }
    if (height < 0 && normal.y < -0.5) {
      sawBottom = true;
    }
  }
  return sawTop && sawBottom;
}

/**
 * Reads one face loop as positions.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Corner positions in loop order.
 */
function readFaceCorners(document: MeshDocument, faceIndex: number): THREE.Vector3[] {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 };
  const corners: THREE.Vector3[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    meshVertexPositionRead(positions, vertexIndex, scratch);
    corners.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]));
  }
  return corners;
}

/**
 * Returns a Newell normal for a face loop.
 *
 * @param corners Ordered corners.
 * @returns Unnormalized normal.
 */
function polygonNormal(corners: readonly THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  for (let index = 0; index < corners.length; index++) {
    const current = corners[index]!;
    const next = corners[(index + 1) % corners.length]!;
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal;
}

/**
 * Returns the average of a corner list.
 *
 * @param corners Face corners.
 * @returns Average position.
 */
function cornerAverage(corners: readonly THREE.Vector3[]): THREE.Vector3 {
  const average = new THREE.Vector3();
  for (const corner of corners) {
    average.add(corner);
  }
  return average.multiplyScalar(1 / corners.length);
}
