import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { isWorldPointUnoccluded } from './edit_component_occlusion.js';
import {
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
} from './edit_component_screen_metrics.js';

/** Closest visible document vertex near the pointer. */
export interface MeshDocumentVertexPick {
  /** Document vertex index. */
  vertexIndex: number;
  /** Screen distance in CSS pixels. */
  screenDistance: number;
}

const scratchRead = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();
const scratchPixels = new THREE.Vector2();
const scratchPointer = new THREE.Vector2();

/**
 * Picks the nearest unoccluded document vertex near the pointer. Positions stay
 * packed; only the current candidate is transformed.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param document Mesh document.
 * @param matrixWorld Mesh world matrix.
 * @param pixelRadius Maximum screen distance.
 * @param occluders Meshes that hide components.
 * @returns Closest vertex, or null.
 */
export function pickMeshDocumentVertex(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  document: MeshDocument,
  matrixWorld: THREE.Matrix4,
  pixelRadius: number,
  occluders: readonly THREE.Mesh[],
): MeshDocumentVertexPick | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  pointerEventToPickPixels(event, pickElement, metrics, scratchPointer);
  const positions = document.getTopology().getPositions();
  const vertexCount = document.getTopology().getVertexCount();
  let bestIndex = -1;
  let bestDistance = pixelRadius;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const screenDistance = vertexScreenDistance(positions, vertexIndex, matrixWorld, camera, metrics);
    if (screenDistance === null || screenDistance > bestDistance) {
      continue;
    }
    if (!isWorldPointUnoccluded(scratchWorld, camera, occluders)) {
      continue;
    }
    bestDistance = screenDistance;
    bestIndex = vertexIndex;
  }
  if (bestIndex < 0) {
    return null;
  }
  return { vertexIndex: bestIndex, screenDistance: bestDistance };
}

/**
 * Returns the screen distance of one vertex and leaves its world position in
 * scratch.
 *
 * @param positions Packed positions.
 * @param vertexIndex Vertex index.
 * @param matrixWorld Mesh world matrix.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @returns CSS pixel distance, or null when the vertex is outside the clip
 *   range.
 */
function vertexScreenDistance(
  positions: Float32Array,
  vertexIndex: number,
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
  metrics: ReturnType<typeof resolveEditComponentPickElementMetrics>,
): number | null {
  meshVertexPositionRead(positions, vertexIndex, scratchRead);
  scratchLocal.set(scratchRead[0], scratchRead[1], scratchRead[2]);
  scratchWorld.copy(scratchLocal).applyMatrix4(matrixWorld);
  const projected = projectWorldPointToPickPixels(scratchWorld, camera, metrics, scratchPixels);
  if (!projected) {
    return null;
  }
  return Math.hypot(projected.x - scratchPointer.x, projected.y - scratchPointer.y);
}
