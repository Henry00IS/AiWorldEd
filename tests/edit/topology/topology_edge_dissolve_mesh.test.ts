import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';
import { brushToWorkingGeometry, workingGeometryToBrush } from '@/edit/topology/topology_working_from_brush.js';
import { transferSurfacesByPlaneMatch } from '@/solid/brush/solid_brush_surface_transfer.js';
import { createDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { applyTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import { dissolveTopologyWorkingEdge } from '@/edit/topology/topology_edge_dissolve.js';
import {
  meshDocumentToWorkingGeometry,
  workingGeometryToMeshDocument,
} from '@/edit/topology/topology_working_from_mesh.js';
import { collectTopologyWorkingEdges } from '@/edit/topology/topology_working_edges_collect.js';
import type { TopologyWorkingFace } from '@/edit/topology/topology_working_face.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { findWorkingEdgeParallelToY } from './topology_test_edges.js';

describe('topology edge dissolve mesh display', () => {
  it('dissolves the positive-X top edge into a planar wedge without duplicate vertices', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const edge = findEdgeAtMaximumXAndY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(dissolvedEdgeBecomesPlanarWedge(working, edge.vertexA, edge.vertexB)).toBe(true);
  });

  it('dissolves every cube edge into a planar wedge without duplicate vertices', () => {
    const document = createMeshDocumentBox(2, 2, 2);
    const edges = collectTopologyWorkingEdges(meshDocumentToWorkingGeometry(document));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      const working = meshDocumentToWorkingGeometry(document);
      expect(dissolvedEdgeBecomesPlanarWedge(working, edge.vertexA, edge.vertexB)).toBe(true);
    }
  });

  it('dissolves a brush cube edge into a planar quad face', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const working = brushToWorkingGeometry(brush);
    const edge = findEdgeAtMaximumXAndY(working);
    expect(edge).not.toBeNull();
    if (!edge) {
      return;
    }
    expect(dissolveTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, true).applied).toBe(true);
    const solid = workingGeometryToBrush(working);
    expect(solid).not.toBeNull();
    if (!solid) {
      return;
    }
    expect(solid.faces).toHaveLength(5);
    expect(brushHasPlanarQuadWithoutDuplicateCorners(solid)).toBe(true);
    expect(dissolvedBrushQuadUsesBrushUv(brush, solid)).toBe(true);
  });

  it('keeps outward triangles when one cube edge is dissolved', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const edge = collectTopologyWorkingEdges(working)[0];
    expect(edge).toBeDefined();
    if (!edge) {
      return;
    }
    expect(dissolveTopologyWorkingEdge(working, edge.vertexA, edge.vertexB, false).applied).toBe(true);
    const rebuilt = workingGeometryToMeshDocument(working);
    const geometry = meshDocumentToBufferGeometry(rebuilt);
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    if (!index) {
      return;
    }
    expect(index.count / 3).toBe(expectedDisplayTriangleCount(rebuilt));
    expect(displayTrianglesFollowFaceNormals(rebuilt, geometry)).toBe(true);
    geometry.dispose();
  });

  it('triangulates the bent face after a loop cut and a bottom edge dissolve', () => {
    const working = meshDocumentToWorkingGeometry(createMeshDocumentBox(2, 2, 2));
    const vertical = findWorkingEdgeParallelToY(working);
    expect(vertical).not.toBeNull();
    if (!vertical) {
      return;
    }
    expect(applyTopologyLoopCut(working, vertical.vertexA, vertical.vertexB, 0.35).applied).toBe(true);
    const bottom = findLowestHorizontalEdge(working);
    expect(bottom).not.toBeNull();
    if (!bottom) {
      return;
    }
    expect(dissolveTopologyWorkingEdge(working, bottom.vertexA, bottom.vertexB, false).applied).toBe(true);
    const rebuilt = workingGeometryToMeshDocument(working);
    const geometry = meshDocumentToBufferGeometry(rebuilt);
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    if (!index) {
      return;
    }
    expect(index.count / 3).toBe(expectedDisplayTriangleCount(rebuilt));
    expect(displayTrianglesFollowFaceNormals(rebuilt, geometry)).toBe(true);
    geometry.dispose();
  });
});

/**
 * Finds a horizontal edge on the lowest Y of the working mesh.
 *
 * @param geometry Working geometry.
 * @returns Edge endpoints, or null.
 */
function findLowestHorizontalEdge(geometry: TopologyWorkingGeometry): { vertexA: number; vertexB: number } | null {
  let minY = Number.POSITIVE_INFINITY;
  for (const position of geometry.positions) {
    minY = Math.min(minY, position.y);
  }
  for (const edge of collectTopologyWorkingEdges(geometry)) {
    const start = geometry.positions[edge.vertexA];
    const end = geometry.positions[edge.vertexB];
    if (!start || !end) {
      continue;
    }
    if (Math.abs(start.y - minY) < 1e-6 && Math.abs(end.y - minY) < 1e-6) {
      return { vertexA: edge.vertexA, vertexB: edge.vertexB };
    }
  }
  return null;
}

/**
 * Sums the ear-clip triangle count of every document face.
 *
 * @param document Mesh document.
 * @returns Expected display triangle count.
 */
function expectedDisplayTriangleCount(document: MeshDocument): number {
  const topology = document.getTopology();
  let count = 0;
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    count += triangulateSimplePolygon3d(faceCornerPositions(document, faceIndex)).length / 3;
  }
  return count;
}

/**
 * Returns whether every display triangle faces the same way as its face loop.
 *
 * @param document Mesh document.
 * @param geometry Display geometry in document expansion order.
 * @returns True when no triangle is inverted.
 */
function displayTrianglesFollowFaceNormals(document: MeshDocument, geometry: import('three').BufferGeometry): boolean {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) {
    return false;
  }
  let displayTriangle = 0;
  const topology = document.getTopology();
  for (let faceIndex = 0; faceIndex < topology.getFaceCount(); faceIndex++) {
    const corners = faceCornerPositions(document, faceIndex);
    const normal = newellNormal(corners);
    const triangleCount = triangulateSimplePolygon3d(corners).length / 3;
    if (corners.length >= 3 && triangleCount === 0) {
      return false;
    }
    for (let offset = 0; offset < triangleCount; offset++) {
      if (!triangleAgreesWithNormal(position, index, displayTriangle, normal)) {
        return false;
      }
      displayTriangle += 1;
    }
  }
  return true;
}

/**
 * Reads expanded corner positions for one document face.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Corner positions in loop order.
 */
function faceCornerPositions(document: MeshDocument, faceIndex: number): Array<{ x: number; y: number; z: number }> {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const corners: Array<{ x: number; y: number; z: number }> = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const base = vertexIndex * 3;
    corners.push({
      x: positions[base] ?? 0,
      y: positions[base + 1] ?? 0,
      z: positions[base + 2] ?? 0,
    });
  }
  return corners;
}

/**
 * Computes a Newell normal for a corner loop.
 *
 * @param points Ordered corners.
 * @returns Normal, not necessarily unit length.
 */
function newellNormal(points: ReadonlyArray<{ x: number; y: number; z: number }>): {
  x: number;
  y: number;
  z: number;
} {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) {
      continue;
    }
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }
  return { x: nx, y: ny, z: nz };
}

/**
 * Returns whether one display triangle has area and agrees with a normal.
 *
 * @param position Position attribute.
 * @param index Index buffer.
 * @param triangleIndex Triangle index.
 * @param normal Face normal.
 * @returns True when the triangle faces with the normal.
 */
function triangleAgreesWithNormal(
  position: import('three').BufferAttribute | import('three').InterleavedBufferAttribute,
  index: import('three').BufferAttribute,
  triangleIndex: number,
  normal: { x: number; y: number; z: number },
): boolean {
  const a = cornerPosition(position, index.getX(triangleIndex * 3));
  const b = cornerPosition(position, index.getX(triangleIndex * 3 + 1));
  const c = cornerPosition(position, index.getX(triangleIndex * 3 + 2));
  const cross = triangleCross(a, b, c);
  const area = cross.x * cross.x + cross.y * cross.y + cross.z * cross.z;
  if (area < 1e-8) {
    return false;
  }
  return cross.x * normal.x + cross.y * normal.y + cross.z * normal.z > 0;
}

/**
 * Reads one vertex position.
 *
 * @param position Position attribute.
 * @param vertexIndex Vertex index.
 * @returns Position.
 */
function cornerPosition(
  position: import('three').BufferAttribute | import('three').InterleavedBufferAttribute,
  vertexIndex: number,
): { x: number; y: number; z: number } {
  return {
    x: position.getX(vertexIndex),
    y: position.getY(vertexIndex),
    z: position.getZ(vertexIndex),
  };
}

/**
 * Returns the cross product of triangle edges.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns Cross product.
 */
function triangleCross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  return {
    x: aby * acz - abz * acy,
    y: abz * acx - abx * acz,
    z: abx * acy - aby * acx,
  };
}

/** One xyz point used by dissolve coverage checks. */
interface CoveragePoint {
  x: number;
  y: number;
  z: number;
}

function positionsCoincideIn(
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

function hasDuplicatePositions(geometry: TopologyWorkingGeometry): boolean {
  for (let left = 0; left < geometry.positions.length; left++) {
    for (let right = left + 1; right < geometry.positions.length; right++) {
      const a = geometry.positions[left];
      const b = geometry.positions[right];
      if (a && b && a.distanceToSquared(b) < 1e-8) {
        return true;
      }
    }
  }
  return false;
}

function planarQuadHasArea(geometry: TopologyWorkingGeometry, face: TopologyWorkingFace): boolean {
  if (face.vertexIndices.length !== 4) {
    return false;
  }
  const points = face.vertexIndices.map((index) => geometry.positions[index]);
  const first = points[0];
  if (!first || points.some((point) => !point)) {
    return false;
  }
  const sameX = points.every((point) => point && Math.abs(point.x - first.x) < 1e-4);
  const sameY = points.every((point) => point && Math.abs(point.y - first.y) < 1e-4);
  const sameZ = points.every((point) => point && Math.abs(point.z - first.z) < 1e-4);
  if (sameX || sameY || sameZ) {
    return false;
  }
  const uvA = face.cornerUvs[0];
  const uvB = face.cornerUvs[1];
  const uvC = face.cornerUvs[2];
  if (!uvA || !uvB || !uvC) {
    return false;
  }
  const area = (uvB.u - uvA.u) * (uvC.v - uvA.v) - (uvB.v - uvA.v) * (uvC.u - uvA.u);
  return Math.abs(area) > 0.5;
}

function dissolvedEdgeBecomesPlanarWedge(geometry: TopologyWorkingGeometry, vertexA: number, vertexB: number): boolean {
  const start = geometry.positions[vertexA]?.clone();
  const end = geometry.positions[vertexB]?.clone();
  if (!start || !end || !dissolveTopologyWorkingEdge(geometry, vertexA, vertexB, false).applied) {
    return false;
  }
  if (geometry.faces.length !== 5 || positionsCoincideIn(geometry, start) || positionsCoincideIn(geometry, end)) {
    return false;
  }
  return !hasDuplicatePositions(geometry) && geometry.faces.some((face) => planarQuadHasArea(geometry, face));
}

/**
 * Finds the undirected edge whose endpoints share the maximum X and Y.
 *
 * @param geometry Working geometry.
 * @returns Edge endpoints, or null.
 */
function findEdgeAtMaximumXAndY(geometry: TopologyWorkingGeometry): { vertexA: number; vertexB: number } | null {
  const maxX = maximumCoordinate(geometry, 'x');
  const maxY = maximumCoordinate(geometry, 'y');
  for (const edge of collectTopologyWorkingEdges(geometry)) {
    if (edgeSitsOnMaximumXAndY(geometry, edge.vertexA, edge.vertexB, maxX, maxY)) {
      return { vertexA: edge.vertexA, vertexB: edge.vertexB };
    }
  }
  return null;
}

/**
 * Returns the maximum value of one position component.
 *
 * @param geometry Working geometry.
 * @param axis Position component.
 * @returns Maximum value.
 */
function maximumCoordinate(geometry: TopologyWorkingGeometry, axis: 'x' | 'y'): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const position of geometry.positions) {
    maximum = Math.max(maximum, position[axis]);
  }
  return maximum;
}

/**
 * Returns whether both endpoints lie on the maximum X and Y.
 *
 * @param geometry Working geometry.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param maxX Maximum X.
 * @param maxY Maximum Y.
 * @returns True when the edge is the top-right edge.
 */
function edgeSitsOnMaximumXAndY(
  geometry: TopologyWorkingGeometry,
  vertexA: number,
  vertexB: number,
  maxX: number,
  maxY: number,
): boolean {
  const start = geometry.positions[vertexA];
  const end = geometry.positions[vertexB];
  if (!start || !end) {
    return false;
  }
  return cornerOnMaximum(start, maxX, maxY) && cornerOnMaximum(end, maxX, maxY);
}

/**
 * Returns whether a point is on the maximum X and Y.
 *
 * @param position Point to test.
 * @param maxX Maximum X.
 * @param maxY Maximum Y.
 * @returns True when both components match.
 */
function cornerOnMaximum(position: CoveragePoint, maxX: number, maxY: number): boolean {
  return Math.abs(position.x - maxX) < 1e-6 && Math.abs(position.y - maxY) < 1e-6;
}

/**
 * Returns whether two points are the same within a small epsilon.
 *
 * @param first First point.
 * @param second Second point.
 * @returns True when the points coincide.
 */
function pointsCoincide(first: CoveragePoint, second: CoveragePoint): boolean {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = first.z - second.z;
  return dx * dx + dy * dy + dz * dz < 1e-8;
}

/**
 * Returns whether every brush face fans into outward triangles without
 * duplicates.
 *
 * @param brush Dissolved brush.
 * @returns True when the hull is a five-face wedge with a clean quad.
 */
function brushHasPlanarQuadWithoutDuplicateCorners(brush: SolidBrush): boolean {
  let quadCount = 0;
  for (const face of brush.faces) {
    const points = brush.getFaceVertices(face);
    if (hasConsecutiveDuplicate(points) || !fanFacesWithPolygon(points)) {
      return false;
    }
    if (points.length === 4) {
      quadCount += 1;
    }
  }
  return quadCount >= 1;
}

/**
 * Returns whether consecutive face corners share a position.
 *
 * @param points Ordered corners.
 * @returns True when a zero-length edge is present.
 */
function hasConsecutiveDuplicate(points: ReadonlyArray<CoveragePoint>): boolean {
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    const current = points[index];
    if (current && next && pointsCoincide(current, next)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a fan from the first corner stays on the face and faces with
 * it.
 *
 * @param points Ordered corners.
 * @returns True when every fan triangle agrees with the polygon normal.
 */
function fanFacesWithPolygon(points: readonly CoveragePoint[]): boolean {
  if (points.length < 3) {
    return false;
  }
  const faceNormal = newellNormal(points);
  const origin = points[0];
  if (!origin) {
    return false;
  }
  for (let index = 1; index < points.length - 1; index++) {
    if (!fanTriangleAgrees(origin, points[index], points[index + 1], faceNormal)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether one fan triangle has area and agrees with a normal.
 *
 * @param origin Fan origin.
 * @param mid Second corner.
 * @param last Third corner.
 * @param faceNormal Polygon normal.
 * @returns True when the triangle faces with the polygon.
 */
function fanTriangleAgrees(
  origin: CoveragePoint,
  mid: CoveragePoint | undefined,
  last: CoveragePoint | undefined,
  faceNormal: CoveragePoint,
): boolean {
  if (!mid || !last) {
    return false;
  }
  const normal = triangleCross(origin, mid, last);
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length < 1e-8) {
    return false;
  }
  return normal.x * faceNormal.x + normal.y * faceNormal.y + normal.z * faceNormal.z > 0;
}

/**
 * Returns whether the new slanted quad uses a centered unit brush UV.
 *
 * @param source Brush before the dissolve.
 * @param solid Brush after the dissolve.
 * @returns True when the quad UV is centered, outward, and unit scale.
 */
function dissolvedBrushQuadUsesBrushUv(source: SolidBrush, solid: SolidBrush): boolean {
  const transferred = transferSurfacesByPlaneMatch(source, createDefaultFaceSurface(), [], solid);
  const faceIndex = slantedFaceIndex(solid);
  const surface = faceIndex < 0 ? undefined : transferred.faceSurfaces[faceIndex];
  const face = faceIndex < 0 ? undefined : solid.faces[faceIndex];
  if (!surface || !face) {
    return false;
  }
  const points = solid.getFaceVertices(face);
  const uvs = points.map((point) => surface.uv.project(point));
  return uvBoxIsCentered(uvs) && fanUvAreasPositive(uvs) && boundaryScaleIsUnity(points, uvs);
}

/**
 * Finds the face whose normal is not axis aligned.
 *
 * @param solid Dissolved brush.
 * @returns Face index, or -1.
 */
function slantedFaceIndex(solid: SolidBrush): number {
  for (let index = 0; index < solid.planes.length; index++) {
    const normal = solid.planes[index]?.normal;
    if (normal && Math.abs(normal.x) > 0.2 && Math.abs(normal.y) > 0.2) {
      return index;
    }
  }
  return -1;
}

/**
 * Returns whether the UV bounding box is centered on the brush default offset.
 *
 * @param uvs Projected corner UVs.
 * @returns True when the box center is near (0.5, 0.5).
 */
function uvBoxIsCentered(uvs: readonly { u: number; v: number }[]): boolean {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const uv of uvs) {
    minU = Math.min(minU, uv.u);
    maxU = Math.max(maxU, uv.u);
    minV = Math.min(minV, uv.v);
    maxV = Math.max(maxV, uv.v);
  }
  return Math.abs((minU + maxU) * 0.5 - 0.5) < 0.05 && Math.abs((minV + maxV) * 0.5 - 0.5) < 0.05;
}

/**
 * Returns whether both fan triangles of a quad have positive UV area.
 *
 * @param uvs Quad corner UVs in face order.
 * @returns True when neither triangle is flipped or collapsed.
 */
function fanUvAreasPositive(uvs: readonly { u: number; v: number }[]): boolean {
  const first = uvs[0];
  const second = uvs[1];
  const third = uvs[2];
  const fourth = uvs[3];
  if (!first || !second || !third || !fourth) {
    return false;
  }
  return uvTriangleArea(first, second, third) > 0.2 && uvTriangleArea(first, third, fourth) > 0.2;
}

/**
 * Returns twice the signed area of a UV triangle.
 *
 * @param first First corner.
 * @param second Second corner.
 * @param third Third corner.
 * @returns Signed doubled area.
 */
function uvTriangleArea(
  first: { u: number; v: number },
  second: { u: number; v: number },
  third: { u: number; v: number },
): number {
  return (second.u - first.u) * (third.v - first.v) - (third.u - first.u) * (second.v - first.v);
}

/**
 * Returns whether each boundary edge keeps one UV unit per world unit.
 *
 * @param points Face corners.
 * @param uvs Corner UVs aligned with the points.
 * @returns True when every edge scale is near 1.
 */
function boundaryScaleIsUnity(
  points: readonly {
    distanceTo: (other: { x: number; y: number; z: number }) => number;
    x: number;
    y: number;
    z: number;
  }[],
  uvs: readonly { u: number; v: number }[],
): boolean {
  for (let index = 0; index < points.length; index++) {
    if (!edgeScaleIsUnity(points, uvs, index)) {
      return false;
    }
  }
  return points.length >= 4;
}

/**
 * Returns whether one boundary edge has unit UV scale.
 *
 * @param points Face corners.
 * @param uvs Corner UVs.
 * @param index Edge start.
 * @returns True when world length and UV length agree.
 */
function edgeScaleIsUnity(
  points: readonly {
    distanceTo: (other: { x: number; y: number; z: number }) => number;
    x: number;
    y: number;
    z: number;
  }[],
  uvs: readonly { u: number; v: number }[],
  index: number,
): boolean {
  const next = (index + 1) % points.length;
  const start = points[index];
  const end = points[next];
  const startUv = uvs[index];
  const endUv = uvs[next];
  if (!start || !end || !startUv || !endUv) {
    return false;
  }
  const world = start.distanceTo(end);
  const texture = Math.hypot(endUv.u - startUv.u, endUv.v - startUv.v);
  return world > 1e-6 && Math.abs(world / texture - 1) < 0.05;
}
