import * as THREE from 'three';
import type { GizmoAxis } from '@/types/transform_mode.js';
import type { ComponentTransformVertex } from '@/edit/transform/component_transform_vertex.js';
import { snapVertexElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapHit } from '@/snap/hit/snap_hit.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import { SnapQueryService } from '@/snap/query/snap_query_service.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { PreviewSnapMarker } from '@/snap/preview/preview_snap_marker.js';
import { holdSnapTarget } from '@/snap/session/snap_drag_hold.js';
import { resolveGeometryTranslationDelta } from '@/snap/session/snap_session_translate.js';
import {
  clientPointToElementPixels,
  elementPixelSize,
  lockComponentSnapSourcePoint,
  lockObjectSnapSourcePoint,
} from '@/snap/session/snap_source_lock.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

/** Pointer sample used to resolve a translation snap. */
export interface SnapTranslationSample {
  camera: THREE.Camera;
  pickElement: HTMLElement;
  clientX: number;
  clientY: number;
  modalAxis: TransformModalAxis;
  handleAxis: GizmoAxis | null;
  handleOrientation: THREE.Quaternion;
  keyboardOrientation: THREE.Quaternion;
}

/**
 * Owns geometry snap during object and edit translation drags. The last target
 * is kept when a later sample misses it and the pointer is still in range.
 */
export class SnapDragController {
  private readonly policy: SnapPolicy;
  private readonly query: SnapQueryService;
  private readonly gridSnap: GridSnap;
  private readonly getWorldRoot: () => THREE.Object3D;
  private readonly getPreviewParent: () => THREE.Object3D | null;
  private readonly marker: PreviewSnapMarker;
  private sourcePoint: THREE.Vector3 | null;
  private readonly excludedRootIds: Set<string>;
  private readonly excludedElementIds: Set<string>;
  private heldHit: SnapHit | null;
  private active: boolean;

  /**
   * Creates a drag snap controller.
   *
   * @param policy Shared geometry-kind policy.
   * @param gridSnap Increment snap. Its enabled flag is the master switch.
   * @param getWorldRoot Scene hierarchy that can be snapped to.
   * @param getPreviewParent Parent for the snap marker, outside the saved
   *   world.
   */
  constructor(
    policy: SnapPolicy,
    gridSnap: GridSnap,
    getWorldRoot: () => THREE.Object3D,
    getPreviewParent: () => THREE.Object3D | null,
  ) {
    this.policy = policy;
    this.query = new SnapQueryService();
    this.gridSnap = gridSnap;
    this.getWorldRoot = getWorldRoot;
    this.getPreviewParent = getPreviewParent;
    this.marker = new PreviewSnapMarker();
    this.sourcePoint = null;
    this.excludedRootIds = new Set();
    this.excludedElementIds = new Set();
    this.heldHit = null;
    this.active = false;
  }

  /**
   * Returns the shared policy the toolbar toggles write.
   *
   * @returns Snap policy.
   */
  getPolicy(): SnapPolicy {
    return this.policy;
  }

  /**
   * Locks an object-mode source point and excludes the moving roots.
   *
   * @param objects Transform roots being moved.
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  beginObjectTranslation(
    objects: readonly THREE.Object3D[],
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    this.clearExclusions();
    for (const object of objects) {
      this.excludedRootIds.add(object.uuid);
    }
    this.sourcePoint = lockObjectSnapSourcePoint(objects, camera, pickElement, clientX, clientY);
    this.active = true;
  }

  /**
   * Locks an edit-mode source point and excludes the selected vertices.
   *
   * @param vertices Selected component vertices.
   * @param camera Camera.
   * @param pickElement Viewport element.
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  beginComponentTranslation(
    vertices: readonly ComponentTransformVertex[],
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): void {
    this.clearExclusions();
    for (const vertex of vertices) {
      this.excludedElementIds.add(componentVertexElementId(vertex));
    }
    this.sourcePoint = lockComponentSnapSourcePoint(vertices, camera, pickElement, clientX, clientY);
    this.active = true;
  }

  /**
   * Returns a geometry delta for this sample, or null so increment snap runs.
   *
   * @param sample Pointer and constraint for this drag sample.
   * @returns Constrained world delta, or null.
   */
  resolveTranslation(sample: SnapTranslationSample): THREE.Vector3 | null {
    if (!this.active) {
      return null;
    }
    this.policy.setMasterEnabled(this.gridSnap.isEnabled());
    this.policy.setShiftHeld(false);
    const hit = this.holdFreshHit(this.queryHit(sample), sample);
    this.updateMarker(hit, sample);
    return resolveGeometryTranslationDelta(
      this.sourcePoint,
      hit,
      sample.modalAxis,
      sample.handleAxis,
      sample.handleOrientation,
      sample.keyboardOrientation,
    );
  }

  /** Hides the marker and clears the locked source. */
  endTranslation(): void {
    this.active = false;
    this.sourcePoint = null;
    this.clearExclusions();
    this.marker.hide();
  }

  /** Releases the marker. */
  dispose(): void {
    this.endTranslation();
    this.marker.dispose();
  }

  /**
   * Queries a hit under the sample pointer.
   *
   * @param sample Pointer sample.
   * @returns Winning hit, or null.
   */
  private queryHit(sample: SnapTranslationSample): ReturnType<SnapQueryService['query']> {
    const previewParent = this.getPreviewParent();
    if (previewParent) {
      this.marker.attach(previewParent);
    }
    return this.query.query(this.buildRequest(sample));
  }

  /**
   * Shows or hides the marker for the current hit.
   *
   * @param hit Winning hit, or null.
   * @param sample Pointer sample.
   */
  private updateMarker(hit: ReturnType<SnapQueryService['query']>, sample: SnapTranslationSample): void {
    if (!hit) {
      this.marker.hide();
      return;
    }
    const size = elementPixelSize(sample.pickElement);
    this.marker.show(hit, sample.camera, size.y);
  }

  /**
   * Builds a query from the pointer sample.
   *
   * @param sample Pointer sample.
   * @returns Query request.
   */
  private buildRequest(sample: SnapTranslationSample): SnapQueryRequest {
    const pointer = clientPointToElementPixels(sample.pickElement, sample.clientX, sample.clientY);
    const size = elementPixelSize(sample.pickElement);
    const ray = rayFromPointer(sample.camera, pointer, size);
    return {
      policy: this.policy,
      camera: sample.camera,
      pointerPixels: pointer,
      viewportWidth: size.x,
      viewportHeight: size.y,
      rayOrigin: ray.origin,
      rayDirection: ray.direction,
      worldRoot: this.getWorldRoot(),
      excludedRootIds: this.excludedRootIds,
      excludedElementIds: this.excludedElementIds,
    };
  }

  /**
   * Keeps the fresh hit, or the previous one when the pointer is still in
   * range.
   *
   * @param fresh Hit from the live query, or null.
   * @param sample Pointer sample.
   * @returns Hit to apply, or null.
   */
  private holdFreshHit(fresh: SnapHit | null, sample: SnapTranslationSample): SnapHit | null {
    if (!this.policy.isGeometrySnapActive()) {
      this.heldHit = null;
      return null;
    }
    const pointer = clientPointToElementPixels(sample.pickElement, sample.clientX, sample.clientY);
    const size = elementPixelSize(sample.pickElement);
    this.heldHit = holdSnapTarget(
      fresh,
      this.heldHit,
      sample.camera,
      pointer,
      size.x,
      size.y,
      this.policy.getScreenRadiusPixels(),
    );
    return this.heldHit;
  }

  /** Clears root exclusions, element exclusions, and the held target. */
  private clearExclusions(): void {
    this.excludedRootIds.clear();
    this.excludedElementIds.clear();
    this.heldHit = null;
  }
}

/**
 * Element id for a component vertex, matching the snap sources.
 *
 * @param vertex Component vertex.
 * @returns Element id.
 */
function componentVertexElementId(vertex: ComponentTransformVertex): string {
  if (vertex.kind === 'brush') {
    return snapVertexElementId(vertex.brushId, vertex.vertexIndex);
  }
  return snapVertexElementId(vertex.mesh.uuid, vertex.vertexIndex);
}

/**
 * Builds a world ray through a pixel.
 *
 * @param camera Camera.
 * @param pointerPixels Pointer in element pixels.
 * @param size Element size.
 * @returns Ray origin and direction.
 */
function rayFromPointer(
  camera: THREE.Camera,
  pointerPixels: THREE.Vector2,
  size: THREE.Vector2,
): { origin: THREE.Vector3; direction: THREE.Vector3 } {
  const ndc = new THREE.Vector2((pointerPixels.x / size.x) * 2 - 1, -(pointerPixels.y / size.y) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
}
