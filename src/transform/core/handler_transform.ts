import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { GizmoHandle } from '@/transform/gizmo/gizmo_handle.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from './transform_executor.js';
import { TransformConstraint } from './transform_constraint.js';
import { CommandStack } from '@/commands/command_stack.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { TransformDragSession } from './session_transform_drag.js';
import { TransformProjectionMath } from './transform_projection_math.js';
import { ControllerBoundsDrag } from '@/transform/bounds/controller_bounds_drag.js';
import { TransformCommandPusher } from './transform_command_pusher.js';
import { TransformModalHandlerIntegration } from '@/transform/modal/transform_modal_handler_integration.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { resolveKeyboardAxisOrientation } from '@/transform/modal/transform_modal_axis_orientation.js';
import { transformModalAxisWorldVector } from '@/transform/modal/transform_modal_axis_vector.js';
import { freeScaleAxisFactors } from './free_scale_axis_factors.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import type { CadViewPlane } from '@/rulers/view/cad_view_plane.js';

/**
 * Handles the drag interaction cycle for transform gizmo operations. Uses
 * absolute transforms from a pre-drag snapshot so results stay stable. Rotation
 * uses axis-plane angle measurement; scale uses distance ratios. During drags,
 * Blender-style X/Y/Z locks and numeric typing are routed through the modal
 * integration.
 */
export class HandlerTransform {
  private transformGizmo: GizmoTransform;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private session: TransformDragSession;
  private boundsDragController: ControllerBoundsDrag;
  private commandPusher: TransformCommandPusher;
  private modalIntegration: TransformModalHandlerIntegration;
  private readonly scratchKeyboardOrientation: THREE.Quaternion;
  private statusTextCallback: ((text: string) => void) | null;
  private afterDragVisualsCallback: ((objects: THREE.Object3D[]) => void) | null;

  /**
   * Creates a new transform handler.
   *
   * @param transformGizmo The gizmo orchestrator.
   * @param gizmoRaycaster The raycaster for handle picking.
   * @param transformExecutor The executor for applying transforms.
   * @param transformConstraint The constraint math utility (kept for API
   *   stability).
   * @param commandStack Optional command stack for undo/redo support.
   */
  constructor(
    transformGizmo: GizmoTransform,
    gizmoRaycaster: GizmoRaycaster,
    transformExecutor: TransformExecutor,
    _transformConstraint: TransformConstraint,
    commandStack: CommandStack | null = null,
  ) {
    this.transformGizmo = transformGizmo;
    this.gizmoRaycaster = gizmoRaycaster;
    this.transformExecutor = transformExecutor;
    this.session = new TransformDragSession();
    this.boundsDragController = new ControllerBoundsDrag(
      this.session,
      transformGizmo,
      gizmoRaycaster,
      transformExecutor,
    );
    this.commandPusher = new TransformCommandPusher(this.session, transformGizmo, transformExecutor, commandStack);
    this.modalIntegration = new TransformModalHandlerIntegration(
      Theme,
      this.session,
      transformGizmo,
      transformExecutor,
    );
    this.scratchKeyboardOrientation = new THREE.Quaternion();
    this.statusTextCallback = null;
    this.afterDragVisualsCallback = null;
    this.wireModalIntegrationCallbacks();
  }

  /**
   * Sets a callback for modal status text (axis lock + typed value).
   *
   * @param callback Status text publisher, or null to clear.
   */
  setModalStatusTextCallback(callback: ((text: string) => void) | null): void {
    this.statusTextCallback = callback;
  }

  /**
   * Sets a callback invoked after modal commit/cancel so overlays and rulers
   * refresh without requiring another pointer event.
   *
   * @param callback Visual refresh hook, or null to clear.
   */
  setAfterDragVisualsCallback(callback: ((objects: THREE.Object3D[]) => void) | null): void {
    this.afterDragVisualsCallback = callback;
  }

  /**
   * Routes keyboard input during an active transform drag (X/Y/Z, digits,
   * Enter, Escape).
   *
   * @param event Browser keyboard event.
   * @returns True when the event was consumed by modal transform input.
   */
  handleModalKeyDown(event: KeyboardEvent): boolean {
    if (!this.session.dragActive) {
      return false;
    }
    return this.modalIntegration.handleKeyDown(event);
  }

  /**
   * Begins a single-use keyboard tool drag without a gizmo handle pick (G/R/S).
   *
   * @param mode Transform mode for the operation.
   * @param selectedObjects Drag targets.
   * @param pivot World pivot.
   * @param camera Active camera.
   * @param pickElement Pick element for NDC.
   * @param clientX Pointer client X at start.
   * @param clientY Pointer client Y at start.
   * @returns True when the single-use drag started.
   */
  beginSingleUseDrag(
    mode: TransformMode,
    selectedObjects: THREE.Object3D[],
    pivot: THREE.Vector3,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    clientX: number,
    clientY: number,
  ): boolean {
    if (selectedObjects.length === 0) {
      return false;
    }
    this.commitActiveDragIfNeeded();
    this.prepareGizmoForSingleUseMode(mode);
    const syntheticEvent = this.createSyntheticMouseEvent(clientX, clientY);
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.transformExecutor.clearSnappedTranslationStepTracking();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.isSingleUseDrag = true;
    this.session.singleUseConfirmArmed = false;
    this.session.dragObjects = selectedObjects.slice();
    this.session.activeHandle = null;
    this.session.activeAxis = this.resolveSingleUseDefaultAxis(mode);
    this.session.dragCamera = camera;
    this.session.dragRenderer = pickElement as never;
    this.captureDragStartSample(camera, pickElement, syntheticEvent, pivot);
    this.modalIntegration.beginDrag();
    return true;
  }

  /**
   * Prepares gizmo mode for single-use math without showing handles (Shape
   * Editor and Blender hide transform widgets during G/R/S grab).
   *
   * @param mode Single-use transform mode.
   */
  private prepareGizmoForSingleUseMode(mode: TransformMode): void {
    this.transformGizmo.setMode(mode);
    this.transformGizmo.setVisible(false);
  }

  /**
   * Returns whether the active drag is a single-use keyboard tool session.
   *
   * @returns True during G/R/S style single-use.
   */
  isSingleUseDrag(): boolean {
    return this.session.dragActive && this.session.isSingleUseDrag;
  }

  /** Arms single-use confirm on LMB so the next pointer-up commits the edit. */
  armSingleUseConfirm(): void {
    if (!this.session.isSingleUseDrag) {
      return;
    }
    this.session.singleUseConfirmArmed = true;
  }

  /**
   * Returns whether single-use is waiting for pointer-up to commit.
   *
   * @returns True when LMB has armed confirm.
   */
  isSingleUseConfirmArmed(): boolean {
    return this.session.singleUseConfirmArmed;
  }

  /**
   * Chooses the default free axis for single-use mode without a handle pick.
   * Free G/R/S all start unconstrained (VIEW); X/Y/Z keyboard locks narrow
   * them.
   *
   * @param mode Transform mode.
   * @returns Default gizmo axis.
   */
  private resolveSingleUseDefaultAxis(_mode: TransformMode): GizmoAxis {
    return GizmoAxis.VIEW;
  }

  /**
   * Builds a minimal mouse event for pointer projection at client coordinates.
   *
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns Synthetic mouse event.
   */
  private createSyntheticMouseEvent(clientX: number, clientY: number): MouseEvent {
    return {
      clientX,
      clientY,
      button: 0,
      buttons: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    } as MouseEvent;
  }

  /**
   * Sets texture lock settings used when resizing or scaling meshes.
   *
   * @param settings Shared texture lock settings, or null to disable lock
   *   rebake.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.boundsDragController.setTextureLockSettings(settings);
  }

  /**
   * Returns the active transform gizmo mode.
   *
   * @returns Current TransformMode.
   */
  getMode(): TransformMode {
    return this.transformGizmo.getMode();
  }

  /**
   * Processes a pointer down event on the gizmo. Snapshots the pre-drag state
   * of selected objects for undo support.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes to snapshot.
   * @param pivot The transform pivot point for accurate projection.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   */
  onPointerDown(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Object3D[] = [],
    pivot: THREE.Vector3 = new THREE.Vector3(),
    gizmoGroup: THREE.Group = new THREE.Group(),
    viewPlane: CadViewPlane = 'xyz',
  ): void {
    if (this.isMultiSelectModifierHeld(event)) return;
    this.commitActiveDragIfNeeded();
    if (this.transformGizmo.getMode() === TransformMode.BOUNDS) {
      this.boundsDragController.beginPointerDown(
        camera,
        pickElement,
        event,
        handles,
        selectedObjects,
        pivot,
        gizmoGroup,
        viewPlane,
      );
      if (this.session.dragActive) {
        this.session.dragObjects = selectedObjects.slice();
        this.modalIntegration.beginDrag();
      }
      return;
    }
    const picked = this.gizmoRaycaster.pickHandle(handles, camera, pickElement, event, gizmoGroup);
    if (!picked) return;
    this.beginStandardHandleDrag(picked, camera, pickElement, event, selectedObjects, pivot);
  }

  /**
   * Returns true when the event is a multi-select click (Shift/Ctrl/Meta).
   * Those clicks must reach object selection rather than gizmo/bounds picks.
   * Shift is never used for bounds resize — it stays multi-select, fly boost,
   * and precision snap-off during drags.
   *
   * @param event The pointer event.
   * @returns True when multi-select modifiers are held.
   */
  private isMultiSelectModifierHeld(event: MouseEvent): boolean {
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  /**
   * Updates Bounds resize-handle hover (edge outline + CSS resize cursor) when
   * the pointer is idle.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane for orthographic cursor mapping.
   */
  updateBoundsHover(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane = 'xyz',
  ): void {
    if (this.session.dragActive) return;
    if (this.transformGizmo.getMode() !== TransformMode.BOUNDS) {
      this.clearBoundsHover(pickElement);
      return;
    }
    this.boundsDragController.updateFaceHoverHighlight(
      camera,
      pickElement,
      event,
      this.transformGizmo.getHandles(),
      gizmoGroup,
      viewPlane,
    );
  }

  /**
   * Clears bounds face/handle hover highlights and forgets the cached hover
   * cursor so the shared cursor manager restores the default next frame.
   *
   * @param _pickElement Unused; kept for call-site compatibility.
   */
  clearBoundsHover(_pickElement?: HTMLElement): void {
    this.transformGizmo.setHighlightedBoundsFace(null);
    this.boundsDragController.clearHoverCursorCache();
  }

  /**
   * Re-issues the last bounds hover cursor for the current editor frame when
   * still valid. Call once per animation frame before the cursor manager
   * update.
   */
  refreshBoundsHoverCursor(): void {
    if (this.session.dragActive) {
      this.boundsDragController.reissueActiveDragCursor();
      return;
    }
    this.boundsDragController.refreshHoverCursor();
  }

  /**
   * Re-issues the bounds drag cursor while a handle is held (Shape Editor
   * active-gizmo UpdateMouseCursor on every repaint).
   */
  reissueBoundsDragCursor(): void {
    this.boundsDragController.reissueActiveDragCursor();
  }

  /**
   * Probes whether a standard gizmo handle is under the pointer without
   * starting a drag.
   *
   * @param camera Viewport camera.
   * @param pickElement Pick element for NDC.
   * @param event Pointer event.
   * @param handles Master handle list.
   * @param gizmoGroup Viewport gizmo group.
   * @returns True when a handle is hit.
   */
  probeHandleUnderPointer(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    gizmoGroup: THREE.Group,
  ): boolean {
    return this.gizmoRaycaster.pickHandle(handles, camera, pickElement, event, gizmoGroup) !== null;
  }

  /**
   * Probes whether a bounds handle, edge, or face is under the pointer without
   * starting a drag.
   *
   * @param camera Viewport camera.
   * @param pickElement Pick element for NDC.
   * @param event Pointer event.
   * @param handles Master handle list.
   * @param gizmoGroup Viewport gizmo group.
   * @param viewPlane Active pane view plane for orthographic silhouette edges.
   * @returns True when a bounds control is hit.
   */
  probeBoundsControlUnderPointer(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    handles: GizmoHandle[],
    gizmoGroup: THREE.Group,
    viewPlane: CadViewPlane = 'xyz',
  ): boolean {
    return this.boundsDragController.probeControlUnderPointer(
      camera,
      pickElement,
      event,
      handles,
      gizmoGroup,
      viewPlane,
    );
  }

  /**
   * Starts a standard translate/rotate/scale handle drag.
   *
   * @param picked The picked gizmo handle.
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   */
  private beginStandardHandleDrag(
    picked: GizmoHandle,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectedObjects: THREE.Object3D[],
    pivot: THREE.Vector3,
  ): void {
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.transformExecutor.clearSnappedTranslationStepTracking();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.dragObjects = selectedObjects.slice();
    this.session.activeHandle = picked;
    this.session.activeAxis = picked.getAxis();
    this.session.dragCamera = camera;
    this.session.dragRenderer = pickElement as never;
    this.transformGizmo.setActiveHandle(picked);
    this.captureDragStartSample(camera, pickElement, event, pivot);
    this.modalIntegration.beginDrag();
  }

  /**
   * Processes a pointer move event during drag.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param pivot The transform pivot point.
   * @param selectedObjects The selected meshes to transform.
   */
  onPointerMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    _pivot: THREE.Vector3,
    selectedObjects: THREE.Object3D[],
  ): void {
    if (!this.session.dragActive) return;
    this.session.dragCamera = camera;
    this.session.dragRenderer = pickElement as never;
    if (this.session.dragObjects.length === 0) {
      this.session.dragObjects = selectedObjects.slice();
    }
    this.trackBoundsFacePointerMovement(event);
    if (this.modalIntegration.hasTypedValue()) {
      return;
    }
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.BOUNDS && !this.session.isSingleUseDrag) {
      this.boundsDragController.handleMove(camera, pickElement, event, selectedObjects);
      return;
    }
    if (!this.session.activeAxis) return;
    if (!this.session.isSingleUseDrag && !this.session.activeHandle) return;
    if (mode === TransformMode.TRANSLATE || (this.session.isSingleUseDrag && mode === TransformMode.BOUNDS)) {
      this.handleTranslateMove(camera, pickElement, event, selectedObjects);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.handleRotateMove(camera, pickElement, event, selectedObjects);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.handleScaleMove(camera, pickElement, event, selectedObjects);
    }
  }

  /**
   * Processes a pointer up event to end the drag. Bounds face presses without
   * real movement are treated as selection clicks so nested objects remain
   * reachable while bounds drag still works.
   *
   * @param pivot The transform pivot point used during the drag.
   * @param selectedObjects The selected meshes that were transformed.
   * @returns True when the press should run object click-through selection.
   */
  onPointerUp(pivot: THREE.Vector3 = new THREE.Vector3(), selectedObjects: THREE.Object3D[] = []): boolean {
    const selectionClick = this.isBoundsFaceClickWithoutDrag();
    if (selectionClick) {
      this.restoreMeshesFromSnapshot(selectedObjects);
    } else if (this.session.dragActive) {
      this.commandPusher.pushUndoCommand(pivot, selectedObjects);
    }
    this.finishDragInteraction();
    return selectionClick;
  }

  /** Clears active handle, guide lines, modal keyboard state, and drag session. */
  private finishDragInteraction(): void {
    this.modalIntegration.endDrag();
    this.transformGizmo.setActiveHandle(null);
    this.transformGizmo.setBoundsGuideLinesVisible(false);
    this.transformGizmo.setBoundsResizeHandlesVisible(true);
    this.transformGizmo.setHighlightedBoundsFace(null);
    this.session.clearInteractionTargets();
  }

  /**
   * Returns true for a bounds face press that never moved past the click
   * threshold (click-through selection into nested objects).
   *
   * @returns True when pointer-up should cycle object selection instead of
   *   commit.
   */
  private isBoundsFaceClickWithoutDrag(): boolean {
    if (!this.session.dragActive) return false;
    if (!this.session.isBoundsResize && !this.session.isBoundsFaceMove) return false;
    return !this.session.boundsPointerMoved;
  }

  /**
   * Marks bounds face interaction as a drag once screen movement exceeds
   * threshold.
   *
   * @param event The pointer move event.
   */
  private trackBoundsFacePointerMovement(event: MouseEvent): void {
    if (!this.session.isBoundsResize && !this.session.isBoundsFaceMove) return;
    if (this.session.boundsPointerMoved) return;
    const deltaX = event.clientX - this.session.pointerDownClientX;
    const deltaY = event.clientY - this.session.pointerDownClientY;
    const clickThresholdPixels = 4;
    if (deltaX * deltaX + deltaY * deltaY > clickThresholdPixels * clickThresholdPixels) {
      this.session.boundsPointerMoved = true;
    }
  }

  /**
   * Restores mesh transforms from the pre-drag snapshot (cancelled face click).
   *
   * @param selectedObjects Meshes that may have been nudged during the press.
   */
  private restoreMeshesFromSnapshot(selectedObjects: THREE.Object3D[]): void {
    selectedObjects.forEach((object) => {
      const position = this.session.initialPositions.get(object);
      const quaternion = this.session.initialQuaternions.get(object);
      const scale = this.session.initialScales.get(object);
      if (position) object.position.copy(position);
      if (quaternion) object.quaternion.copy(quaternion);
      if (scale) object.scale.copy(scale);
    });
  }

  /**
   * Returns whether a drag operation is currently in progress.
   *
   * @returns True if dragging is active.
   */
  isDragging(): boolean {
    return this.session.dragActive;
  }

  /**
   * Commits the active drag (push undo from the pre-drag snapshot) when one is
   * running. Used before starting a new drag and when focus is lost so the
   * original pose remains undoable.
   */
  commitActiveDragIfNeeded(): void {
    if (!this.session.dragActive) {
      return;
    }
    this.commitModalDrag();
  }

  /** Cancels the active drag and restores pre-drag poses without pushing undo. */
  cancelActiveDragIfNeeded(): void {
    if (!this.session.dragActive) {
      return;
    }
    this.cancelModalDrag();
  }

  /**
   * Returns the accumulated world-space translation delta for the active drag.
   *
   * @returns A clone of the drag delta accumulator.
   */
  getDragDelta(): THREE.Vector3 {
    return this.session.dragDeltaAccumulator.clone();
  }

  /**
   * Returns the oriented bounds captured at the start of a bounds drag.
   *
   * @returns Cloned start bounds, or null when unavailable.
   */
  getDragStartBounds(): DataOrientedBounds | null {
    if (!this.session.startBounds) return null;
    return {
      center: this.session.startBounds.center.clone(),
      quaternion: this.session.startBounds.quaternion.clone(),
      halfExtents: this.session.startBounds.halfExtents.clone(),
    };
  }

  /**
   * Returns the pivot point captured when the drag began.
   *
   * @returns A clone of the drag pivot.
   */
  getDragPivot(): THREE.Vector3 {
    return this.session.dragPivot.clone();
  }

  /**
   * Returns whether the active drag is a bounds one-sided resize.
   *
   * @returns True during bounds resize.
   */
  isBoundsResizeDrag(): boolean {
    return this.session.dragActive && this.session.isBoundsResize;
  }

  /**
   * Returns whether the active drag is a pure translation (move handle or
   * bounds face slide).
   *
   * @returns True when translation deltas should drive CAD rulers.
   */
  isTranslationDrag(): boolean {
    if (!this.session.dragActive) return false;
    if (this.session.isBoundsResize) return false;
    return true;
  }

  /**
   * Returns the currently active gizmo axis.
   *
   * @returns The active GizmoAxis, or null if not dragging.
   */
  getActiveAxis(): GizmoAxis | null {
    return this.session.activeAxis;
  }

  /**
   * Checks if the handler is currently busy with a drag.
   *
   * @returns True if the handler should consume events.
   */
  isBusy(): boolean {
    return this.session.dragActive;
  }

  /**
   * Captures the mode-specific start sample used during drag.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureDragStartSample(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    pivot: THREE.Vector3,
  ): void {
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      this.captureTranslateStart(camera, pickElement, event, pivot);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.captureRotateStart(camera, pickElement, event, pivot);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.captureScaleStart(camera, pickElement, event, pivot);
    }
  }

  /**
   * Stores the initial plane intersection for translation.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureTranslateStart(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    pivot: THREE.Vector3,
  ): void {
    const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
    this.session.initialMousePosition = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
  }

  /**
   * Stores the initial direction or screen position for rotation.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureRotateStart(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    pivot: THREE.Vector3,
  ): void {
    this.session.initialScreenPosition = TransformProjectionMath.getScreenPosition(pickElement, event);
    this.session.frozenRotationAxisWorld = this.resolveActiveRotationAxisWorld();
    this.session.initialScreenAngleRadians = this.computeSignedScreenAngleAroundPivot(
      camera,
      pickElement,
      event,
      pivot,
    );
    if (!this.session.activeAxis || this.session.activeAxis === GizmoAxis.VIEW) {
      this.session.useScreenSpaceRotation = true;
      this.session.initialRotationDirection = null;
      return;
    }
    const axis = this.session.frozenRotationAxisWorld;
    if (!axis) {
      this.session.useScreenSpaceRotation = true;
      this.session.initialRotationDirection = null;
      return;
    }
    this.session.useScreenSpaceRotation = TransformProjectionMath.isAxisEdgeOn(camera, axis);
    if (this.session.useScreenSpaceRotation) {
      this.session.initialRotationDirection = null;
      return;
    }
    this.session.rotationPlane.setFromNormalAndCoplanarPoint(axis, pivot);
    const hit = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, this.session.rotationPlane);
    if (!hit) {
      this.session.useScreenSpaceRotation = true;
      return;
    }
    const direction = hit.clone().sub(pivot);
    if (direction.lengthSq() < 1e-8) {
      this.session.useScreenSpaceRotation = true;
      return;
    }
    this.session.initialRotationDirection = direction.normalize();
  }

  /**
   * Stores the pivot-to-mouse radial distance for Shape Editor scale ratios.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureScaleStart(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    pivot: THREE.Vector3,
  ): void {
    const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
    const hit = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    this.session.initialMousePosition = hit;
    if (!hit) {
      this.session.initialDistanceAlongAxis = 0;
      return;
    }
    this.session.initialDistanceAlongAxis = hit.distanceTo(pivot);
  }

  /**
   * Applies translation from drag start using camera-plane mouse delta.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects The meshes to translate.
   */
  private handleTranslateMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    objects: THREE.Object3D[],
  ): void {
    if (!this.session.initialMousePosition) return;
    const plane = TransformProjectionMath.buildCameraPlane(camera, this.session.dragPivot);
    const currentMouse = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    if (!currentMouse) return;
    const totalDelta = currentMouse.clone().sub(this.session.initialMousePosition);
    this.session.lastPointerWorldDelta.copy(totalDelta);
    const constrainedDelta = this.modalIntegration.constrainTranslationDelta(totalDelta);
    this.session.dragDeltaAccumulator.copy(constrainedDelta);
    this.transformExecutor.applyAbsoluteTranslation(objects, this.session.initialPositions, constrainedDelta);
    this.boundsDragController.rebakeLockedTextures(objects, true, false);
  }

  /**
   * Applies rotation from drag start using axis-plane angle or screen space.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects The meshes to rotate.
   */
  private handleRotateMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    objects: THREE.Object3D[],
  ): void {
    if (!this.session.activeAxis) return;
    const axis = this.resolveActiveRotationAxisWorld();
    if (!axis) return;
    const angle = this.computeRotationAngle(camera, pickElement, event, axis);
    this.session.lastPointerRotationAngle = angle;
    this.session.dragRotationAngle = angle;
    this.transformExecutor.applyAbsoluteRotation(
      objects,
      this.session.initialPositions,
      this.session.initialQuaternions,
      this.session.dragPivot,
      axis,
      angle,
    );
    this.boundsDragController.rebakeLockedTextures(objects, true, false);
  }

  /**
   * Resolves the world rotation axis from modal lock or the active handle.
   *
   * @returns Unit world axis, or null.
   */
  private resolveActiveRotationAxisWorld(): THREE.Vector3 | null {
    const modalAxis = this.resolveModalRotationAxisWorld();
    if (modalAxis) {
      return modalAxis;
    }
    return this.resolveHandleRotationAxisWorld();
  }

  /**
   * Resolves the world axis for a keyboard X/Y/Z rotation or scale lock.
   *
   * @returns Unit world axis, or null when no keyboard lock is active.
   */
  private resolveModalRotationAxisWorld(): THREE.Vector3 | null {
    const modalAxis = this.modalIntegration.getModalAxis();
    if (modalAxis === TransformModalAxis.None) {
      return null;
    }
    const orientation = resolveKeyboardAxisOrientation(
      this.transformExecutor.getGridSnap(),
      this.transformGizmo.getOrientation(),
      this.scratchKeyboardOrientation,
    );
    return transformModalAxisWorldVector(modalAxis, orientation);
  }

  /**
   * Resolves the world axis for the active handle, including a frozen drag
   * axis.
   *
   * @returns Unit world axis, or null when no handle axis is active.
   */
  private resolveHandleRotationAxisWorld(): THREE.Vector3 | null {
    if (this.session.frozenRotationAxisWorld && this.session.dragActive) {
      return this.session.frozenRotationAxisWorld.clone();
    }
    if (!this.session.activeAxis) {
      return null;
    }
    if (this.session.activeAxis === GizmoAxis.VIEW) {
      return this.resolveViewRotationAxisWorld();
    }
    return TransformProjectionMath.axisToWorldVector(this.session.activeAxis, this.transformGizmo.getOrientation());
  }

  /**
   * Resolves the camera-forward axis used for view-plane rotation.
   *
   * @returns Unit camera forward.
   */
  private resolveViewRotationAxisWorld(): THREE.Vector3 {
    const camera = this.session.dragCamera ?? new THREE.PerspectiveCamera();
    return TransformProjectionMath.getCameraForwardDirection(camera);
  }

  /**
   * Computes the signed rotation angle for the current pointer sample.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param axis The rotation axis.
   * @returns Signed rotation angle in radians (pre-snap).
   */
  private computeRotationAngle(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    axis: THREE.Vector3,
  ): number {
    if (this.session.useScreenSpaceRotation || !this.session.initialRotationDirection) {
      return this.computePivotOrbitScreenRotationAngle(camera, pickElement, event);
    }
    const hit = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, this.session.rotationPlane);
    if (!hit) {
      return this.computePivotOrbitScreenRotationAngle(camera, pickElement, event);
    }
    const currentDirection = hit.clone().sub(this.session.dragPivot);
    if (currentDirection.lengthSq() < 1e-8) {
      return this.session.dragRotationAngle;
    }
    return TransformConstraint.computeRotationAngle(this.session.initialRotationDirection, currentDirection, axis);
  }

  /**
   * Shape Editor / Blender free-rotate: signed angle around the projected pivot
   * between the start mouse vector and the current mouse vector (not raw screen
   * deltas).
   *
   * @param camera Active camera for projecting the world pivot.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @returns Signed rotation angle in radians from drag start.
   */
  private computePivotOrbitScreenRotationAngle(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
  ): number {
    const currentAngle = this.computeSignedScreenAngleAroundPivot(camera, pickElement, event, this.session.dragPivot);
    return this.wrapSignedAngleRadians(currentAngle - this.session.initialScreenAngleRadians);
  }

  /**
   * Signed angle of the mouse relative to the projected pivot (Shape Editor
   * Vector2.SignedAngle against up).
   *
   * @param camera Active camera.
   * @param pickElement DOM pick target.
   * @param event Pointer event.
   * @param worldPivot World-space pivot.
   * @returns Signed angle in radians.
   */
  private computeSignedScreenAngleAroundPivot(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    worldPivot: THREE.Vector3,
  ): number {
    const pivotScreen = TransformProjectionMath.projectWorldPointToNormalizedScreen(camera, pickElement, worldPivot);
    const mouseScreen = TransformProjectionMath.getScreenPosition(pickElement, event);
    const offsetX = mouseScreen.x - pivotScreen.x;
    const offsetY = mouseScreen.y - pivotScreen.y;
    if (offsetX * offsetX + offsetY * offsetY < 1e-12) {
      return this.session.initialScreenAngleRadians;
    }
    return Math.atan2(offsetX, -offsetY);
  }

  /**
   * Wraps an angle into (-π, π] for stable DeltaAngle-style updates.
   *
   * @param angleRadians Angle in radians.
   * @returns Wrapped angle.
   */
  private wrapSignedAngleRadians(angleRadians: number): number {
    let wrapped = angleRadians;
    while (wrapped > Math.PI) {
      wrapped -= Math.PI * 2;
    }
    while (wrapped <= -Math.PI) {
      wrapped += Math.PI * 2;
    }
    return wrapped;
  }

  /**
   * Applies scale from drag start using Shape Editor radial distance ratios.
   *
   * @param camera The viewport camera.
   * @param pickElement DOM pick target for NDC.
   * @param event The pointer event.
   * @param objects The meshes to scale.
   */
  private handleScaleMove(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    objects: THREE.Object3D[],
  ): void {
    const plane = TransformProjectionMath.buildCameraPlane(camera, this.session.dragPivot);
    const hit = this.gizmoRaycaster.projectMouseToPlane(camera, pickElement, event, plane);
    if (!hit) {
      return;
    }
    const factor = this.computeRadialScaleFactorFromHit(hit);
    this.session.lastPointerScaleFactor = factor;
    this.session.dragScaleFactor = factor;
    if (this.shouldApplyUniformScale()) {
      this.applyUniformScaleFromFactor(objects, factor);
      return;
    }
    this.applyAxisConstrainedScaleFromFactor(objects, factor);
  }

  /**
   * Computes the Shape Editor scale factor from pivot-to-mouse radial distance.
   *
   * @param hit Camera-plane mouse hit in world space.
   * @returns Scale factor relative to drag start.
   */
  private computeRadialScaleFactorFromHit(hit: THREE.Vector3): number {
    const currentDistance = hit.distanceTo(this.session.dragPivot);
    return TransformConstraint.computeScaleFactor(this.session.initialDistanceAlongAxis, currentDistance);
  }

  /**
   * Returns true for free uniform scale (single-use S without axis lock, VIEW).
   *
   * @returns True when all local scale axes should receive the radial factor.
   */
  private shouldApplyUniformScale(): boolean {
    if (this.modalIntegration.getModalAxis() !== TransformModalAxis.None) {
      return false;
    }
    if (this.session.isSingleUseDrag) {
      return true;
    }
    if (!this.session.activeAxis || this.session.activeAxis === GizmoAxis.VIEW) {
      return true;
    }
    return false;
  }

  /**
   * Applies free ScaleAroundPivot scale for free S / VIEW center cube (uniform
   * in 3D; planar axes only in orthographic 2D).
   *
   * @param objects Drag targets.
   * @param factor Radial distance ratio.
   */
  private applyUniformScaleFromFactor(objects: THREE.Object3D[], factor: number): void {
    const axisFactors = freeScaleAxisFactors(factor, this.session.dragCamera, this.session.isSingleUseDrag);
    this.transformExecutor.applyAbsoluteFreeScale(
      objects,
      this.session.initialPositions,
      this.session.initialScales,
      this.session.dragPivot,
      axisFactors,
    );
    this.boundsDragController.rebakeLockedTextures(objects, false, true);
  }

  /**
   * Applies radial-factor scale on one gizmo axis (ScaleWidget X/Y style).
   *
   * @param objects Drag targets.
   * @param factor Radial distance ratio.
   */
  private applyAxisConstrainedScaleFromFactor(objects: THREE.Object3D[], factor: number): void {
    const axis = this.resolveActiveRotationAxisWorld();
    if (!axis) {
      return;
    }
    const scaleAxis = this.resolveActiveScaleGizmoAxis();
    if (!scaleAxis) {
      return;
    }
    this.transformExecutor.applyAbsoluteScale(
      objects,
      this.session.initialPositions,
      this.session.initialScales,
      this.session.dragPivot,
      axis,
      factor,
      scaleAxis,
    );
    this.boundsDragController.rebakeLockedTextures(objects, false, true);
  }

  /**
   * Resolves the gizmo axis enum used for scale after optional modal lock.
   *
   * @returns Single-axis gizmo axis, or null.
   */
  private resolveActiveScaleGizmoAxis(): GizmoAxis | null {
    const modalAxis = this.modalIntegration.getModalAxis();
    if (modalAxis === TransformModalAxis.X) return GizmoAxis.X;
    if (modalAxis === TransformModalAxis.Y) return GizmoAxis.Y;
    if (modalAxis === TransformModalAxis.Z) return GizmoAxis.Z;
    if (!this.session.activeAxis) return null;
    if (
      this.session.activeAxis === GizmoAxis.X ||
      this.session.activeAxis === GizmoAxis.Y ||
      this.session.activeAxis === GizmoAxis.Z
    ) {
      return this.session.activeAxis;
    }
    return null;
  }

  /** Wires modal controller callbacks for commit, cancel, status, and re-apply. */
  private wireModalIntegrationCallbacks(): void {
    this.modalIntegration.setCallbacks({
      commitDrag: () => this.commitModalDrag(),
      cancelDrag: () => this.cancelModalDrag(),
      rebakeTextures: (objects, translationLike, scaleLike) =>
        this.boundsDragController.rebakeLockedTextures(objects, translationLike, scaleLike),
      setStatusText: (text) => this.statusTextCallback?.(text),
      reapplyMouseDrivenTransform: () => this.reapplyMouseDrivenTransform(),
    });
  }

  /** Commits the active drag from keyboard Enter without a pointer-up event. */
  private commitModalDrag(): void {
    if (!this.session.dragActive) return;
    const objects = this.session.dragObjects.slice();
    const pivot = this.session.dragPivot.clone();
    this.commandPusher.pushUndoCommand(pivot, objects);
    this.finishDragInteraction();
    this.afterDragVisualsCallback?.(objects);
  }

  /** Cancels the active drag from keyboard Escape without pushing undo. */
  private cancelModalDrag(): void {
    if (!this.session.dragActive) return;
    const objects = this.session.dragObjects.slice();
    this.restoreMeshesFromSnapshot(objects);
    this.finishDragInteraction();
    this.afterDragVisualsCallback?.(objects);
  }

  /** Re-applies the last pointer-driven sample after modal axis or buffer edits. */
  private reapplyMouseDrivenTransform(): void {
    const objects = this.session.dragObjects;
    if (objects.length === 0) return;
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      this.modalIntegration.reapplyLastPointerTranslation(objects);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.modalIntegration.reapplyLastPointerRotation(objects);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.modalIntegration.reapplyLastPointerScale(objects);
      return;
    }
    this.reapplyBoundsMouseDrivenTransform(objects);
  }

  /**
   * Re-applies the last bounds pointer sample with the current modal lock.
   *
   * @param objects Drag targets.
   */
  private reapplyBoundsMouseDrivenTransform(objects: THREE.Object3D[]): void {
    if (this.session.isBoundsResize) {
      this.boundsDragController.applyResizeDelta(objects, this.session.lastPointerBoundsResizeDelta);
      return;
    }
    this.modalIntegration.reapplyLastPointerTranslation(objects);
  }
}
