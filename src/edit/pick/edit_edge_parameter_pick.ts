import * as THREE from 'three';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import type { ComponentVertexPickCandidate } from '@/edit/pick/raycaster_component_vertex.js';
import {
  closestWorldPointOnSegmentToPointer,
  measureWorldSegmentScreenDistance,
} from '@/edit/pick/raycaster_component_world_points.js';
import { MESH_HALF_EDGE_BOUNDARY_TWIN } from '@/mesh/topology/mesh_half_edge.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { EDIT_COMPONENT_EDGE_PICK_RADIUS_PX } from '@/edit/component/component_edit_pick_radii.js';
import { resolveEditComponentPickRadius } from '@/edit/pick/edit_component_screen_metrics.js';

const scratchRead = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
const scratchWorldA = new THREE.Vector3();
const scratchWorldB = new THREE.Vector3();

/** Nearest domain edge under the pointer, with a split parameter. */
export interface EditEdgeParameterHit {
  /** Domain target id. */
  targetId: string;
  /** First endpoint. */
  vertexA: number;
  /** Second endpoint. */
  vertexB: number;
  /** Parameter along A→B. */
  parameter: number;
  /** World-space point on the edge. */
  worldPoint: THREE.Vector3;
  /** World-space edge direction. */
  edgeDirection: THREE.Vector3;
  /** World-space start of the edge. */
  worldA: THREE.Vector3;
  /** World-space end of the edge. */
  worldB: THREE.Vector3;
}

/**
 * Picks the nearest mesh or brush edge and the parameter along it.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param meshCandidates Mesh document candidates.
 * @param brushCages Brush cages.
 * @returns Edge hit, or null.
 */
export function pickEditEdgeParameterAtClient(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  meshCandidates: readonly ComponentVertexPickCandidate[],
  brushCages: readonly BrushEditCage[],
): EditEdgeParameterHit | null {
  const pixelRadius = resolveEditComponentPickRadius(camera, EDIT_COMPONENT_EDGE_PICK_RADIUS_PX);
  let best: { hit: EditEdgeParameterHit; distance: number } | null = null;
  best = pickBestMeshEdgeParameter(event, camera, pickElement, meshCandidates, pixelRadius, best);
  return (
    pickBestBrushEdgeParameter(event, camera, pickElement, brushCages, pixelRadius, best)?.hit ?? best?.hit ?? null
  );
}

/**
 * Picks the closest mesh document edge.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param meshCandidates Mesh candidates.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function pickBestMeshEdgeParameter(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  meshCandidates: readonly ComponentVertexPickCandidate[],
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  let current = best;
  for (const candidate of meshCandidates) {
    current = considerMeshCandidateEdges(event, camera, pickElement, candidate, pixelRadius, current);
  }
  return current;
}

/**
 * Considers every undirected edge on one mesh candidate.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param candidate Mesh candidate.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function considerMeshCandidateEdges(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidate: ComponentVertexPickCandidate,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  candidate.mesh.updateMatrixWorld(true);
  return considerDocumentHalfEdges(event, camera, pickElement, candidate, pixelRadius, best);
}

/**
 * Walks each undirected half-edge once.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param candidate Mesh candidate.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function considerDocumentHalfEdges(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidate: ComponentVertexPickCandidate,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  const halfEdgeCount = candidate.document.getTopology().getHalfEdgeCount();
  let current = best;
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    current = considerDocumentHalfEdge(event, camera, pickElement, candidate, halfEdgeIndex, pixelRadius, current);
  }
  return current;
}

/**
 * Considers one half-edge when it owns the undirected pair.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param candidate Mesh candidate.
 * @param halfEdgeIndex Half-edge index.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function considerDocumentHalfEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidate: ComponentVertexPickCandidate,
  halfEdgeIndex: number,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  const endpoints = readUniqueHalfEdgeEndpoints(candidate, halfEdgeIndex);
  if (!endpoints) {
    return best;
  }
  writeDocumentVertexWorld(candidate, endpoints.vertexA, scratchWorldA);
  writeDocumentVertexWorld(candidate, endpoints.vertexB, scratchWorldB);
  return considerOneWorldEdge(
    event,
    camera,
    pickElement,
    candidate.targetId,
    endpoints.vertexA,
    endpoints.vertexB,
    scratchWorldA,
    scratchWorldB,
    pixelRadius,
    best,
  );
}

/**
 * Returns the endpoints of a half-edge that owns its undirected pair.
 *
 * @param candidate Mesh candidate.
 * @param halfEdgeIndex Half-edge index.
 * @returns Endpoints, or null when the twin owns the pair.
 */
function readUniqueHalfEdgeEndpoints(
  candidate: ComponentVertexPickCandidate,
  halfEdgeIndex: number,
): { vertexA: number; vertexB: number } | null {
  const topology = candidate.document.getTopology();
  const halfEdge = topology.getHalfEdge(halfEdgeIndex);
  if (halfEdge.twinIndex !== MESH_HALF_EDGE_BOUNDARY_TWIN && halfEdgeIndex > halfEdge.twinIndex) {
    return null;
  }
  return {
    vertexA: halfEdge.vertexIndex,
    vertexB: topology.getHalfEdge(halfEdge.nextIndex).vertexIndex,
  };
}

/**
 * Writes one document vertex into a world-space vector.
 *
 * @param candidate Mesh candidate.
 * @param vertexIndex Document vertex index.
 * @param target Output world position.
 */
function writeDocumentVertexWorld(
  candidate: ComponentVertexPickCandidate,
  vertexIndex: number,
  target: THREE.Vector3,
): void {
  meshVertexPositionRead(candidate.document.getTopology().getPositions(), vertexIndex, scratchRead);
  target.set(scratchRead[0], scratchRead[1], scratchRead[2]).applyMatrix4(candidate.mesh.matrixWorld);
}

/**
 * Picks the closest brush cage edge.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param brushCages Brush cages.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function pickBestBrushEdgeParameter(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  brushCages: readonly BrushEditCage[],
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  let current = best;
  for (const cage of brushCages) {
    current = considerBrushCageEdges(event, camera, pickElement, cage, pixelRadius, current);
  }
  return current;
}

/**
 * Considers every cage edge on one brush.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param cage Brush cage.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function considerBrushCageEdges(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  cage: BrushEditCage,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  let current = best;
  for (const edge of cage.edges) {
    current = considerOneWorldEdge(
      event,
      camera,
      pickElement,
      cage.targetId,
      edge.vertexA,
      edge.vertexB,
      cage.worldPositions[edge.vertexA],
      cage.worldPositions[edge.vertexB],
      pixelRadius,
      current,
    );
  }
  return current;
}

/**
 * Considers one world-space edge as a pick candidate.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param targetId Target id.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param worldA World start.
 * @param worldB World end.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns Updated best hit.
 */
function considerOneWorldEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  targetId: string,
  vertexA: number,
  vertexB: number,
  worldA: THREE.Vector3 | undefined,
  worldB: THREE.Vector3 | undefined,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): { hit: EditEdgeParameterHit; distance: number } | null {
  if (!worldA || !worldB || !isCloserThanBest(event, camera, pickElement, worldA, worldB, pixelRadius, best)) {
    return best;
  }
  return buildEdgeParameterHit(event, camera, pickElement, targetId, vertexA, vertexB, worldA, worldB);
}

/**
 * Returns whether an edge is closer than the current best hit.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param worldA World start.
 * @param worldB World end.
 * @param pixelRadius Screen radius.
 * @param best Current best hit.
 * @returns True when this edge should replace the best hit.
 */
function isCloserThanBest(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  pixelRadius: number,
  best: { hit: EditEdgeParameterHit; distance: number } | null,
): boolean {
  const distance = measureWorldSegmentScreenDistance(event, camera, pickElement, worldA, worldB);
  if (distance === null || distance > pixelRadius) {
    return false;
  }
  return !best || distance < best.distance;
}

/**
 * Builds an edge-parameter hit from a world segment.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param targetId Target id.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @param worldA World start.
 * @param worldB World end.
 * @returns Hit wrapper, or the previous miss as null.
 */
function buildEdgeParameterHit(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  targetId: string,
  vertexA: number,
  vertexB: number,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): { hit: EditEdgeParameterHit; distance: number } | null {
  const worldPoint = closestWorldPointOnSegmentToPointer(event, camera, pickElement, worldA, worldB);
  const distance = measureWorldSegmentScreenDistance(event, camera, pickElement, worldA, worldB);
  if (!worldPoint || distance === null) {
    return null;
  }
  const length = worldA.distanceTo(worldB);
  const parameter = length < 1e-12 ? 0.5 : worldA.distanceTo(worldPoint) / length;
  return {
    distance,
    hit: {
      targetId,
      vertexA,
      vertexB,
      parameter,
      worldPoint,
      edgeDirection: worldB.clone().sub(worldA),
      worldA: worldA.clone(),
      worldB: worldB.clone(),
    },
  };
}
