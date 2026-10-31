import * as THREE from 'three';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';
import { createSnapHit } from '@/snap/hit/snap_hit.js';
import { snapFaceElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { appendBrushEdgeHits, appendBrushVertexHits } from './snap_brush_cage_hits.js';
import { meshBoundsNearSnapRay } from './snap_mesh_bounds.js';
import { SnapTargetSource } from './snap_target_source.js';

/** Snap source for convex brush cages. Compiled result triangles are ignored. */
export class SnapTargetSourceBrush extends SnapTargetSource {
  private readonly faceRaycaster: RaycasterFaceSelection;

  /** Creates a brush snap source. */
  constructor() {
    super();
    this.faceRaycaster = new RaycasterFaceSelection();
  }

  /**
   * Appends cage vertex, edge, and face hits for a brush preview mesh.
   *
   * @param object Scene object.
   * @param request Active query.
   * @param output Hit list.
   */
  collectObject(object: THREE.Object3D, request: SnapQueryRequest, output: SnapHit[]): void {
    if (!(object instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(object)) {
      return;
    }
    const cage = resolveBrushCage(object);
    if (!cage) {
      return;
    }
    object.updateMatrixWorld(true);
    if (!meshBoundsNearSnapRay(object, request)) {
      return;
    }
    appendBrushVertexHits(cage.brush, object.matrixWorld, cage.rootId, cage.brushId, request, output);
    appendBrushEdgeHits(cage.brush, object.matrixWorld, cage.rootId, cage.brushId, request, output);
    appendBrushFaceHit(this.faceRaycaster, object, cage.rootId, cage.brushId, request, output);
  }
}

/** Resolved brush cage and the ids stored on its hits. */
interface BrushCageRef {
  brush: SolidBrush;
  rootId: string;
  brushId: string;
}

/**
 * Finds the brush cage for a preview mesh.
 *
 * @param mesh Brush preview mesh.
 * @returns Cage reference, or null when the mesh is not attached to a solid.
 */
function resolveBrushCage(mesh: THREE.Mesh): BrushCageRef | null {
  const model = SolidModel.fromObject(mesh);
  const brushId = SolidBrushVisual.getBrushId(mesh);
  if (!model || !brushId) {
    return null;
  }
  const instance = model.getBrushes().find((brush) => brush.id === brushId);
  if (!instance || !instance.visible) {
    return null;
  }
  return { brush: instance.brush, rootId: model.root.uuid, brushId };
}

/**
 * Appends a face hit on the brush preview.
 *
 * @param mesh Brush preview mesh.
 * @param rootId Transform root id.
 * @param brushId Brush id.
 * @param request Active query.
 * @param output Hit list.
 */
function appendBrushFaceHit(
  faceRaycaster: RaycasterFaceSelection,
  mesh: THREE.Mesh,
  rootId: string,
  brushId: string,
  request: SnapQueryRequest,
  output: SnapHit[],
): void {
  if (!request.policy.allowsKind('face')) {
    return;
  }
  const face = faceRaycaster.pickFrontFaceFromRay(mesh, request.rayOrigin, request.rayDirection);
  if (!face) {
    return;
  }
  output.push(
    createSnapHit(
      face.hitPoint,
      face.faceNormal,
      'face',
      rootId,
      snapFaceElementId(brushId, face.faceIndex),
      0,
      null,
      null,
    ),
  );
}
