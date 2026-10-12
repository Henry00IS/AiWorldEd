import * as THREE from 'three';
import { MESH_HALF_EDGE_BOUNDARY_TWIN } from '@/mesh/topology/mesh_half_edge.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';

const scratchRead = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
const scratchWorldA = new THREE.Vector3();
const scratchWorldB = new THREE.Vector3();
const scratchPixelsA = new THREE.Vector2();
const scratchPixelsB = new THREE.Vector2();
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import type { ComponentVertexPickCandidate } from './raycaster_component_vertex.js';
import {
  distancePointToSegment2d,
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
  type EditComponentPickElementMetrics,
} from './edit_component_screen_metrics.js';

/** Result of an edge pick in Edit Mode. */
export interface ComponentEdgePickResult {
  targetId: string;
  edgeKey: string;
  worldPoint: THREE.Vector3;
}

/**
 * Picks the nearest undirected edge projected near the pointer.
 *
 * @param event Pointer or mouse event.
 * @param camera Active camera.
 * @param pickElement Element providing size for NDC.
 * @param candidates Domain content meshes with documents.
 * @param pixelRadius Max screen distance in CSS pixels.
 * @returns Closest edge pick, or null.
 */
export function pickComponentEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidates: readonly ComponentVertexPickCandidate[],
  pixelRadius: number = 56,
): ComponentEdgePickResult | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  let best: ComponentEdgePickResult | null = null;
  let bestDistance = pixelRadius;
  for (const candidate of candidates) {
    const hit = pickEdgesOnCandidate(candidate, camera, metrics, pointerPixels, bestDistance);
    if (!hit) {
      continue;
    }
    bestDistance = hit.screenDistance;
    best = hit.result;
  }
  return best;
}

/**
 * Picks the closest edge on one candidate mesh.
 *
 * @param candidate Mesh document candidate.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @param pointerPixels Pointer in CSS pixels.
 * @param bestDistance Current best screen distance.
 * @returns Hit with distance, or null.
 */
function pickEdgesOnCandidate(
  candidate: ComponentVertexPickCandidate,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  pointerPixels: THREE.Vector2,
  bestDistance: number,
): { result: ComponentEdgePickResult; screenDistance: number } | null {
  const topology = candidate.document.getTopology();
  const positions = topology.getPositions();
  candidate.mesh.updateMatrixWorld(true);
  let best: { result: ComponentEdgePickResult; screenDistance: number } | null = null;
  let limit = bestDistance;
  const halfEdgeCount = topology.getHalfEdgeCount();
  for (let halfEdgeIndex = 0; halfEdgeIndex < halfEdgeCount; halfEdgeIndex++) {
    const hit = considerUniqueHalfEdge(candidate, halfEdgeIndex, positions, camera, metrics, pointerPixels, limit);
    if (!hit) {
      continue;
    }
    limit = hit.screenDistance;
    best = hit;
  }
  return best;
}

/**
 * Measures one undirected half-edge when this index owns the pair.
 *
 * @param candidate Mesh candidate.
 * @param halfEdgeIndex Half-edge index.
 * @param positions Packed positions.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @param pointerPixels Pointer in CSS pixels.
 * @param limit Current best screen distance.
 * @returns Closer hit, or null.
 */
function considerUniqueHalfEdge(
  candidate: ComponentVertexPickCandidate,
  halfEdgeIndex: number,
  positions: Float32Array,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  pointerPixels: THREE.Vector2,
  limit: number,
): { result: ComponentEdgePickResult; screenDistance: number } | null {
  const topology = candidate.document.getTopology();
  const halfEdge = topology.getHalfEdge(halfEdgeIndex);
  if (halfEdge.twinIndex !== MESH_HALF_EDGE_BOUNDARY_TWIN && halfEdgeIndex > halfEdge.twinIndex) {
    return null;
  }
  const vertexA = halfEdge.vertexIndex;
  const vertexB = topology.getHalfEdge(halfEdge.nextIndex).vertexIndex;
  const screenDistance = measureEdgeScreenDistance(
    positions,
    vertexA,
    vertexB,
    candidate.mesh.matrixWorld,
    camera,
    metrics,
    pointerPixels,
  );
  if (screenDistance === null || screenDistance > limit) {
    return null;
  }
  return {
    screenDistance,
    result: {
      targetId: candidate.targetId,
      edgeKey: buildComponentEdgeKey(vertexA, vertexB),
      worldPoint: new THREE.Vector3(),
    },
  };
}

/**
 * Measures screen-space distance from the pointer to a world edge segment.
 *
 * @param positions Packed vertex positions.
 * @param vertexA Edge start index.
 * @param vertexB Edge end index.
 * @param matrixWorld Mesh world matrix.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @param pointerPixels Pointer in CSS pixels.
 * @returns Distance in CSS pixels, or null when behind the camera.
 */
function measureEdgeScreenDistance(
  positions: Float32Array,
  vertexA: number,
  vertexB: number,
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  pointerPixels: THREE.Vector2,
): number | null {
  meshVertexPositionRead(positions, vertexA, scratchRead);
  scratchWorldA.set(scratchRead[0], scratchRead[1], scratchRead[2]).applyMatrix4(matrixWorld);
  meshVertexPositionRead(positions, vertexB, scratchRead);
  scratchWorldB.set(scratchRead[0], scratchRead[1], scratchRead[2]).applyMatrix4(matrixWorld);
  const projectedA = projectWorldPointToPickPixels(scratchWorldA, camera, metrics, scratchPixelsA);
  const projectedB = projectWorldPointToPickPixels(scratchWorldB, camera, metrics, scratchPixelsB);
  if (!projectedA && !projectedB) {
    return null;
  }
  const ax = projectedA?.x ?? projectedB!.x;
  const ay = projectedA?.y ?? projectedB!.y;
  const bx = projectedB?.x ?? projectedA!.x;
  const by = projectedB?.y ?? projectedA!.y;
  return distancePointToSegment2d(pointerPixels.x, pointerPixels.y, ax, ay, bx, by);
}
