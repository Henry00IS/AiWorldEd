import * as THREE from 'three';
import { chooseSnapEdgePoint } from '@/snap/candidate/snap_candidate_edge_point.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { snapEdgeElementId, snapVertexElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();
const scratchEnd = new THREE.Vector3();

/**
 * Appends cage vertex hits for a brush.
 *
 * @param brush Convex brush in local space.
 * @param worldMatrix Brush local-to-world matrix.
 * @param rootId Transform root id stored on each hit.
 * @param brushId Brush id used in element ids.
 * @param request Active query.
 * @param output Hit list.
 */
export function appendBrushVertexHits(
  brush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  rootId: string,
  brushId: string,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  if (!request.policy.allowsKind('vertex')) {
    return;
  }
  for (let index = 0; index < brush.vertices.length; index++) {
    appendBrushVertex(brush, index, worldMatrix, rootId, brushId, request, output);
  }
}

/**
 * Appends one unique cage edge hit per wing-edge pair.
 *
 * @param brush Convex brush in local space.
 * @param worldMatrix Brush local-to-world matrix.
 * @param rootId Transform root id stored on each hit.
 * @param brushId Brush id used in element ids.
 * @param request Active query.
 * @param output Hit list.
 */
export function appendBrushEdgeHits(
  brush: SolidBrush,
  worldMatrix: THREE.Matrix4,
  rootId: string,
  brushId: string,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  if (!request.policy.allowsKind('edge')) {
    return;
  }
  for (let edgeIndex = 0; edgeIndex < brush.wingEdges.length; edgeIndex++) {
    appendBrushEdge(brush, edgeIndex, worldMatrix, rootId, brushId, request, output);
  }
}

/**
 * Appends one brush vertex when it is inside the screen radius.
 *
 * @param brush Convex brush.
 * @param index Vertex index.
 * @param worldMatrix Local-to-world matrix.
 * @param rootId Transform root id.
 * @param brushId Brush id.
 * @param request Active query.
 * @param output Hit list.
 */
function appendBrushVertex(
  brush: SolidBrush,
  index: number,
  worldMatrix: THREE.Matrix4,
  rootId: string,
  brushId: string,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  const local = brush.vertices[index];
  if (!local) {
    return;
  }
  scratchWorld.copy(local).applyMatrix4(worldMatrix);
  const distance = snapScreenDistanceToPoint(
    scratchWorld,
    request.camera,
    request.pointerPixels,
    request.viewportWidth,
    request.viewportHeight,
  );
  if (distance === null || distance > request.policy.getScreenRadiusPixels()) {
    return;
  }
  output.push(
    createSnapHit(
      scratchWorld,
      new THREE.Vector3(),
      'vertex',
      rootId,
      snapVertexElementId(brushId, index),
      distance,
      null,
      null,
    ),
  );
}

/**
 * Appends one undirected brush edge when this wing edge owns the pair.
 *
 * @param brush Convex brush.
 * @param edgeIndex Wing-edge index.
 * @param worldMatrix Local-to-world matrix.
 * @param rootId Transform root id.
 * @param brushId Brush id.
 * @param request Active query.
 * @param output Hit list.
 */
function appendBrushEdge(
  brush: SolidBrush,
  edgeIndex: number,
  worldMatrix: THREE.Matrix4,
  rootId: string,
  brushId: string,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  const edge = brush.wingEdges[edgeIndex];
  if (!edge || edge.twinIndex < edgeIndex) {
    return;
  }
  const twin = brush.wingEdges[edge.twinIndex];
  if (!twin) {
    return;
  }
  const start = worldVertex(brush, edge.vertexIndex, worldMatrix, scratchWorld);
  const end = worldVertex(brush, twin.vertexIndex, worldMatrix, scratchEnd);
  if (!start || !end) {
    return;
  }
  pushBrushEdge(rootId, brushId, edge.vertexIndex, twin.vertexIndex, start, end, request, output);
}

/**
 * Transforms a brush vertex into world space.
 *
 * @param brush Convex brush.
 * @param index Vertex index.
 * @param worldMatrix Local-to-world matrix.
 * @param target Vector to fill.
 * @returns The target, or null when the index is missing.
 */
function worldVertex(
  brush: SolidBrush,
  index: number,
  worldMatrix: THREE.Matrix4,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const local = brush.vertices[index];
  if (!local) {
    return null;
  }
  scratchLocal.copy(local);
  return target.copy(scratchLocal).applyMatrix4(worldMatrix);
}

/**
 * Appends the magnetized point of one brush edge.
 *
 * @param rootId Transform root id.
 * @param brushId Brush id.
 * @param firstIndex First vertex index.
 * @param secondIndex Second vertex index.
 * @param start World start.
 * @param end World end.
 * @param request Active query.
 * @param output Hit list.
 */
function pushBrushEdge(
  rootId: string,
  brushId: string,
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
  const direction = endCopy.clone().sub(startCopy).normalize();
  output.push(
    createSnapHit(
      choice.point,
      direction,
      'edge',
      rootId,
      snapEdgeElementId(brushId, Math.min(firstIndex, secondIndex), Math.max(firstIndex, secondIndex)),
      choice.screenDistancePixels,
      startCopy,
      endCopy,
    ),
  );
}
