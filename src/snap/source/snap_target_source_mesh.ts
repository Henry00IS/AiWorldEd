import * as THREE from 'three';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { snapFaceElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { meshBoundsNearSnapRay } from './snap_mesh_bounds.js';
import { appendMeshEdgeHits, appendMeshVertexHits, limitedTriangleForMesh } from './snap_mesh_point_hits.js';
import { SnapTargetSource } from './snap_target_source.js';

/**
 * Snap source for content meshes. Brush cages and compiled solid results are
 * left to the brush source, or skipped, so a boolean rebuild cannot move the
 * authored corners.
 */
export class SnapTargetSourceMesh extends SnapTargetSource {
  private readonly faceRaycaster: RaycasterFaceSelection;

  /** Creates a mesh snap source. */
  constructor() {
    super();
    this.faceRaycaster = new RaycasterFaceSelection();
  }

  /**
   * Appends vertex, edge, and face hits for a content mesh.
   *
   * @param object Scene object.
   * @param request Active query.
   * @param output Hit list.
   */
  collectObject(object: THREE.Object3D, request: SnapQueryRequest, output: SnapHit[]): void {
    if (!(object instanceof THREE.Mesh) || !this.acceptsContentMesh(object)) {
      return;
    }
    object.updateMatrixWorld(true);
    if (!meshBoundsNearSnapRay(object, request)) {
      return;
    }
    const faceIndex = this.appendFaceHit(object, request, output);
    const limitedTriangle = limitedTriangleForMesh(object, faceIndex);
    appendMeshVertexHits(object, request, output, limitedTriangle);
    appendMeshEdgeHits(object, request, output, limitedTriangle);
  }

  /**
   * Returns whether this source should read the mesh.
   *
   * @param mesh Candidate mesh.
   * @returns True for ordinary content meshes.
   */
  private acceptsContentMesh(mesh: THREE.Mesh): boolean {
    if (SolidBrushVisual.isBrushObject(mesh) || isResultMesh(mesh)) {
      return false;
    }
    return !SolidBrushVisual.shouldSkipFacePick(mesh);
  }

  /**
   * Appends a face hit when the pointer ray meets a front face.
   *
   * @param mesh Mesh to test.
   * @param request Active query.
   * @param output Hit list.
   * @returns Triangle index of the hit, or null.
   */
  private appendFaceHit(mesh: THREE.Mesh, request: SnapQueryRequest, output: SnapHit[]): number | null {
    const face = this.faceRaycaster.pickFrontFaceFromRay(mesh, request.rayOrigin, request.rayDirection);
    if (!face) {
      return null;
    }
    if (request.policy.allowsKind('face')) {
      output.push(faceHit(mesh.uuid, face.faceIndex, face.hitPoint, face.faceNormal));
    }
    return face.faceIndex;
  }
}

/**
 * Builds a face snap hit on a mesh.
 *
 * @param ownerId Mesh uuid.
 * @param faceIndex Triangle index.
 * @param point World hit point.
 * @param normal World face normal.
 * @returns Snap hit.
 */
function faceHit(ownerId: string, faceIndex: number, point: THREE.Vector3, normal: THREE.Vector3): SnapHit {
  return createSnapHit(point, normal, 'face', ownerId, snapFaceElementId(ownerId, faceIndex), 0, null, null);
}
