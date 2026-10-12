import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from '@/mesh/convert/mesh_document_face_triangle_map.js';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { raycastMeshBvhFrontFacing } from './edit_component_bvh_ray.js';
import type { ComponentFaceLoopPickResult } from '@/edit/pick/raycaster_component_face_loops.js';

/** Content mesh with a bound MeshDocument for Edit Mode face pick. */
export interface ComponentMeshDocumentFaceCandidate {
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/** Result of a mesh-document face pick in Edit Mode. */
export type ComponentMeshDocumentFacePickResult = ComponentFaceLoopPickResult;

const scratchRaycaster = new THREE.Raycaster();

/**
 * Picks the closest front-facing MeshDocument face under the pointer. Uses the
 * display mesh triangle BVH, then maps the hit triangle back to the document
 * face.
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
  if (candidates.length === 0) {
    return null;
  }
  camera.updateMatrixWorld(true);
  const ray = scratchRaycaster;
  ray.setFromCamera(pointerEventToNdc(event, pickElement), camera);
  return pickClosestDocumentFace(candidates, ray.ray);
}

/**
 * Keeps the closest document face across candidates.
 *
 * @param candidates Mesh candidates.
 * @param ray World pick ray.
 * @returns Closest face, or null.
 */
function pickClosestDocumentFace(
  candidates: readonly ComponentMeshDocumentFaceCandidate[],
  ray: THREE.Ray,
): ComponentMeshDocumentFacePickResult | null {
  let best: ComponentMeshDocumentFacePickResult | null = null;
  for (const candidate of candidates) {
    const hit = pickOneDocumentFace(candidate, ray, best?.distance ?? Infinity);
    if (hit) {
      best = hit;
    }
  }
  return best;
}

/**
 * Raycasts one display mesh and maps the triangle onto a document face.
 *
 * @param candidate Mesh candidate.
 * @param ray World pick ray.
 * @param maxDistance Current closest distance.
 * @returns Face pick, or null.
 */
function pickOneDocumentFace(
  candidate: ComponentMeshDocumentFaceCandidate,
  ray: THREE.Ray,
  maxDistance: number,
): ComponentMeshDocumentFacePickResult | null {
  const hit = raycastMeshBvhFrontFacing(candidate.mesh, ray.origin, ray.direction, maxDistance);
  if (!hit) {
    return null;
  }
  const faceIndex = meshDocumentFaceIndexFromDisplayTriangle(candidate.document, hit.triangleIndex);
  if (faceIndex === null) {
    return null;
  }
  return {
    targetId: candidate.targetId,
    faceIndex,
    hitPoint: hit.point,
    distance: hit.distance,
  };
}
