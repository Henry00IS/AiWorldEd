import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '@/types/bounds_face.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { BoundsFacePicker } from './bounds_face_picker.js';
import {
  computeOneSidedMeshResize,
  computeOneSidedMultiMeshResize,
  resolveAppliedBoundsFaceDelta,
  resolveMinimumBoundsHalfExtent,
  snapBoundsFaceDelta,
} from './bounds_resize_math.js';
import { cloneOrientedBounds, DataOrientedBounds } from './builder_oriented_bounds.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { TransformDragSession } from '@/transform/core/session_transform_drag.js';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';
import type { CadViewPlane } from '@/rulers/view/cad_view_plane.js';
import { BOUNDS_DEFAULT_CURSOR, BOUNDS_MOVE_CURSOR, resolveBoundsResizeCursor } from './bounds_resize_cursor.js';
import { pickOrthographicSilhouetteEdgeFace } from './bounds_face_interaction.js';
import { computeSilhouetteExteriorBandWorld } from './bounds_handle_screen_size.js';
import { managerMouseCursor } from '@/input/manager_mouse_cursor.js';
import { TransformMode } from '@/types/transform_mode.js';
import { transformModalConstrainTranslationDelta } from '@/transform/modal/transform_modal_delta_constrain.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';

/**
 * Bounds tool interaction: one-sided resize from 3D arrows, 2D ears, or
 * exterior silhouette edges; face interior moves the selection. Hover outlines
 * the active side (orange resize, white body-move in 3D). Dual-arrow CSS
 * cursors follow the pull direction; body hover keeps the default pointer.
 */
export class ControllerBoundsDrag {
  private session: TransformDragSession;
  private transformGizmo: GizmoTransform;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private boundsFacePicker: BoundsFacePicker;
  private textureLock: TextureLockSettings | null;
  private lastHoverCursorCss: string | null;
  private lastHoverCursorElement: HTMLElement | null;
  private lastRaisedSnappedResizeDelta: number;
  private hasRaisedSnappedResizeDelta: boolean;

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
    transformGizmo: GizmoTransform,
    gizmoRaycaster: GizmoRaycaster,
    transformExecutor: TransformExecutor,
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.gizmoRaycaster = gizmoRaycaster;
    this.transformExecutor = transformExecutor;
    this.boundsFacePicker = new BoundsFacePicker();
    this.textureLock = null;
    this.lastHoverCursorCss = null;
    this.lastHoverCursorElement = null;
    this.lastRaisedSnappedResizeDelta = 0;
    this.hasRaisedSnappedResizeDelta = false;
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
    selectedObjects: THREE.Object3D[],
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
   * Probes whether any bounds control is under the pointer without starting a
   * drag (Shape Editor gizmo isActive: handles, edges, and face interiors so
   * face-move latches wantsActive like the translation gizmo body).
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles Current gizmo handles.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane for orthographic silhouette edges.
   * @returns True when a handle, silhouette edge, or face is hit.
   */
  probeControlUnderPointer(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane = 'xyz',
  ): boolean {
    if (this.gizmoRaycaster.pickHandle(handles, camera, pickElement, event, gizmoGroup)) {
      return true;
    }
    if (this.pickSilhouetteEdgeFace(camera, pickElement, event, viewPlane)) {
      return true;
    }
    return this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup) !== null;
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
   * Re-issues the last hover cursor for the current editor frame when bounds
   * mode and oriented bounds are still active.
   */
  refreshHoverCursor(): void {
    if (!this.canRefreshHoverCursor()) {
      return;
    }
    const cursorCss = this.lastHoverCursorCss;
    const targetElement = this.lastHoverCursorElement;
    if (!cursorCss || !targetElement) {
      return;
    }
    managerMouseCursor.setMouseCursor(cursorCss, targetElement);
  }

  /**
   * Re-issues the bounds resize/move cursor while a handle drag is active
   * (Shape Editor UpdateMouseCursor on every repaint while the widget is
   * active). Uses the document body so the exclusive mouse shield inherits it.
   */
  reissueActiveDragCursor(): void {
    if (!this.session.dragActive) {
      return;
    }
    if (!this.session.isBoundsResize && !this.session.isBoundsFaceMove) {
      return;
    }
    const pickElement = this.session.dragRenderer;
    const camera = this.session.dragCamera;
    if (!pickElement || !camera) {
      return;
    }
    const cursorHost = this.resolveCursorHost(pickElement);
    const cursorCss = this.resolveActiveDragCursorCss(camera);
    this.lastHoverCursorCss = cursorCss;
    this.lastHoverCursorElement = cursorHost;
    managerMouseCursor.setMouseCursor(cursorCss, cursorHost);
  }

  /**
   * Forgets the cached hover cursor so the shared cursor manager can restore
   * the default on the next frame update.
   */
  clearHoverCursorCache(): void {
    this.lastHoverCursorCss = null;
    this.lastHoverCursorElement = null;
  }

  /**
   * Returns true when the cached hover cursor may be re-issued this frame.
   *
   * @returns True when bounds mode still has live oriented bounds.
   */
  private canRefreshHoverCursor(): boolean {
    if (this.transformGizmo.getMode() !== TransformMode.BOUNDS) {
      return false;
    }
    if (!this.transformGizmo.isVisible()) {
      return false;
    }
    if (!this.transformGizmo.getCurrentBounds()) {
      return false;
    }
    return true;
  }

  /**
   * Resolves and requests the hover CSS cursor for handle/edge resize, face
   * body hover, or default through the shared mouse cursor manager.
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
    const cursorCss = this.resolveHoverCursorCss(camera, pickElement, event, gizmoGroup, resizeFace, viewPlane);
    const cursorHost = this.resolveCursorHost(pickElement);
    this.lastHoverCursorCss = cursorCss;
    this.lastHoverCursorElement = cursorHost;
    managerMouseCursor.setMouseCursor(cursorCss, cursorHost);
  }

  /**
   * Cursor host for Shape Editor window-wide AddCursorRect behavior. The busy
   * exclusive shield uses cursor:inherit, so the body must own the style.
   *
   * @param pickElement Viewport pick element used to resolve the document.
   * @returns Document body when available, otherwise the pick element.
   */
  private resolveCursorHost(pickElement: HTMLElement): HTMLElement {
    return pickElement.ownerDocument?.body ?? pickElement;
  }

  /**
   * Cursor CSS for the active bounds drag face/handle.
   *
   * @param camera Camera used when the drag began.
   * @returns CSS cursor keyword.
   */
  private resolveActiveDragCursorCss(camera: THREE.Camera): string {
    if (this.session.isBoundsFaceMove) {
      return BOUNDS_MOVE_CURSOR;
    }
    const face = this.session.activeBoundsFace;
    const bounds = this.session.startBounds ?? this.transformGizmo.getCurrentBounds();
    if (!face || !bounds) {
      return BOUNDS_DEFAULT_CURSOR;
    }
    return resolveBoundsResizeCursor(face, bounds, camera, 'xyz');
  }

  /**
   * Chooses the CSS cursor for the current bounds hover target.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target.
   * @param event The pointer event.
   * @param gizmoGroup Viewport gizmo group.
   * @param resizeFace Face under a handle or edge, or null.
   * @param viewPlane Active pane view plane.
   * @returns CSS cursor keyword.
   */
  private resolveHoverCursorCss(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    gizmoGroup: THREE.Group,
    resizeFace: BoundsFace | null,
    viewPlane: CadViewPlane,
  ): string {
    if (resizeFace) {
      const bounds = this.transformGizmo.getCurrentBounds();
      if (!bounds) {
        return BOUNDS_DEFAULT_CURSOR;
      }
      return resolveBoundsResizeCursor(resizeFace, bounds, camera, viewPlane);
    }
    const facePick = this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup);
    if (facePick) {
      return BOUNDS_MOVE_CURSOR;
    }
    return BOUNDS_DEFAULT_CURSOR;
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
  handleMove(camera: THREE.Camera, pickElement: HTMLElement, event: MouseEvent, objects: THREE.Object3D[]): void {
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
    selectedObjects: THREE.Object3D[],
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
    selectedObjects: THREE.Object3D[],
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
    selectedObjects: THREE.Object3D[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group,
  ): boolean {
    const pick = this.boundsFacePicker.pickFace(event, camera, pickElement, gizmoGroup);
    if (!pick) return false;
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.transformExecutor.clearSnappedTranslationStepTracking();
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
    this.transformGizmo.setBoundsResizeHandlesVisible(false);
    this.reissueActiveDragCursor();
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
    selectedObjects: THREE.Object3D[],
    pivot: THREE.Vector3,
    bounds: DataOrientedBounds,
    face: BoundsFace,
    handle: GizmoHandle | null,
  ): void {
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.clearSnappedResizeStepTracking();
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
    this.reissueActiveDragCursor();
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
    objects: THREE.Object3D[],
  ): void {
    if (!this.session.initialMousePosition) return;
    const current = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, this.session.boundsMovePlane);
    if (!current) return;
    const totalDelta = current.clone().sub(this.session.initialMousePosition);
    this.session.lastPointerWorldDelta.copy(totalDelta);
    const constrainedDelta = this.constrainFaceMoveDelta(totalDelta);
    this.session.dragDeltaAccumulator.copy(constrainedDelta);
    this.transformExecutor.applyAbsoluteTranslation(objects, this.session.initialPositions, constrainedDelta);
    this.rebakeLockedTextures(objects, true, false);
  }

  /**
   * Constrains a bounds face-move delta by the keyboard modal axis lock when
   * set.
   *
   * @param delta Unconstrained face-plane delta.
   * @returns Constrained world delta.
   */
  private constrainFaceMoveDelta(delta: THREE.Vector3): THREE.Vector3 {
    return transformModalConstrainTranslationDelta(
      delta,
      this.session.modalAxisLock,
      null,
      this.transformGizmo.getOrientation(),
    );
  }

  /**
   * Applies a one-sided bounds resize delta from modal re-apply paths.
   *
   * @param objects Selected meshes.
   * @param deltaAlongNormal Displacement along the face outward normal.
   */
  applyResizeDelta(objects: THREE.Object3D[], deltaAlongNormal: number): void {
    this.session.boundsDeltaAlongNormal = deltaAlongNormal;
    this.session.lastPointerBoundsResizeDelta = deltaAlongNormal;
    this.applyResizeToObjects(objects, deltaAlongNormal);
    this.rebakeLockedTextures(objects, false, true);
    this.raiseSelectionResizedWithSnappingIfAppliedDeltaStepped(deltaAlongNormal);
  }

  /**
   * Applies one-sided resize along the active bounds face normal with snap.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  private handleResize(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    objects: THREE.Object3D[],
  ): void {
    if (!this.session.initialMousePosition || !this.session.activeBoundsFace || !this.session.startBounds) {
      return;
    }
    const plane = TransformProjectionMath.buildCameraPlane(camera, this.session.initialMousePosition);
    const current = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    if (!current) return;
    const outward = this.getActiveFaceWorldNormal();
    const rawDelta = current.clone().sub(this.session.initialMousePosition).dot(outward);
    const snappedDelta = this.snapResizeDelta(rawDelta);
    this.session.lastPointerBoundsResizeDelta = snappedDelta;
    this.session.boundsDeltaAlongNormal = snappedDelta;
    this.applyResizeToObjects(objects, snappedDelta);
    this.raiseSelectionResizedWithSnappingIfAppliedDeltaStepped(snappedDelta);
  }

  /** Clears snap-step tracking so the next applied resize can raise audio. */
  private clearSnappedResizeStepTracking(): void {
    this.hasRaisedSnappedResizeDelta = false;
    this.lastRaisedSnappedResizeDelta = 0;
  }

  /**
   * Raises snap-resize audio when the clamped applied face delta changes. Raw
   * snap steps past the minimum size do not raise (no BRRR at the size limit).
   *
   * @param requestedDelta Requested face displacement after grid snap.
   */
  private raiseSelectionResizedWithSnappingIfAppliedDeltaStepped(requestedDelta: number): void {
    if (!this.transformExecutor.getGridSnap().isEnabled()) {
      return;
    }
    const face = this.session.activeBoundsFace;
    const startBounds = this.session.startBounds;
    if (!face || !startBounds) {
      return;
    }
    const appliedDelta = resolveAppliedBoundsFaceDelta(
      startBounds,
      face,
      requestedDelta,
      this.resolveActiveMinimumHalfExtent(),
    );
    if (!this.appliedResizeDeltaStepped(appliedDelta)) {
      return;
    }
    this.lastRaisedSnappedResizeDelta = appliedDelta;
    this.hasRaisedSnappedResizeDelta = true;
    NotificationGlobal.onSelectionResizedWithSnapping(Math.abs(appliedDelta));
  }

  /**
   * Returns whether the applied (clamped) resize delta differs from the last
   * raised step.
   *
   * @param appliedDelta Face displacement after min-size clamp.
   * @returns True when geometry would change relative to the last raise.
   */
  private appliedResizeDeltaStepped(appliedDelta: number): boolean {
    if (!this.hasRaisedSnappedResizeDelta) {
      return Math.abs(appliedDelta) > 1e-12;
    }
    return Math.abs(appliedDelta - this.lastRaisedSnappedResizeDelta) > 1e-12;
  }

  /**
   * Snaps a face displacement when grid snap is enabled.
   *
   * @param rawDelta Unsnapped delta along the face normal.
   * @returns Snapped or raw delta.
   */
  private snapResizeDelta(rawDelta: number): number {
    const gridSnap = this.transformExecutor.getGridSnap();
    return snapBoundsFaceDelta(rawDelta, gridSnap.isEnabled(), gridSnap.getInterval());
  }

  /**
   * Returns the half-extent along the axis of a bounds face.
   *
   * @param bounds Oriented bounds at drag start.
   * @param face The face being resized.
   * @returns Half-extent along that face's axis.
   */
  private getFaceHalfExtent(bounds: DataOrientedBounds, face: BoundsFace): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      return bounds.halfExtents.x;
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      return bounds.halfExtents.y;
    }
    return bounds.halfExtents.z;
  }

  /**
   * Writes absolute one-sided resize results onto all selected objects.
   *
   * @param objects Selected meshes.
   * @param deltaAlongNormal Snapped face displacement.
   */
  private applyResizeToObjects(objects: THREE.Object3D[], deltaAlongNormal: number): void {
    if (!this.session.activeBoundsFace || !this.session.startBounds) return;
    const multi = objects.length > 1;
    const minHalfExtent = this.resolveActiveMinimumHalfExtent();
    objects.forEach((object) => {
      this.applyResizeToOneObject(object, deltaAlongNormal, multi, minHalfExtent);
    });
    this.rebakeLockedTextures(objects, true, true);
  }

  /**
   * Writes one-sided resize onto a single selected object.
   *
   * @param object Selected object.
   * @param deltaAlongNormal Face displacement.
   * @param multi True for multi-mesh selection resize.
   * @param minHalfExtent Minimum half-extent after resize.
   */
  private applyResizeToOneObject(
    object: THREE.Object3D,
    deltaAlongNormal: number,
    multi: boolean,
    minHalfExtent: number,
  ): void {
    const startPos = this.session.initialPositions.get(object);
    const startScale = this.session.initialScales.get(object);
    const face = this.session.activeBoundsFace;
    const startBounds = this.session.startBounds;
    if (!startPos || !startScale || !face || !startBounds) {
      return;
    }
    const result = this.computeObjectResizeResult(
      startPos,
      startScale,
      startBounds,
      face,
      deltaAlongNormal,
      multi,
      minHalfExtent,
    );
    object.position.copy(result.position);
    object.scale.copy(result.scale);
  }

  /**
   * Computes one-sided resize pose for a single object.
   *
   * @param startPos Position at drag start.
   * @param startScale Scale at drag start.
   * @param startBounds Bounds at drag start.
   * @param face Face being resized.
   * @param deltaAlongNormal Face displacement.
   * @param multi True for multi-mesh selection resize.
   * @param minHalfExtent Minimum half-extent after resize.
   * @returns New position and scale.
   */
  private computeObjectResizeResult(
    startPos: THREE.Vector3,
    startScale: THREE.Vector3,
    startBounds: DataOrientedBounds,
    face: BoundsFace,
    deltaAlongNormal: number,
    multi: boolean,
    minHalfExtent: number,
  ): { position: THREE.Vector3; scale: THREE.Vector3 } {
    if (multi) {
      return computeOneSidedMultiMeshResize(startPos, startScale, startBounds, face, deltaAlongNormal, minHalfExtent);
    }
    return computeOneSidedMeshResize(startPos, startScale, startBounds, face, deltaAlongNormal, minHalfExtent);
  }

  /**
   * Returns the minimum half-extent for the current grid snap state.
   *
   * @returns Minimum half-extent along the resized axis.
   */
  private resolveActiveMinimumHalfExtent(): number {
    const gridSnap = this.transformExecutor.getGridSnap();
    return resolveMinimumBoundsHalfExtent(gridSnap.isEnabled(), gridSnap.getInterval());
  }

  /**
   * Applies content texture-lock policy after a transform.
   *
   * @param objects Objects that just transformed (non-meshes ignored).
   * @param moved True when translation or rotation changed.
   * @param scaled True when scale changed.
   */
  rebakeLockedTextures(objects: THREE.Object3D[], moved: boolean = true, scaled: boolean = true): void {
    if (!this.textureLock) return;
    const meshes = objects.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    if (meshes.length === 0) return;
    this.textureLock.applyContentTransformPolicy(meshes, moved, scaled);
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
    bounds: DataOrientedBounds,
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
  private computeFaceWorldNormal(bounds: DataOrientedBounds, face: BoundsFace): THREE.Vector3 {
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
  private cloneBounds(bounds: DataOrientedBounds): DataOrientedBounds {
    return cloneOrientedBounds(bounds);
  }
}
