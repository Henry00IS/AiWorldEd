import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { createMeshDocumentPlane } from '@/mesh/primitive/mesh_primitive_plane.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { applyTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import { dissolveTopologyWorkingVertex } from '@/edit/topology/topology_vertex_dissolve.js';
import { dissolveTopologyWorkingVertices } from '@/edit/topology/topology_vertex_dissolve_batch.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import {
  meshDocumentToWorkingGeometry,
  workingGeometryToMeshDocument,
} from '@/edit/topology/topology_working_from_mesh.js';
import type { TopologyWorkingFace } from '@/edit/topology/topology_working_face.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  findWorkingEdgeParallelToX,
  findWorkingEdgeParallelToY,
  findWorkingVertexWithMaxCoordinateSum,
} from './topology_test_edges.js';

describe('topology_vertex_dissolve', () => {
  it('dissolves one cube corner and keeps a valid convex brush', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const working = brushToWorkingGeometry(brush);
    const corner = findWorkingVertexWithMaxCoordinateSum(working);
    expect(corner).toBeGreaterThanOrEqual(0);
    const result = dissolveTopologyWorkingVertex(working, corner, true);
    expect(result.applied).toBe(true);
    expect(working.positions.length).toBe(7);
    const rebuilt = workingGeometryToBrush(working);
    expect(rebuilt).not.toBeNull();
    if (!rebuilt) {
      return;
    }
    expect(SolidBrushValidator.validate(rebuilt).valid).toBe(true);
    expect(rebuilt.vertices.length).toBe(7);
  });

  it('joins the faces around a dissolved cube corner into one boundary', () => {
    const cornerCount = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2)).positions.length;
    for (let vertexIndex = 0; vertexIndex < cornerCount; vertexIndex++) {
      expect(dissolvedCornerCapIsOutward(vertexIndex)).toBe(true);
    }
  });

  it('refuses dissolving a tetrahedron below four vertices', () => {
    const cube = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const first = findWorkingVertexWithMaxCoordinateSum(cube);
    expect(dissolveTopologyWorkingVertex(cube, first, true).applied).toBe(true);
    const second = findWorkingVertexWithMaxCoordinateSum(cube);
    expect(dissolveTopologyWorkingVertex(cube, second, true).applied).toBe(true);
    const third = findWorkingVertexWithMaxCoordinateSum(cube);
    expect(dissolveTopologyWorkingVertex(cube, third, true).applied).toBe(true);
    const fourth = findWorkingVertexWithMaxCoordinateSum(cube);
    expect(dissolveTopologyWorkingVertex(cube, fourth, true).applied).toBe(true);
    const fifth = findWorkingVertexWithMaxCoordinateSum(cube);
    const refused = dissolveTopologyWorkingVertex(cube, fifth, true);
    expect(refused.applied).toBe(false);
  });

  it('dissolves a center loop cut on a cube brush back into the original cube', () => {
    expect(centerLoopDissolveRestoresBrush('y')).toBe(true);
    expect(centerLoopDissolveRestoresBrush('x')).toBe(true);
  });

  it('refits planar UVs when both vertices of one edge are dissolved', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(dissolveTopologyWorkingVertices(working, [edge.vertexA, edge.vertexB], false).applied).toBe(true);
    const quad = working.faces.find((face) => faceIsDiagonalQuad(working, face));
    expect(quad).toBeDefined();
    if (!quad) {
      return;
    }
    expect(quadFanAreasArePositive(quad)).toBe(true);
    expect(quadUvIsCentered(quad)).toBe(true);
  });

  it('dissolves a center loop cut on a cube mesh back into the original quads', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const before = facePositionKeys(working);
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const cut = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
    expect(cut.insertedVertexIndices).toHaveLength(4);
    expect(dissolveTopologyWorkingVertices(working, cut.insertedVertexIndices, false).applied).toBe(true);
    expect(facePositionKeys(working)).toEqual(before);
    const rebuilt = workingGeometryToMeshDocument(working);
    expect(validateMeshTopology(rebuilt.getTopology()).isValid).toBe(true);
    expect(rebuilt.getTopology().getFaceCount()).toBe(6);
  });

  it('dissolves an interior plane vertex without leaving a hole', () => {
    const document = createMeshDocumentPlane(2, 2, 2, 2);
    const working = meshDocumentToWorkingGeometry(document);
    const interior = findInteriorVertex(working);
    expect(interior).toBeGreaterThanOrEqual(0);
    const result = dissolveTopologyWorkingVertex(working, interior, false);
    expect(result.applied).toBe(true);
    expect(working.positions.length).toBe(8);
    const rebuilt = workingGeometryToMeshDocument(working);
    expect(validateMeshTopology(rebuilt.getTopology()).isValid).toBe(true);
    expect(rebuilt.getTopology().getVertexCount()).toBe(8);
  });
});

/**
 * Finds a vertex used by four faces on a regular plane grid.
 *
 * @param geometry Working geometry.
 * @returns Vertex index, or -1.
 */
/**
 * Loop-cuts a cube brush through the center and dissolves the new vertices.
 *
 * @param axis Edge direction that the cut crosses.
 * @returns True when the original faces come back and the brush is valid.
 */
function centerLoopDissolveRestoresBrush(axis: 'x' | 'y'): boolean {
  const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
  const before = facePositionKeys(working);
  const edge = axis === 'y' ? findWorkingEdgeParallelToY(working) : findWorkingEdgeParallelToX(working);
  if (!edge) {
    return false;
  }
  const cut = applyTopologyLoopCut(working, edge.vertexA, edge.vertexB, 0.5);
  if (cut.insertedVertexIndices.length !== 4) {
    return false;
  }
  if (!dissolveTopologyWorkingVertices(working, cut.insertedVertexIndices, true).applied) {
    return false;
  }
  if (facePositionKeys(working) !== before) {
    return false;
  }
  const rebuilt = workingGeometryToBrush(working);
  if (!rebuilt) {
    return false;
  }
  return SolidBrushValidator.validate(rebuilt).valid && rebuilt.faces.length === 6 && rebuilt.vertices.length === 8;
}

/**
 * Builds a stable signature of every face as sorted corner positions.
 *
 * @param geometry Working geometry.
 * @returns Newline-joined face keys.
 */
function facePositionKeys(geometry: TopologyWorkingGeometry): string {
  const faces = geometry.faces.map((face) => facePositionKey(geometry, face));
  faces.sort();
  return faces.join('\n');
}

/**
 * Builds a stable signature of one face.
 *
 * @param geometry Working geometry.
 * @param face Face to describe.
 * @returns Sorted corner positions.
 */
function facePositionKey(geometry: TopologyWorkingGeometry, face: { vertexIndices: readonly number[] }): string {
  const corners = face.vertexIndices.map((vertexIndex) => positionKey(geometry, vertexIndex));
  corners.sort();
  return corners.join('|');
}

/**
 * Formats one vertex position for a face signature.
 *
 * @param geometry Working geometry.
 * @param vertexIndex Vertex index.
 * @returns Rounded position text.
 */
function positionKey(geometry: TopologyWorkingGeometry, vertexIndex: number): string {
  const position = geometry.positions[vertexIndex];
  if (!position) {
    return 'missing';
  }
  return `${position.x.toFixed(4)},${position.y.toFixed(4)},${position.z.toFixed(4)}`;
}

/**
 * Dissolves one cube corner and checks the new triangle.
 *
 * @param vertexIndex Corner index on a fresh cube.
 * @returns True when the cap faces the removed corner and has planar UVs.
 */
function faceIsDiagonalQuad(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): boolean {
  if (face.vertexIndices.length !== 4) {
    return false;
  }
  const points = face.vertexIndices.map((index) => geometry.positions[index]);
  const first = points[0];
  if (!first) {
    return false;
  }
  const sameX = points.every((point) => point && Math.abs(point.x - first.x) < 1e-4);
  const sameY = points.every((point) => point && Math.abs(point.y - first.y) < 1e-4);
  const sameZ = points.every((point) => point && Math.abs(point.z - first.z) < 1e-4);
  return !sameX && !sameY && !sameZ;
}

function quadFanAreasArePositive(face: TopologyWorkingFace): boolean {
  const uvs = face.cornerUvs;
  const area = (start: number, mid: number, end: number) => {
    const a = uvs[start];
    const b = uvs[mid];
    const c = uvs[end];
    if (!a || !b || !c) {
      return 0;
    }
    return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
  };
  return area(0, 1, 2) > 0.2 && area(0, 2, 3) > 0.2;
}

function quadUvIsCentered(face: TopologyWorkingFace): boolean {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const uv of face.cornerUvs) {
    minU = Math.min(minU, uv.u);
    maxU = Math.max(maxU, uv.u);
    minV = Math.min(minV, uv.v);
    maxV = Math.max(maxV, uv.v);
  }
  return Math.abs((minU + maxU) * 0.5 - 0.5) < 0.05 && Math.abs((minV + maxV) * 0.5 - 0.5) < 0.05;
}

function positionStillPresent(
  geometry: TopologyWorkingGeometry,
  position: { x: number; y: number; z: number },
): boolean {
  for (const vertex of geometry.positions) {
    const dx = vertex.x - position.x;
    const dy = vertex.y - position.y;
    const dz = vertex.z - position.z;
    if (dx * dx + dy * dy + dz * dz < 1e-8) {
      return true;
    }
  }
  return false;
}

function faceFanUvArea(face: TopologyWorkingFace): number {
  const first = face.cornerUvs[0];
  const second = face.cornerUvs[1];
  const third = face.cornerUvs[2];
  if (!first || !second || !third) {
    return 0;
  }
  return (second.u - first.u) * (third.v - first.v) - (second.v - first.v) * (third.u - first.u);
}

function dissolvedCornerCapIsOutward(vertexIndex: number): boolean {
  const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
  const removed = working.positions[vertexIndex]?.clone();
  if (!removed || !dissolveTopologyWorkingVertex(working, vertexIndex, false).applied) {
    return false;
  }
  if (working.faces.length !== 4 || positionStillPresent(working, removed)) {
    return false;
  }
  const boundary = working.faces.find((face) => face.vertexIndices.length === 6);
  return boundary !== undefined && Math.abs(faceFanUvArea(boundary)) > 0.5;
}

function findInteriorVertex(geometry: { faces: Array<{ vertexIndices: number[] }>; positions: unknown[] }): number {
  const uses = new Map<number, number>();
  for (const face of geometry.faces) {
    for (const vertexIndex of face.vertexIndices) {
      uses.set(vertexIndex, (uses.get(vertexIndex) ?? 0) + 1);
    }
  }
  for (const [vertexIndex, count] of uses) {
    if (count >= 4) {
      return vertexIndex;
    }
  }
  return -1;
}
