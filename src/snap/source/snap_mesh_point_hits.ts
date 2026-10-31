import * as THREE from 'three';
import { chooseSnapEdgePoint } from '@/snap/candidate/snap_candidate_edge_point.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { snapEdgeElementId, snapVertexElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';
import { getTriangleCount, getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { meshVertexCount, readMeshWorldVertex } from './snap_mesh_world_vertex.js';

/** Vertex count above which only the triangle under the pointer is searched. */
export const SNAP_DIRECT_VERTEX_LIMIT = 8192;

const scratchVertex = new THREE.Vector3();
const scratchEnd = new THREE.Vector3();

/**
 * Appends vertex hits for a mesh. Large meshes contribute only one triangle.
 *
 * @param mesh Mesh to search.
 * @param request Active query.
 * @param output Hit list.
 * @param limitedTriangle Triangle index when the mesh is over the direct limit.
 */
export function appendMeshVertexHits(
  mesh: THREE.Mesh,
  request: SnapQueryRequest,
  output: SnapHit[],
  limitedTriangle: number | null,
): void {
  if (!request.policy.allowsKind('vertex')) {
    return;
  }
  if (limitedTriangle !== null) {
    appendTriangleVertexHits(mesh, limitedTriangle, request, output);
    return;
  }
  appendEveryVertexHit(mesh, request, output);
}

/**
 * Appends edge hits for a mesh. Large meshes contribute only one triangle.
 *
 * @param mesh Mesh to search.
 * @param request Active query.
 * @param output Hit list.
 * @param limitedTriangle Triangle index when the mesh is over the direct limit.
 */
export function appendMeshEdgeHits(
  mesh: THREE.Mesh,
  request: SnapQueryRequest,
  output: SnapHit[],
  limitedTriangle: number | null,
): void {
  if (!request.policy.allowsKind('edge')) {
    return;
  }
  const seen = new Set<string>();
  if (limitedTriangle !== null) {
    appendTriangleEdgeHits(mesh, limitedTriangle, request, output, seen);
    return;
  }
  appendEveryEdgeHit(mesh, request, output, seen);
}

/**
 * Returns the triangle limit for a mesh, or null when every vertex is searched.
 *
 * @param mesh Mesh to measure.
 * @param faceIndex Triangle under the pointer, or null when the ray missed.
 * @returns Triangle index to limit to, or null for a full search.
 */
export function limitedTriangleForMesh(mesh: THREE.Mesh, faceIndex: number | null): number | null {
  if (meshVertexCount(mesh) <= SNAP_DIRECT_VERTEX_LIMIT) {
    return null;
  }
  return faceIndex;
}

/**
 * Appends one vertex hit when it lies inside the screen radius.
 *
 * @param mesh Mesh that owns the vertex.
 * @param index Vertex index.
 * @param request Active query.
 * @param output Hit list.
 */
function appendVertexHit(mesh: THREE.Mesh, index: number, request: SnapQueryRequest, output: SnapHit[]): void {
  if (!readMeshWorldVertex(mesh, index, scratchVertex)) {
    return;
  }
  const distance = snapScreenDistanceToPoint(
    scratchVertex,
    request.camera,
    request.pointerPixels,
    request.viewportWidth,
    request.viewportHeight,
  );
  if (distance === null || distance > request.policy.getScreenRadiusPixels()) {
    return;
  }
  output.push(vertexHit(mesh.uuid, index, scratchVertex, distance));
}

/**
 * Builds a vertex snap hit.
 *
 * @param ownerId Mesh uuid.
 * @param index Vertex index.
 * @param point World position.
 * @param distance Screen distance.
 * @returns Snap hit.
 */
function vertexHit(ownerId: string, index: number, point: THREE.Vector3, distance: number): SnapHit {
  return createSnapHit(
    point,
    new THREE.Vector3(),
    'vertex',
    ownerId,
    snapVertexElementId(ownerId, index),
    distance,
    null,
    null,
  );
}

/**
 * Appends a hit for every mesh vertex.
 *
 * @param mesh Mesh to search.
 * @param request Active query.
 * @param output Hit list.
 */
function appendEveryVertexHit(mesh: THREE.Mesh, request: SnapQueryRequest, output: SnapHit[]): void {
  const count = meshVertexCount(mesh);
  for (let index = 0; index < count; index++) {
    appendVertexHit(mesh, index, request, output);
  }
}

/**
 * Appends the three vertices of one triangle.
 *
 * @param mesh Mesh to search.
 * @param triangleIndex Triangle index.
 * @param request Active query.
 * @param output Hit list.
 */
function appendTriangleVertexHits(
  mesh: THREE.Mesh,
  triangleIndex: number,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  const corners = getTriangleVertexIndices(mesh.geometry, triangleIndex);
  appendVertexHit(mesh, corners[0], request, output);
  appendVertexHit(mesh, corners[1], request, output);
  appendVertexHit(mesh, corners[2], request, output);
}

/**
 * Appends an edge hit for one undirected corner pair.
 *
 * @param mesh Mesh that owns the edge.
 * @param firstIndex First vertex index.
 * @param secondIndex Second vertex index.
 * @param request Active query.
 * @param output Hit list.
 * @param seen Edge keys already emitted.
 */
function appendEdgeHit(
  mesh: THREE.Mesh,
  firstIndex: number,
  secondIndex: number,
  request: SnapQueryRequest,
  output: SnapHit[],
  seen: Set<string>,
): void {
  const key = edgeKey(firstIndex, secondIndex);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  if (!readMeshWorldVertex(mesh, firstIndex, scratchVertex) || !readMeshWorldVertex(mesh, secondIndex, scratchEnd)) {
    return;
  }
  pushEdgeChoice(mesh.uuid, firstIndex, secondIndex, scratchVertex, scratchEnd, request, output);
}

/**
 * Builds the undirected edge key.
 *
 * @param firstIndex First vertex index.
 * @param secondIndex Second vertex index.
 * @returns Key string.
 */
function edgeKey(firstIndex: number, secondIndex: number): string {
  const low = Math.min(firstIndex, secondIndex);
  const high = Math.max(firstIndex, secondIndex);
  return `${low}:${high}`;
}

/**
 * Appends the snap hit for a measured edge.
 *
 * @param ownerId Mesh uuid.
 * @param firstIndex First vertex index.
 * @param secondIndex Second vertex index.
 * @param start World start. Copied before the next read.
 * @param end World end.
 * @param request Active query.
 * @param output Hit list.
 */
function pushEdgeChoice(
  ownerId: string,
  firstIndex: number,
  secondIndex: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  const startCopy = start.clone();
  const endCopy = end.clone();
  const choice = chooseSnapEdgePoint(
    startCopy,
    endCopy,
    request.camera,
    request.pointerPixels,
    request.viewportWidth,
    request.viewportHeight,
    request.policy.getScreenRadiusPixels(),
  );
  if (!choice) {
    return;
  }
  const low = Math.min(firstIndex, secondIndex);
  const high = Math.max(firstIndex, secondIndex);
  const direction = endCopy.clone().sub(startCopy).normalize();
  output.push(
    createSnapHit(
      choice.point,
      direction,
      'edge',
      ownerId,
      snapEdgeElementId(ownerId, low, high),
      choice.screenDistancePixels,
      startCopy,
      endCopy,
    ),
  );
}

/**
 * Appends every triangle edge of a mesh.
 *
 * @param mesh Mesh to search.
 * @param request Active query.
 * @param output Hit list.
 * @param seen Edge keys already emitted.
 */
function appendEveryEdgeHit(mesh: THREE.Mesh, request: SnapQueryRequest, output: SnapHit[], seen: Set<string>): void {
  const triangleCount = getTriangleCount(mesh.geometry);
  for (let index = 0; index < triangleCount; index++) {
    appendTriangleEdgeHits(mesh, index, request, output, seen);
  }
}

/**
 * Appends the three edges of one triangle.
 *
 * @param mesh Mesh to search.
 * @param triangleIndex Triangle index.
 * @param request Active query.
 * @param output Hit list.
 * @param seen Edge keys already emitted.
 */
function appendTriangleEdgeHits(
  mesh: THREE.Mesh,
  triangleIndex: number,
  request: SnapQueryRequest,
  output: SnapHit[],
  seen: Set<string>,
): void {
  const corners = getTriangleVertexIndices(mesh.geometry, triangleIndex);
  appendEdgeHit(mesh, corners[0], corners[1], request, output, seen);
  appendEdgeHit(mesh, corners[1], corners[2], request, output, seen);
  appendEdgeHit(mesh, corners[2], corners[0], request, output, seen);
}
