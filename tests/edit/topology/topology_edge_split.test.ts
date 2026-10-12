import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { validateMeshTopology } from '@/mesh/topology/mesh_topology_validator.js';
import { splitTopologyWorkingEdge } from '@/edit/topology/topology_edge_split.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import {
  meshDocumentToWorkingGeometry,
  workingGeometryToMeshDocument,
} from '@/edit/topology/topology_working_from_mesh.js';
import { collectTopologyWorkingEdges } from '@/edit/topology/topology_working_edges_collect.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

describe('topology_edge_split', () => {
  it('inserts a midpoint on a box brush edge and keeps the solid valid', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const working = brushToWorkingGeometry(brush);
    const beforeVertices = working.positions.length;
    const beforeFaces = working.faces.length;
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const result = splitTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, 0.5);
    expect(result).not.toBeNull();
    expect(working.positions.length).toBe(beforeVertices + 1);
    expect(working.faces.length).toBe(beforeFaces);
    expect(countFacesOwningVertex(working.faces, result?.newVertexIndex ?? -1)).toBe(2);
    const rebuilt = workingGeometryToBrush(working);
    expect(rebuilt).not.toBeNull();
    if (!rebuilt) {
      return;
    }
    expect(SolidBrushValidator.validate(rebuilt).valid).toBe(true);
  });

  it('inserts a midpoint on a box mesh edge and keeps topology valid', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const working = meshDocumentToWorkingGeometry(document);
    const beforeVertices = working.positions.length;
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const result = splitTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, 0.5);
    expect(result).not.toBeNull();
    expect(working.positions.length).toBe(beforeVertices + 1);
    const rebuilt = workingGeometryToMeshDocument(working);
    expect(validateMeshTopology(rebuilt.getTopology()).isValid).toBe(true);
    expect(collectTopologyWorkingEdges(meshDocumentToWorkingGeometry(rebuilt)).length).toBeGreaterThan(
      collectTopologyWorkingEdges(working).length - 1,
    );
  });

  it('interpolates each incident face UV along that face edge', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const working = meshDocumentToWorkingGeometry(document);
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    const parameter = 0.25;
    const result = splitTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, parameter);
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    const incident = working.faces.filter((face) => face.vertexIndices.includes(result.newVertexIndex));
    expect(incident).toHaveLength(2);
    for (const face of incident) {
      expect(insertedUvMatchesFaceEdge(face, result.newVertexIndex, edge.vertexA, edge.vertexB, parameter)).toBe(true);
    }
  });

  it('refuses a split at an endpoint', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = findWorkingEdgeParallelToY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(splitTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, 0)).toBeNull();
    expect(splitTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, 1)).toBeNull();
  });
});

/**
 * Counts faces that contain a vertex.
 *
 * @param faces Working faces.
 * @param vertexIndex Vertex to count.
 * @returns Face count.
 */
/**
 * Returns whether an inserted corner UV is the lerp along the face edge.
 *
 * @param face Face that received the vertex.
 * @param newVertexIndex Inserted vertex.
 * @param vertexA Undirected edge start.
 * @param vertexB Undirected edge end.
 * @param parameter Interpolation t along A→B.
 * @returns True when the stored UV matches that face's edge direction.
 */
function insertedUvMatchesFaceEdge(
  face: { vertexIndices: number[]; cornerUvs: Array<{ u: number; v: number }> },
  newVertexIndex: number,
  vertexA: number,
  vertexB: number,
  parameter: number,
): boolean {
  const corner = face.vertexIndices.indexOf(newVertexIndex);
  const count = face.vertexIndices.length;
  const previous = face.vertexIndices[(corner + count - 1) % count];
  const next = face.vertexIndices[(corner + 1) % count];
  const previousUv = face.cornerUvs[(corner + count - 1) % count];
  const nextUv = face.cornerUvs[(corner + 1) % count];
  const inserted = face.cornerUvs[corner];
  if (previous === undefined || next === undefined || !previousUv || !nextUv || !inserted) {
    return false;
  }
  const faceParameter = previous === vertexA && next === vertexB ? parameter : 1 - parameter;
  const u = previousUv.u + (nextUv.u - previousUv.u) * faceParameter;
  const v = previousUv.v + (nextUv.v - previousUv.v) * faceParameter;
  return Math.abs(inserted.u - u) < 1e-5 && Math.abs(inserted.v - v) < 1e-5;
}

function countFacesOwningVertex(faces: Array<{ vertexIndices: number[] }>, vertexIndex: number): number {
  let count = 0;
  for (const face of faces) {
    if (face.vertexIndices.includes(vertexIndex)) {
      count += 1;
    }
  }
  return count;
}
