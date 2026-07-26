import * as THREE from 'three';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { GizmoHandle } from '../../transform/gizmo/gizmo_handle.js';
import { TransformExecutor } from '../../transform/transform_executor.js';
import { TransformHandler } from '../../transform/transform_handler.js';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { InputManager } from '../input/input_manager.js';
import { ViewportSyncManager } from '../layout/viewport_sync_manager.js';
import { PropertiesPanel } from '../../ui/properties/properties_panel.js';
import { filterUnlockedObjects } from '../../utils/object_lock.js';
import { resolveTransformTargets } from '../../selection/object/resolve_transform_targets.js';
import { WindowPointerDragSession } from '../../utils/window_pointer_drag_session.js';
import { SelectionClickThrough } from '../../selection/object/selection_click_through.js';

/**
 * Dependencies required to route viewport pointer events into the transform
 * gizmo.
 */
export interface TransformInteractionDependencies {
  selectionManager: SelectionManager;
  selectionVisualController: SelectionVisualController;
  transformGizmo: TransformGizmo;
  transformHandler: TransformHandler;
  transformExecutor: TransformExecutor;
  gridSnap: GridSnap;
  inputManager: InputManager;
  viewportSyncManager: ViewportSyncManager;
  propertiesPanel: PropertiesPanel;
  worldObject: THREE.Group;
  viewport3D: Viewport3D;
  getUserSnapEnabled: () => boolean;
  /** Returns true when gizmo handles should follow object-local axes. */
  isTransformSpaceLocal: () => boolean;
  syncPrimitivesToViewports: () => void;
  /**
   * Duplicates the current selection and selects the created objects. Used to
   * begin an Alt-drag with duplicates instead of the originals.
   */
  onDuplicateSelectedForDrag?: () => void;
  /**
   * Optional hook after a transform drag commits (solid CSG rebuild, etc.).
   * Return true when the handler fully synced solid results and the bridge
   * should skip a full viewport reclone (large-map pointer-up hang).
   *
   * @param meshes Meshes that were transformed.
   */
  onTransformsCommitted?: (meshes: THREE.Mesh[]) => boolean | void;
  /**
   * Optional hook during transform drag for live solid CSG preview.
   *
   * @param meshes Meshes currently being transformed.
   */
  onTransformsLive?: (meshes: THREE.Mesh[]) => void;
  /**
   * When false, gizmo/bounds picks are ignored so other tools (face select) can
   * receive pointer events. Defaults to always enabled when omitted.
   */
  isInteractionEnabled?: () => boolean;
  /**
   * Optional CAD ruler feedback for selection dimensions and drag deltas.
   *
   * @param meshes Meshes involved in the interaction.
   * @param phase Drag lifecycle phase.
   */
  onRulerTransformFeedback?: (meshes: THREE.Mesh[], phase: 'begin' | 'move' | 'end') => void;
}

/**
 * Bridges viewport pointer events to the transform handler and keeps clone
 * positions, selection visuals, and properties in sync during drag.
 */
export class TransformInteractionBridge {
  private deps: TransformInteractionDependencies;
  private windowDragSession: WindowPointerDragSession;
  private activeDragViewport: Viewport3D | Viewport2D | null;
  private pendingSelectionClickEvent: MouseEvent | null;
  private pendingSelectionClickViewport: Viewport3D | Viewport2D | null;

  /**
   * Creates a transform interaction bridge.
   *
   * @param deps Shared editor systems used during gizmo interaction.
   */
  constructor(deps: TransformInteractionDependencies) {
    this.deps = deps;
    this.windowDragSession = new WindowPointerDragSession();
    this.activeDragViewport = null;
    this.pendingSelectionClickEvent = null;
    this.pendingSelectionClickViewport = null;
  }

  /**
   * Wires transform callbacks on all viewports.
   *
   * @param viewports Viewports that can drive the transform gizmo.
   */
  wireViewports(viewports: Array<Viewport3D | Viewport2D>): void {
    viewports.forEach((viewport) => {
      viewport.setTransformCallback((event) => this.onTransformEvent(event, viewport));
    });
  }

  /**
   * Handles a transform event from a viewport.
   *
   * @param event The pointer event.
   * @param viewport The viewport that received the event.
   * @returns True if the event was consumed by the transform handler.
   */
  onTransformEvent(event: MouseEvent, viewport: Viewport3D | Viewport2D): boolean {
    if (!this.deps.selectionManager) return false;
    if (this.shouldSkipDisabledInteraction()) return false;
    if (!this.hasGizmoHandles()) return false;
    if (!this.isGizmoInteractable(viewport)) return false;
    if (this.shouldSkipGizmoForMultiSelect(event)) return false;
    const eventParams = this.buildTransformEventParams(viewport);
    return this.dispatchTransformEvent(
      event.type,
      eventParams.camera,
      eventParams.renderer,
      event,
      eventParams.handles,
      eventParams.selectedObjects,
      viewport.getGizmoGroup(),
      viewport,
    );
  }

  /**
   * Skips starting new gizmo picks when transform interaction is disabled (for
   * example while face selection mode is active). Ongoing drags still receive
   * move and up events so they can finish cleanly.
   *
   * @returns True when the event must not begin a new transform interaction.
   */
  private shouldSkipDisabledInteraction(): boolean {
    if (this.deps.transformHandler.isDragging()) return false;
    if (!this.deps.isInteractionEnabled) return false;
    return this.deps.isInteractionEnabled() === false;
  }

  /**
   * Returns whether the viewport gizmo is visible and should receive picks.
   *
   * @param viewport The viewport whose gizmo group is checked.
   * @returns True when the gizmo group exists and is visible.
   */
  private isGizmoInteractable(viewport: Viewport3D | Viewport2D): boolean {
    const gizmoGroup = viewport.getGizmoGroup();
    if (!gizmoGroup) return false;
    return gizmoGroup.visible === true;
  }

  /**
   * On pointer-down with multi-select modifiers, skip gizmo/bounds picks so
   * object selection can hit meshes behind the bounds volume.
   *
   * @param event The pointer event being dispatched.
   * @returns True when the gizmo must not consume this event.
   */
  private shouldSkipGizmoForMultiSelect(event: MouseEvent): boolean {
    if (event.type !== 'pointerdown') return false;
    if (this.deps.transformHandler.isDragging()) return false;
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  /**
   * Checks whether the transform gizmo has active handles.
   *
   * @returns True if handles exist and are non-empty.
   */
  private hasGizmoHandles(): boolean {
    return this.deps.transformGizmo.getHandles().length > 0;
  }

  /**
   * Gathers viewport and selection data for transform event dispatch.
   *
   * @param viewport The viewport providing camera and renderer.
   * @returns An object containing transform event parameters.
   */
  private buildTransformEventParams(viewport: Viewport3D | Viewport2D): {
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    handles: GizmoHandle[];
    selectedObjects: THREE.Mesh[];
  } {
    return {
      camera: viewport.getCamera(),
      renderer: viewport.getRenderer(),
      handles: this.deps.transformGizmo.getHandles(),
      selectedObjects: filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray()),
    };
  }

  /**
   * Dispatches a transform event to the appropriate handler method.
   *
   * @param eventType The pointer event type string.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes for the transform.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   * @returns True if the event was consumed.
   */
  private dispatchTransformEvent(
    eventType: string,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    gizmoGroup: THREE.Group | null,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    if (eventType === 'pointerdown') {
      return this.beginTransformPointerDown(camera, renderer, event, handles, selectedObjects, gizmoGroup, viewport);
    }
    if (eventType === 'pointermove') {
      return this.handleTransformPointerMove(camera, renderer, event);
    }
    if (eventType === 'pointerup') {
      return this.handleTransformPointerUp();
    }
    return false;
  }

  /**
   * Starts a gizmo/bounds drag and captures window move/up so release outside
   * the canvas still ends the drag.
   *
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointerdown event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes for the transform.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   * @param viewport The viewport that received the pointerdown.
   * @returns True when a drag was started.
   */
  private beginTransformPointerDown(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    gizmoGroup: THREE.Group | null,
    viewport: Viewport3D | Viewport2D,
  ): boolean {
    const pivot = this.computeCurrentPivot();
    this.deps.transformHandler.onPointerDown(
      camera,
      renderer,
      event,
      handles,
      selectedObjects,
      pivot,
      gizmoGroup ?? new THREE.Group(),
    );
    if (!this.deps.transformHandler.isDragging()) return false;
    const dragObjects = this.prepareAltDragDuplicates(event, camera, renderer, viewport);
    if (dragObjects.length === 0) return false;
    this.pendingSelectionClickEvent = event;
    this.pendingSelectionClickViewport = viewport;
    this.attachWindowDragCapture(viewport);
    this.deps.onRulerTransformFeedback?.(dragObjects, 'begin');
    return true;
  }

  /**
   * Replaces a valid Alt-drag session with an equivalent session targeting
   * newly duplicated objects.
   *
   * @param event The pointerdown event that began the drag.
   * @param camera The active viewport camera.
   * @param renderer The active viewport renderer.
   * @param viewport Viewport that owns the refreshed gizmo clone.
   * @returns Objects targeted by the active drag, or an empty array on failure.
   */
  private prepareAltDragDuplicates(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    viewport: Viewport3D | Viewport2D,
  ): THREE.Mesh[] {
    const current = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    if (!event.altKey || !this.deps.onDuplicateSelectedForDrag) return current;
    this.deps.transformHandler.onPointerUp(this.computeCurrentPivot(), current);
    this.deps.onDuplicateSelectedForDrag();
    const duplicates = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    if (duplicates.length === 0) return duplicates;
    this.restartTransformDrag(event, camera, renderer, duplicates, viewport);
    return this.deps.transformHandler.isDragging() ? duplicates : [];
  }

  /**
   * Starts the transform session again with duplicated selection targets.
   *
   * @param event Original pointerdown event.
   * @param camera Active viewport camera.
   * @param renderer Active viewport renderer.
   * @param duplicates Newly created selection targets.
   * @param viewport Viewport that owns the refreshed gizmo clone.
   */
  private restartTransformDrag(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    duplicates: THREE.Mesh[],
    viewport: Viewport3D | Viewport2D,
  ): void {
    this.deps.transformHandler.onPointerDown(
      camera,
      renderer,
      event,
      this.deps.transformGizmo.getHandles(),
      duplicates,
      this.computeCurrentPivot(),
      viewport.getGizmoGroup() ?? new THREE.Group(),
    );
  }

  /**
   * Routes subsequent move/up events through the originating viewport even when
   * the pointer leaves the canvas (toolbar, side panels, etc.).
   *
   * @param viewport The viewport that started the drag.
   */
  private attachWindowDragCapture(viewport: Viewport3D | Viewport2D): void {
    this.activeDragViewport = viewport;
    this.windowDragSession.begin(
      (moveEvent) => this.onWindowDragMove(moveEvent),
      () => this.handleTransformPointerUp(),
    );
  }

  /**
   * Applies a window-level pointermove using the viewport that began the drag.
   *
   * @param event The window pointermove event.
   */
  private onWindowDragMove(event: PointerEvent): void {
    if (!this.activeDragViewport) return;
    this.handleTransformPointerMove(this.activeDragViewport.getCamera(), this.activeDragViewport.getRenderer(), event);
  }

  /**
   * Handles the pointer move phase of a transform drag.
   *
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @returns True if the event was consumed.
   */
  private handleTransformPointerMove(camera: THREE.Camera, renderer: THREE.WebGLRenderer, event: MouseEvent): boolean {
    if (!this.deps.transformHandler.isDragging()) return false;
    const pivot = this.computeCurrentPivot();
    const selected = filterUnlockedObjects(Array.from(this.deps.selectionManager.getSelectedObjects()));
    this.updateSnapFromShiftKey();
    this.deps.transformHandler.onPointerMove(camera, renderer, event, pivot, selected);
    this.deps.onTransformsLive?.(selected);
    const transformTargets = resolveTransformTargets(selected);
    this.deps.viewportSyncManager.syncCloneTransformsForWorldObjects(transformTargets);
    this.deps.selectionVisualController.syncDuringTransform();
    this.deps.transformGizmo.setPivot(this.computeCurrentPivot());
    this.deps.transformGizmo.setOrientation(this.resolveGizmoOrientation(selected));
    this.deps.transformGizmo.updateBoundsFromMeshes(selected, this.deps.viewport3D.getCamera());
    this.deps.onRulerTransformFeedback?.(selected, 'move');
    this.refreshPropertiesPanelTransform();
    return true;
  }

  /**
   * Resolves gizmo orientation from transform space and selection. Global (or
   * multi-select) uses world axes; Local uses the object's rotation.
   *
   * @param selected Selected meshes.
   * @returns World quaternion for transform handles.
   */
  private resolveGizmoOrientation(selected: THREE.Mesh[]): THREE.Quaternion {
    if (!this.deps.isTransformSpaceLocal() || selected.length !== 1) {
      return new THREE.Quaternion();
    }
    selected[0]!.updateMatrixWorld(true);
    const orientation = new THREE.Quaternion();
    selected[0]!.getWorldQuaternion(orientation);
    return orientation;
  }

  /**
   * Handles the pointer up phase of a transform drag. Clears window capture so
   * later viewport moves do not resume the drag. Bounds face clicks without
   * movement cycle nested object selection.
   *
   * @returns True if the event was consumed.
   */
  private handleTransformPointerUp(): boolean {
    if (!this.deps.transformHandler.isDragging()) {
      this.clearWindowDragCapture();
      return false;
    }
    const pivot = this.computeCurrentPivot();
    const selectedObjects = filterUnlockedObjects(this.deps.selectionManager.getAllSelectedObjectsAsArray());
    const selectionClick = this.deps.transformHandler.onPointerUp(pivot, selectedObjects);
    const clickEvent = this.pendingSelectionClickEvent;
    const clickViewport = this.pendingSelectionClickViewport;
    this.clearWindowDragCapture();
    if (selectionClick) {
      this.deps.onRulerTransformFeedback?.(selectedObjects, 'end');
      this.applyBoundsFaceSelectionClick(clickEvent, clickViewport);
      return true;
    }
    this.commitTransformAfterDrag(selectedObjects);
    return true;
  }

  /**
   * Commits a completed transform drag (viewport sync, gizmo refresh).
   *
   * @param selectedObjects Meshes that were transformed.
   */
  private commitTransformAfterDrag(selectedObjects: THREE.Mesh[]): void {
    const solidHandled = this.deps.onTransformsCommitted?.(selectedObjects) === true;
    if (solidHandled) {
      this.deps.viewportSyncManager.syncCloneTransformsForWorldObjects(resolveTransformTargets(selectedObjects));
    } else {
      this.deps.syncPrimitivesToViewports();
    }
    this.deps.transformGizmo.setPivot(this.computeCurrentPivot());
    this.deps.transformGizmo.setOrientation(this.resolveGizmoOrientation(selectedObjects));
    this.deps.onRulerTransformFeedback?.(selectedObjects, 'end');
    this.refreshPropertiesPanelTransform();
  }

  /**
   * Applies click-through selection after a bounds face press with no drag.
   *
   * @param event The original pointerdown event used for picking.
   * @param viewport The viewport that received the press.
   */
  private applyBoundsFaceSelectionClick(event: MouseEvent | null, viewport: Viewport3D | Viewport2D | null): void {
    if (!event || !viewport) return;
    if (typeof viewport.getObjectPickStack !== 'function') return;
    const stack = viewport.getObjectPickStack(event);
    const picked = SelectionClickThrough.pickFromStack(stack, this.deps.selectionManager);
    if (!picked) return;
    this.deps.selectionManager.selectFromClick(picked, false, false);
  }

  /** Drops window-level drag listeners and the originating viewport reference. */
  private clearWindowDragCapture(): void {
    this.windowDragSession.end();
    this.activeDragViewport = null;
    this.pendingSelectionClickEvent = null;
    this.pendingSelectionClickViewport = null;
  }

  /** Pushes live object transforms into the properties inspector. */
  private refreshPropertiesPanelTransform(): void {
    this.deps.propertiesPanel.refreshBoundObject();
  }

  /**
   * Temporarily disables snap while Shift is held (precision mode). Restores
   * the user snap preference when Shift is released.
   */
  private updateSnapFromShiftKey(): void {
    if (this.deps.inputManager.isShiftDown()) {
      this.deps.gridSnap.setEnabled(false);
      return;
    }
    this.deps.gridSnap.setEnabled(this.deps.getUserSnapEnabled());
  }

  /**
   * Computes the current pivot point from selected objects.
   *
   * @returns The pivot vector for transform operations.
   */
  private computeCurrentPivot(): THREE.Vector3 {
    const selected = Array.from(this.deps.selectionManager.getSelectedObjects());
    return this.deps.transformExecutor.computePivot(selected);
  }
}
