import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../../types/bounds_face.js';
import { GizmoHandle } from '../gizmo/gizmo_handle.js';
import { TransformGizmo } from '../gizmo/transform_gizmo.js';
import { GizmoRaycaster } from '../gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '../transform_executor.js';
import { BoundsFacePicker } from './bounds_face_picker.js';
import {
  computeOneSidedMeshResize,
  computeOneSidedMultiMeshResize,
  snapBoundsFaceDelta,
} from './bounds_resize_math.js';
import { OrientedBoundsData } from './oriented_bounds.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import { TransformDragSession } from '../transform_drag_session.js';
import { TransformProjectionMath } from '../transform_projection_math.js';
import type { CadViewPlane } from '../../rulers/cad_view_plane.js';
import { BOUNDS_DEFAULT_CURSOR, BOUNDS_MOVE_CURSOR, resolveBoundsResizeCursor } from './bounds_resize_cursor.js';
import { pickOrthographicSilhouetteEdgeFace } from './bounds_face_interaction.js';
import { computeSilhouetteExteriorBandWorld } from './bounds_handle_screen_size.js';

/**
 * Bounds tool interaction: one-sided resize from 3D arrows, 2D ears, or
 * exterior silhouette edges; face interior moves the selection. Hover outlines
 * the active side (orange resize, white body-move in 3D). Dual-arrow CSS
 * cursors follow the pull direction; body hover keeps the default pointer.
 */
export class BoundsDragController {
  private session: TransformDragSession;
  private transformGizmo: TransformGizmo;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private boundsFacePicker: BoundsFacePicker;
  private textureLock: TextureLockSettings | null;

  /**
   * Creates a bounds drag controller bound to a shared drag session.
   *
   * @param session Shared drag session state.
   * @param transformGizmo The gizmo orchestrator.
   * @param gizmoRaycaster Raycaster for handles and plane projection.
   * @param transformExecutor Executor for absolute translation and snap.
   */
  constructor(
    session: TransformDragSession,
    transformGizmo: TransformGizmo,
    gizmoRaycaster: GizmoRaycaster,
    transformExecutor: TransformExecutor,
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.gizmoRaycaster = gizmoRaycaster;
    this.transformExecutor = transformExecutor;
    this.boundsFacePicker = new BoundsFacePicker();
    this.textureLock = null;
  }

  /**
   * Sets texture lock settings used when resizing meshes.
   *
   * @param settings Shared texture lock settings, or null to disable rebake.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Starts Bounds interaction: ear handle, then full 2D silhouette edge, then
   * face-plane move.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles Current gizmo handles.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane for 2D edge picking.
   */
  beginPointerDown(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane = 'xyz',
  ): void {
    if (this.tryBeginResizeFromHandle(camera, pickElement, event, handles, selectedObjects, pivot, gizmoGroup)) {
      return;
    }
    if (this.tryBeginResizeFromSilhouetteEdge(camera, pickElement, event, handles, selectedObjects, pivot, viewPlane)) {
      return;
    }
    this.tryBeginFaceMove(camera, pickElement, event, selectedObjects, pivot, gizmoGroup);
  }

  /**
   * Highlights the resize side under the pointer and sets the dual-arrow resize
   * cursor. Face interiors keep the regular pointer (no four-way drag cursor).
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC (also receives cursor style).
   * @param event The pointer event.
   * @param handles Current gizmo handles.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane for orthographic cursor mapping.
   */
  updateFaceHoverHighlight(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane = 'xyz',
  ): void {
    if (this.session.dragActive) return;
    const resizeFace = this.resolveHoverResizeFace(camera, pickElement, event, handles, gizmoGroup, viewPlane);
    if (resizeFace) {
      this.transformGizmo.setHighlightedBoundsFace(resizeFace, 'resize');
    } else if (viewPlane === 'xyz') {
      const movePick = this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup);
      this.transformGizmo.setHighlightedBoundsFace(movePick?.face ?? null, 'move');
    } else {
      this.transformGizmo.setHighlightedBoundsFace(null);
    }
    this.applyHoverCursor(camera, pickElement, event, gizmoGroup, resizeFace, viewPlane);
  }

  /**
   * Resolves which face (if any) should show resize hover: ear handle first,
   * then fat 2D silhouette edge band.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target.
   * @param event The pointer event.
   * @param handles Current gizmo handles.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane.
   * @returns Face under resize hover, or null.
   */
  private resolveHoverResizeFace(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane,
  ): BoundsFace | null {
    const picked = this.gizmoRaycaster.pickHandle(handles, camera, pickElement, event, gizmoGroup);
    if (picked) return this.readBoundsFaceFromHandle(picked);
    return this.pickSilhouetteEdgeFace(camera, pickElement, event, viewPlane);
  }

  /**
   * Sets the CSS cursor for handle/edge resize, face body hover, or default.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target.
   * @param event The pointer event.
   * @param gizmoGroup Viewport gizmo group.
   * @param resizeFace Face under a handle or edge, or null.
   * @param viewPlane Active pane view plane.
   */
  private applyHoverCursor(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    gizmoGroup: THREE.Group,
    resizeFace: BoundsFace | null,
    viewPlane: CadViewPlane,
  ): void {
    const style = pickElement.style;
    if (!style) return;
    if (resizeFace) {
      const bounds = this.transformGizmo.getCurrentBounds();
      style.cursor = bounds ? resolveBoundsResizeCursor(resizeFace, bounds, camera, viewPlane) : BOUNDS_DEFAULT_CURSOR;
      return;
    }
    const facePick = this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup);
    style.cursor = facePick ? BOUNDS_MOVE_CURSOR : BOUNDS_DEFAULT_CURSOR;
  }

  /**
   * Dispatches move or resize drag updates after the click threshold for face
   * move, or immediately for handle resize.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  handleMove(camera: THREE.Camera, pickElement: HTMLElement, event: MouseEvent, objects: THREE.Mesh[]): void {
    if (this.session.isBoundsFaceMove) {
      if (!this.session.boundsPointerMoved) return;
      this.handleFaceTranslate(camera, pickElement, event, objects);
      return;
    }
    if (this.session.isBoundsResize) {
      this.handleResize(camera, pickElement, event, objects);
    }
  }

  /**
   * Starts a one-sided bounds resize when a mid-face handle is hit.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles Current handles.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   * @returns True when a resize drag was started.
   */
  private tryBeginResizeFromHandle(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group,
  ): boolean {
    const picked = this.gizmoRaycaster.pickHandle(handles, camera, pickElement, event, gizmoGroup);
    if (!picked) return false;
    const face = this.readBoundsFaceFromHandle(picked);
    if (!face) return false;
    const bounds = this.transformGizmo.getCurrentBounds();
    if (!bounds) return false;
    this.beginResizeSession(camera, pickElement, event, selectedObjects, pivot, bounds, face, picked);
    return true;
  }

  /**
   * Starts a one-sided resize when the pointer is near a full 2D silhouette
   * edge (fat invisible band along the whole side, not only the ear visual).
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles Current handles (used to bind an optional matching ear).
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param viewPlane Active orthographic plane.
   * @returns True when a resize drag was started.
   */
  private tryBeginResizeFromSilhouetteEdge(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    viewPlane: CadViewPlane,
  ): boolean {
    const face = this.pickSilhouetteEdgeFace(camera, pickElement, event, viewPlane);
    if (!face) return false;
    const bounds = this.transformGizmo.getCurrentBounds();
    if (!bounds) return false;
    const handle = this.findHandleForFace(handles, face);
    this.beginResizeSession(camera, pickElement, event, selectedObjects, pivot, bounds, face, handle);
    return true;
  }

  /**
   * Picks a silhouette edge face under the pointer in an orthographic pane.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target.
   * @param event The pointer event.
   * @param viewPlane Active view plane.
   * @returns Bounds face for the nearest edge, or null.
   */
  private pickSilhouetteEdgeFace(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    viewPlane: CadViewPlane,
  ): BoundsFace | null {
    if (viewPlane === 'xyz') return null;
    const bounds = this.transformGizmo.getCurrentBounds();
    if (!bounds) return null;
    const plane = TransformProjectionMath.buildCameraPlane(camera, bounds.center);
    const worldPoint = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    if (!worldPoint) return null;
    const viewportHeight = Math.max(1, pickElement.clientHeight || pickElement.offsetHeight || 512);
    const exteriorBand = computeSilhouetteExteriorBandWorld(camera, viewportHeight);
    return pickOrthographicSilhouetteEdgeFace(worldPoint, bounds, viewPlane, exteriorBand);
  }

  /**
   * Finds the resize handle that owns a bounds face, when present.
   *
   * @param handles Active gizmo handles.
   * @param face Target bounds face.
   * @returns Matching handle, or null.
   */
  private findHandleForFace(handles: GizmoHandle[], face: BoundsFace): GizmoHandle | null {
    for (const handle of handles) {
      if (this.readBoundsFaceFromHandle(handle) === face) return handle;
    }
    return null;
  }

  /**
   * Starts a face-plane translation when a bounds face interior is hit.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   * @returns True when a move drag was started.
   */
  private tryBeginFaceMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group,
  ): boolean {
    const pick = this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup);
    if (!pick) return false;
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.isBoundsFaceMove = true;
    this.session.isBoundsResize = false;
    this.session.activeHandle = null;
    this.session.activeBoundsFace = pick.face;
    this.session.boundsMovePlane.setFromNormalAndCoplanarPoint(pick.normal, pick.point);
    this.session.dragCamera = camera;
    this.session.dragRenderer = pickElement;
    this.session.initialMousePosition = pick.point.clone();
    this.session.pointerDownClientX = event.clientX;
    this.session.pointerDownClientY = event.clientY;
    this.session.boundsPointerMoved = false;
    this.transformGizmo.setHighlightedBoundsFace(null);
    this.transformGizmo.setBoundsGuideLinesVisible(true);
    return true;
  }

  /**
   * Captures session state and starts a one-sided resize along a bounds face.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param bounds Bounds at drag start.
   * @param face Face being resized.
   * @param handle Picked resize handle, or null when resizing via silhouette
   *   edge.
   */
  private beginResizeSession(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    bounds: OrientedBoundsData,
    face: BoundsFace,
    handle: GizmoHandle | null,
  ): void {
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.isBoundsResize = true;
    this.session.isBoundsFaceMove = false;
    this.session.activeHandle = handle;
    this.session.activeBoundsFace = face;
    this.session.startBounds = this.cloneBounds(bounds);
    this.session.dragCamera = camera;
    this.session.dragRenderer = pickElement;
    this.session.pointerDownClientX = event.clientX;
    this.session.pointerDownClientY = event.clientY;
    this.session.boundsPointerMoved = true;
    this.transformGizmo.setActiveHandle(handle);
    this.transformGizmo.setHighlightedBoundsFace(face);
    this.captureResizeStart(camera, pickElement, event, bounds, face);
    this.transformGizmo.setBoundsGuideLinesVisible(true);
  }

  /**
   * Translates selection on the picked bounds face plane (grid-snapped).
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  private handleFaceTranslate(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    objects: THREE.Mesh[],
  ): void {
    if (!this.session.initialMousePosition) return;
    const current = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, this.session.boundsMovePlane);
    if (!current) return;
    const totalDelta = current.clone().sub(this.session.initialMousePosition);
    this.session.dragDeltaAccumulator.copy(totalDelta);
    this.transformExecutor.applyAbsoluteTranslation(objects, this.session.initialPositions, totalDelta);
    this.rebakeLockedTextures(objects, true, false);
  }

  /**
   * Applies one-sided resize along the active bounds face normal with snap.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  private handleResize(camera: THREE.Camera, pickElement: HTMLElement, event: MouseEvent, objects: THREE.Mesh[]): void {
    if (!this.session.initialMousePosition || !this.session.activeBoundsFace || !this.session.startBounds) {
      return;
    }
    const plane = TransformProjectionMath.buildCameraPlane(camera, this.session.initialMousePosition);
    const current = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    if (!current) return;
    const outward = this.getActiveFaceWorldNormal();
    const rawDelta = current.clone().sub(this.session.initialMousePosition).dot(outward);
    const snappedDelta = this.snapResizeDelta(rawDelta, outward);
    this.session.boundsDeltaAlongNormal = snappedDelta;
    this.applyResizeToObjects(objects, snappedDelta);
  }

  /**
   * Snaps a face displacement when grid snap is enabled.
   *
   * @param rawDelta Unsnapped delta along the face normal.
   * @param outward Face outward normal.
   * @returns Snapped or raw delta.
   */
  private snapResizeDelta(rawDelta: number, outward: THREE.Vector3): number {
    const gridSnap = this.transformExecutor.getGridSnap();
    return snapBoundsFaceDelta(
      rawDelta,
      gridSnap.isEnabled(),
      gridSnap.getInterval(),
      this.getActiveFaceStartCoordinate(outward),
    );
  }

  /**
   * Projects the active face center at drag start onto its outward normal.
   *
   * @param outward Unit outward normal for the active face.
   * @returns Scalar face coordinate along the normal, or 0 when unavailable.
   */
  private getActiveFaceStartCoordinate(outward: THREE.Vector3): number {
    if (!this.session.startBounds || !this.session.activeBoundsFace) return 0;
    const half = this.getFaceHalfExtent(this.session.startBounds, this.session.activeBoundsFace);
    const faceCenter = this.session.startBounds.center.clone().addScaledVector(outward, half);
    return faceCenter.dot(outward);
  }

  /**
   * Returns the half-extent along the axis of a bounds face.
   *
   * @param bounds Oriented bounds at drag start.
   * @param face The face being resized.
   * @returns Half-extent along that face's axis.
   */
  private getFaceHalfExtent(bounds: OrientedBoundsData, face: BoundsFace): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) return bounds.halfExtents.x;
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) return bounds.halfExtents.y;
    return bounds.halfExtents.z;
  }

  /**
   * Writes absolute one-sided resize results onto all selected objects.
   *
   * @param objects Selected meshes.
   * @param deltaAlongNormal Snapped face displacement.
   */
  private applyResizeToObjects(objects: THREE.Mesh[], deltaAlongNormal: number): void {
    if (!this.session.activeBoundsFace || !this.session.startBounds) return;
    const multi = objects.length > 1;
    objects.forEach((mesh) => {
      const startPos = this.session.initialPositions.get(mesh);
      const startScale = this.session.initialScales.get(mesh);
      if (!startPos || !startScale) return;
      const result = multi
        ? computeOneSidedMultiMeshResize(
            startPos,
            startScale,
            this.session.startBounds!,
            this.session.activeBoundsFace!,
            deltaAlongNormal,
          )
        : computeOneSidedMeshResize(
            startPos,
            startScale,
            this.session.startBounds!,
            this.session.activeBoundsFace!,
            deltaAlongNormal,
          );
      mesh.position.copy(result.position);
      mesh.scale.copy(result.scale);
    });
    this.rebakeLockedTextures(objects, true, true);
  }

  /**
   * Applies content texture-lock policy after a transform.
   *
   * @param objects Meshes that just transformed.
   * @param moved True when translation or rotation changed.
   * @param scaled True when scale changed.
   */
  rebakeLockedTextures(objects: THREE.Mesh[], moved: boolean = true, scaled: boolean = true): void {
    if (!this.textureLock) return;
    this.textureLock.applyContentTransformPolicy(objects, moved, scaled);
  }

  /**
   * Reads the bounds face id stored on a handle mesh.
   *
   * @param handle The gizmo handle.
   * @returns Bounds face, or null.
   */
  private readBoundsFaceFromHandle(handle: GizmoHandle): BoundsFace | null {
    const face = handle.getVisualMesh().userData[BOUNDS_FACE_USERDATA_KEY];
    if (typeof face !== 'string') return null;
    return face as BoundsFace;
  }

  /**
   * Stores the initial mouse sample for a bounds resize drag.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param bounds Bounds at drag start.
   * @param face The face being resized.
   */
  private captureResizeStart(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    bounds: OrientedBoundsData,
    face: BoundsFace,
  ): void {
    const outward = this.computeFaceWorldNormal(bounds, face);
    const half = this.getFaceHalfExtent(bounds, face);
    const faceCenter = bounds.center.clone().addScaledVector(outward, half);
    const plane = TransformProjectionMath.buildCameraPlane(camera, faceCenter);
    this.session.initialMousePosition = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
  }

  /**
   * Returns the outward world normal for the active bounds face.
   *
   * @returns Normalized world normal.
   */
  private getActiveFaceWorldNormal(): THREE.Vector3 {
    if (!this.session.startBounds || !this.session.activeBoundsFace) {
      return new THREE.Vector3(1, 0, 0);
    }
    return this.computeFaceWorldNormal(this.session.startBounds, this.session.activeBoundsFace);
  }

  /**
   * Computes a face outward normal in world space.
   *
   * @param bounds Oriented bounds.
   * @param face Face identifier.
   * @returns Normalized world normal.
   */
  private computeFaceWorldNormal(bounds: OrientedBoundsData, face: BoundsFace): THREE.Vector3 {
    const local = new THREE.Vector3();
    if (face === BoundsFace.POS_X) local.set(1, 0, 0);
    else if (face === BoundsFace.NEG_X) local.set(-1, 0, 0);
    else if (face === BoundsFace.POS_Y) local.set(0, 1, 0);
    else if (face === BoundsFace.NEG_Y) local.set(0, -1, 0);
    else if (face === BoundsFace.POS_Z) local.set(0, 0, 1);
    else local.set(0, 0, -1);
    return local.applyQuaternion(bounds.quaternion).normalize();
  }

  /**
   * Clones oriented bounds data.
   *
   * @param bounds Source bounds.
   * @returns Independent copy.
   */
  private cloneBounds(bounds: OrientedBoundsData): OrientedBoundsData {
    return {
      center: bounds.center.clone(),
      quaternion: bounds.quaternion.clone(),
      halfExtents: bounds.halfExtents.clone(),
    };
  }
}
