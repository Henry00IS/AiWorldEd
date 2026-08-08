import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  pickComponentFaceLoops,
  type ComponentFaceLoopPickResult,
  type ComponentFaceLoopTarget,
} from '@/edit/pick/raycaster_component_face_loops.js';

/** Content mesh with a bound MeshDocument for Edit Mode face pick. */
export interface ComponentMeshDocumentFaceCandidate {
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/** Result of a mesh-document face pick in Edit Mode. */
export type ComponentMeshDocumentFacePickResult = ComponentFaceLoopPickResult;

/**
 * Picks the closest front-facing MeshDocument face under the pointer.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Element used for NDC conversion.
 * @param candidates Domain mesh document candidates.
 * @returns Closest face pick, or null.
 */
export function pickComponentMeshDocumentFace(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidates: readonly ComponentMeshDocumentFaceCandidate[],
): ComponentMeshDocumentFacePickResult | null {
  return pickComponentFaceLoops(event, camera, pickElement, buildMeshDocumentFaceLoopTargets(candidates));
}

/**
 * Builds face-loop targets from mesh document candidates.
 *
 * @param candidates Domain mesh document candidates.
 * @returns Face-loop targets for pick.
 */
function buildMeshDocumentFaceLoopTargets(
  candidates: readonly ComponentMeshDocumentFaceCandidate[],
): ComponentFaceLoopTarget[] {
  const targets: ComponentFaceLoopTarget[] = [];
  for (const candidate of candidates) {
    targets.push(buildOneMeshDocumentFaceLoopTarget(candidate));
  }
  return targets;
}

/**
 * Builds one face-loop target from a mesh document candidate.
 *
 * @param candidate Mesh document candidate.
 * @returns Face-loop target.
 */
function buildOneMeshDocumentFaceLoopTarget(candidate: ComponentMeshDocumentFaceCandidate): ComponentFaceLoopTarget {
  candidate.mesh.updateMatrixWorld(true);
  return {
    targetId: candidate.targetId,
    faces: collectMeshDocumentWorldFaceLoops(candidate.document, candidate.mesh.matrixWorld),
  };
}

/**
 * Collects world-space face loops for every MeshDocument face.
 *
 * @param document Mesh document.
 * @param matrixWorld Mesh world matrix.
 * @returns Face loops in document face order.
 */
function collectMeshDocumentWorldFaceLoops(
  document: MeshDocument,
  matrixWorld: THREE.Matrix4,
): Array<{ faceIndex: number; worldLoop: THREE.Vector3[] }> {
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  const faces: Array<{ faceIndex: number; worldLoop: THREE.Vector3[] }> = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faces.push({
      faceIndex,
      worldLoop: collectOneMeshDocumentWorldFaceLoop(document, faceIndex, matrixWorld),
    });
  }
  return faces;
}

/**
 * Collects the world-space corner loop for one MeshDocument face.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param matrixWorld Mesh world matrix.
 * @returns Ordered world corners.
 */
function collectOneMeshDocumentWorldFaceLoop(
  document: MeshDocument,
  faceIndex: number,
  matrixWorld: THREE.Matrix4,
): THREE.Vector3[] {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const loop: THREE.Vector3[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    meshVertexPositionRead(positions, vertexIndex, scratch);
    loop.push(new THREE.Vector3(scratch[0], scratch[1], scratch[2]).applyMatrix4(matrixWorld));
  }
  return loop;
}
