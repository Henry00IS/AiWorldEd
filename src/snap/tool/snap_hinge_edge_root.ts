import * as THREE from 'three';
import { getTriangleCount, getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** Squared distance that still counts as the same edge endpoint. */
const EDGE_POINT_EPSILON_SQUARED = 1e-8;

/**
 * Object that should hinge. A compiled solid edge returns the brush that owns
 * it, so the rest of the solid stays put.
 *
 * @param mesh Mesh that owns the picked edge.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns Brush preview, or the mesh when it is not a solid result.
 */
export function snapHingeEdgeRoot(mesh: THREE.Mesh, pointA: THREE.Vector3, pointB: THREE.Vector3): THREE.Object3D {
  if (SolidBrushVisual.isBrushObject(mesh)) {
    return mesh;
  }
  return authoredBrushMesh(mesh, pointA, pointB) ?? mesh;
}

/**
 * Returns the brush preview that authored a result-mesh edge.
 *
 * @param mesh Picked mesh.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns Brush preview, or null when the edge is not on a compiled solid.
 */
function authoredBrushMesh(mesh: THREE.Mesh, pointA: THREE.Vector3, pointB: THREE.Vector3): THREE.Mesh | null {
  if (!isResultMesh(mesh)) {
    return null;
  }
  mesh.updateMatrixWorld(true);
  const brushId = brushIdOwningEdge(mesh, pointA, pointB);
  if (!brushId) {
    return null;
  }
  return brushPreview(mesh, brushId);
}

/**
 * Returns the preview mesh for a brush id on the mesh's solid.
 *
 * @param mesh Result mesh.
 * @param brushId Brush id.
 * @returns Preview mesh, or null.
 */
function brushPreview(mesh: THREE.Mesh, brushId: string): THREE.Mesh | null {
  const preview = SolidModel.fromObject(mesh)?.findBrush(brushId)?.mesh;
  return preview ?? null;
}

/**
 * Finds the brush id of the result triangle that contains an edge.
 *
 * @param mesh Result mesh.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns Brush id, or null.
 */
function brushIdOwningEdge(mesh: THREE.Mesh, pointA: THREE.Vector3, pointB: THREE.Vector3): string | null {
  const brushIds = readTriangleBrushIds(mesh);
  const positions = mesh.geometry.getAttribute('position');
  if (!brushIds || !positions) {
    return null;
  }
  return firstOwningBrushId(mesh, positions, brushIds, pointA, pointB);
}

/**
 * Returns the first triangle brush id whose boundary matches the edge.
 *
 * @param mesh Result mesh.
 * @param positions Position attribute.
 * @param brushIds Brush id per triangle.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns Brush id, or null.
 */
function firstOwningBrushId(
  mesh: THREE.Mesh,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  brushIds: readonly string[],
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): string | null {
  const count = Math.min(getTriangleCount(mesh.geometry), brushIds.length);
  for (let faceIndex = 0; faceIndex < count; faceIndex += 1) {
    const brushId = brushIdWhenTriangleOwnsEdge(mesh, positions, brushIds, faceIndex, pointA, pointB);
    if (brushId) {
      return brushId;
    }
  }
  return null;
}

/**
 * Returns the triangle's brush id when the edge lies on its boundary.
 *
 * @param mesh Result mesh.
 * @param positions Position attribute.
 * @param brushIds Brush id per triangle.
 * @param faceIndex Triangle index.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns Brush id, or null.
 */
function brushIdWhenTriangleOwnsEdge(
  mesh: THREE.Mesh,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  brushIds: readonly string[],
  faceIndex: number,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): string | null {
  const brushId = brushIds[faceIndex] ?? '';
  if (!brushId || !triangleOwnsEdge(mesh, positions, faceIndex, pointA, pointB)) {
    return null;
  }
  return brushId;
}

/**
 * Returns whether a triangle boundary contains the world edge.
 *
 * @param mesh Result mesh.
 * @param positions Position attribute.
 * @param faceIndex Triangle index.
 * @param pointA Edge start in world space.
 * @param pointB Edge end in world space.
 * @returns True when both endpoints match one triangle edge.
 */
function triangleOwnsEdge(
  mesh: THREE.Mesh,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  faceIndex: number,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
): boolean {
  const corners = getTriangleVertexIndices(mesh.geometry, faceIndex);
  const first = worldCorner(positions, mesh.matrixWorld, corners[0]);
  const second = worldCorner(positions, mesh.matrixWorld, corners[1]);
  const third = worldCorner(positions, mesh.matrixWorld, corners[2]);
  if (!first || !second || !third) {
    return false;
  }
  return boundaryMatches(pointA, pointB, first, second, third);
}

/**
 * Returns whether the edge matches one side of a triangle.
 *
 * @param pointA Edge start.
 * @param pointB Edge end.
 * @param first First corner.
 * @param second Second corner.
 * @param third Third corner.
 * @returns True when the endpoints match a side.
 */
function boundaryMatches(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  first: THREE.Vector3,
  second: THREE.Vector3,
  third: THREE.Vector3,
): boolean {
  if (endpointsMatch(pointA, pointB, first, second)) {
    return true;
  }
  if (endpointsMatch(pointA, pointB, second, third)) {
    return true;
  }
  return endpointsMatch(pointA, pointB, third, first);
}

/**
 * Transforms one vertex into world space.
 *
 * @param positions Position attribute.
 * @param matrix World matrix.
 * @param index Vertex index, when present.
 * @returns World point, or null.
 */
function worldCorner(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  matrix: THREE.Matrix4,
  index: number | undefined,
): THREE.Vector3 | null {
  if (index === undefined) {
    return null;
  }
  return new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
}

/**
 * Returns whether two segments share both endpoints.
 *
 * @param pointA First segment start.
 * @param pointB First segment end.
 * @param start Second segment start.
 * @param end Second segment end.
 * @returns True when the endpoints match in either order.
 */
function endpointsMatch(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): boolean {
  const direct = nearPoint(pointA, start) && nearPoint(pointB, end);
  const flipped = nearPoint(pointA, end) && nearPoint(pointB, start);
  return direct || flipped;
}

/**
 * Returns whether two points are the same endpoint.
 *
 * @param first First point.
 * @param second Second point.
 * @returns True when the squared distance is inside the endpoint epsilon.
 */
function nearPoint(first: THREE.Vector3, second: THREE.Vector3): boolean {
  return first.distanceToSquared(second) <= EDGE_POINT_EPSILON_SQUARED;
}

/**
 * Reads one brush id per result triangle.
 *
 * @param mesh Result mesh.
 * @returns Brush ids, or null when the mesh has no source table.
 */
function readTriangleBrushIds(mesh: THREE.Mesh): string[] | null {
  const raw = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.map((row) => brushIdFromRow(row));
}

/**
 * Reads a brush id from one source row.
 *
 * @param row Source row.
 * @returns Brush id, or an empty string.
 */
function brushIdFromRow(row: unknown): string {
  if (!row || typeof row !== 'object' || !('brushId' in row)) {
    return '';
  }
  const brushId = row.brushId;
  return typeof brushId === 'string' ? brushId : '';
}
