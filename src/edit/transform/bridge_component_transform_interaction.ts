import { TransformMode } from '@/types/transform_mode.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import {
  applyGridSnapPrecisionFromShift,
  restoreGridSnapUserPreference,
} from '@/transform/snap/grid_snap_shift_precision.js';
import { ManagerInput } from '@/input/manager_input.js';
import { WindowPointerDragSession } from '@/utils/session_window_pointer_drag.js';
import { createSyntheticPointerDown } from '@/utils/synthetic_pointer_event.js';
import { resolveViewportOwnerWindow } from '@/utils/viewport_owner_window.js';
import type { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import {
  computeComponentTransformPivot,
  expandComponentSelectionToTransformVertices,
} from './component_transform_selection.js';
import { HandlerComponentTransform } from './handler_component_transform.js';

/** Dependencies for permanent component gizmo interaction. */
export interface DependenciesBridgeComponentTransformInteraction {
  transformGizmo: GizmoTransform;
  componentTransformHandler: HandlerComponentTransform;
  gridSnap: GridSnap;
  inputManager: ManagerInput;
  getUserSnapEnabled: () => boolean;
  getEditModeCoordinator: () => CoordinatorEditMode | null;
  probeViewportAtClientPoint: (clientX: number, clientY: number) => Viewport3D | Viewport2D | null;
  onPermanentGizmoHandleDragBegan?: () => void;
  onPermanentGizmoHandleDragEnded?: () => void;
  onLiveComponentTransform?: () => void;
  onAfterComponentTransformCommit?: () => void;
}

/**
 * Bridges permanent translate/rotate/scale widgets onto component vertex
 * transforms while Edit Mode is active.
 */
export class BridgeComponentTransformInteraction {
  private readonly deps: DependenciesBridgeComponentTransformInteraction;
  private readonly gizmoRaycaster: GizmoRaycaster;
  private readonly windowDragSession: WindowPointerDragSession;
  private activeDragViewport: Viewport3D | Viewport2D | null;

  /**
   * Creates a component transform interaction bridge.
   *
   * @param deps Shared editor systems used during gizmo interaction.
   */
  constructor(deps: DependenciesBridgeComponentTransformInteraction) {
    this.deps = deps;
    this.gizmoRaycaster = new GizmoRaycaster();
    this.windowDragSession = new WindowPointerDragSession();
    this.activeDragViewport = null;
  }

  /**
   * Probes whether a translate/rotate/scale handle is under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param modifiers Modifier keys (multi-select skips gizmo).
   * @returns True when a handle is under the pointer.
   */
  probeGizmoUnderPointer(
    clientX: number,
    clientY: number,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean },
  ): boolean {
    if (!this.canInteractWithGizmo(modifiers)) {
      return false;
    }
    const viewport = this.deps.probeViewportAtClientPoint(clientX, clientY);
    if (!viewport) {
      return false;
    }
    return this.pickHandleAtPointer(viewport, clientX, clientY) !== null;
  }

  /**
   * Begins a permanent component gizmo drag under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param modifiers Modifier keys.
   * @returns True when a handle drag started.
   */
  tryBeginFromEditorPointer(
    clientX: number,
    clientY: number,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean },
  ): boolean {
    if (!this.canInteractWithGizmo(modifiers)) {
      return false;
    }
    const viewport = this.deps.probeViewportAtClientPoint(clientX, clientY);
    if (!viewport) {
      return false;
    }
    const handle = this.pickHandleAtPointer(viewport, clientX, clientY);
    if (!handle) {
      return false;
    }
    return this.beginHandleDrag(viewport, handle.getAxis(), clientX, clientY);
  }

  /**
   * Returns whether a permanent component gizmo drag is active.
   *
   * @returns True during a handle drag.
   */
  isPermanentDragActive(): boolean {
    return this.deps.componentTransformHandler.isPermanentDrag();
  }

  /**
   * Returns whether Edit Mode allows permanent gizmo interaction.
   *
   * @param modifiers Multi-select modifiers.
   * @returns True when gizmo picks should run.
   */
  private canInteractWithGizmo(modifiers: {
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean {
    if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
      return false;
    }
    const coordinator = this.deps.getEditModeCoordinator();
    if (!coordinator?.isActive()) {
      return false;
    }
    if (coordinator.getComponentSelectionCount() <= 0) {
      return false;
    }
    const mode = this.deps.transformGizmo.getMode();
    if (mode === TransformMode.BOUNDS) {
      return false;
    }
    return this.deps.transformGizmo.isVisible();
  }

  /**
   * Picks a gizmo handle under a client point on a viewport.
   *
   * @param viewport Viewport under the pointer.
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns Picked handle, or null.
   */
  private pickHandleAtPointer(
    viewport: Viewport3D | Viewport2D,
    clientX: number,
    clientY: number,
  ): import('@/transform/gizmo/gizmo_handle.js').GizmoHandle | null {
    const gizmoGroup = viewport.getGizmoGroup();
    if (!gizmoGroup) {
      return null;
    }
    const event = createSyntheticPointerDown(clientX, clientY);
    return this.gizmoRaycaster.pickHandle(
      this.deps.transformGizmo.getHandles(),
      viewport.getCamera(),
      viewport.getContentElement(),
      event,
      gizmoGroup,
    );
  }

  /**
   * Starts a component handle drag and captures window move/up.
   *
   * @param viewport Originating viewport.
   * @param axis Picked axis.
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns True when started.
   */
  private beginHandleDrag(
    viewport: Viewport3D | Viewport2D,
    axis: import('@/types/transform_mode.js').GizmoAxis,
    clientX: number,
    clientY: number,
  ): boolean {
    const coordinator = this.deps.getEditModeCoordinator();
    if (!coordinator) {
      return false;
    }
    const session = coordinator.getSession();
    const vertices = expandComponentSelectionToTransformVertices(
      session.getComponentSelection().getSelected(),
      session.getDomain(),
    );
    const pivot = computeComponentTransformPivot(vertices);
    if (!pivot) {
      return false;
    }
    this.wireHandlerCallbacks(coordinator);
    const started = this.deps.componentTransformHandler.beginGizmoHandleDrag(
      this.deps.transformGizmo.getMode(),
      axis,
      this.deps.transformGizmo.getOrientation(),
      vertices,
      pivot,
      viewport.getCamera(),
      viewport.getContentElement(),
      clientX,
      clientY,
    );
    if (!started) {
      return false;
    }
    this.deps.transformGizmo.setActiveHandle(
      this.deps.transformGizmo.getHandles().find((handle) => handle.getAxis() === axis) ?? null,
    );
    this.attachWindowDragCapture(viewport);
    this.deps.onPermanentGizmoHandleDragBegan?.();
    return true;
  }

  /**
   * Installs live and commit callbacks on the component handler.
   *
   * @param coordinator Edit Mode coordinator.
   */
  private wireHandlerCallbacks(coordinator: CoordinatorEditMode): void {
    this.deps.componentTransformHandler.setAfterLiveCallback(() => {
      coordinator.refreshDomainGeometryPresentation();
      this.deps.onLiveComponentTransform?.();
    });
    this.deps.componentTransformHandler.setAfterCommitCallback(() => {
      coordinator.refreshDomainGeometryPresentation();
      this.deps.transformGizmo.setActiveHandle(null);
      this.deps.onAfterComponentTransformCommit?.();
    });
  }

  /**
   * Captures window-level pointer move/up for the active handle drag.
   *
   * @param viewport Originating viewport.
   */
  private attachWindowDragCapture(viewport: Viewport3D | Viewport2D): void {
    this.activeDragViewport = viewport;
    this.windowDragSession.begin(
      (moveEvent) => this.onWindowDragMove(moveEvent),
      () => this.onWindowDragUp(),
      resolveViewportOwnerWindow(viewport),
    );
  }

  /**
   * Applies a window pointermove sample to the active component drag.
   *
   * @param event Window pointer event.
   */
  private onWindowDragMove(event: PointerEvent): void {
    if (!this.activeDragViewport || !this.deps.componentTransformHandler.isDragging()) {
      return;
    }
    this.updateSnapFromShiftKey(event);
    this.deps.componentTransformHandler.applyPointerMove(event.clientX, event.clientY);
  }

  /** Commits the active component drag and clears window capture. */
  private onWindowDragUp(): void {
    if (!this.deps.componentTransformHandler.isDragging()) {
      this.clearWindowDragCapture();
      return;
    }
    this.deps.componentTransformHandler.commitIfNeeded();
    this.restoreSnapAfterDragEnds();
    this.clearWindowDragCapture();
    this.deps.onPermanentGizmoHandleDragEnded?.();
  }

  /** Drops window drag listeners and the originating viewport. */
  private clearWindowDragCapture(): void {
    this.windowDragSession.end();
    this.activeDragViewport = null;
  }

  /**
   * Applies Shift precision snap from the live pointer sample.
   *
   * @param event Pointer event.
   */
  private updateSnapFromShiftKey(event: PointerEvent): void {
    const shiftHeld = event.shiftKey || this.deps.inputManager.isShiftDown();
    applyGridSnapPrecisionFromShift(this.deps.gridSnap, shiftHeld, this.deps.getUserSnapEnabled());
  }

  /** Restores the user snap preference when a permanent drag ends. */
  private restoreSnapAfterDragEnds(): void {
    restoreGridSnapUserPreference(this.deps.gridSnap, this.deps.getUserSnapEnabled());
  }
}
