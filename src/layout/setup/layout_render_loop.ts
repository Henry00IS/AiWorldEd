import type * as THREE from 'three';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { getCadViewPlaneForKind, isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import { CoordinatorCameraFit } from '@/navigation/camera/coordinator_camera_fit.js';
import type { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { HandlerGridOrientation } from '@/tools/grid/handler_grid_orientation.js';
import { MultiViewComposer, type MultiViewPanePass } from '@/viewports/core/multi_view_composer.js';
import type { SharedWorldScene } from '@/viewports/shared/shared_world_scene.js';
import type { CadRulerSystem } from '@/rulers/system/cad_ruler_system.js';
import type { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import type { HandlerTransform } from '@/transform/core/handler_transform.js';
import { managerMouseCursor } from '@/input/manager_mouse_cursor.js';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { controllerAudioPlayback } from '@/audio/playback/controller_audio_playback.js';
import { Theme } from '@/theme.js';

/**
 * Mutable multi-view pass with a stable viewport reference so per-frame
 * closures can be created once and reused.
 */
interface ReusableMultiViewPass extends MultiViewPanePass {
  viewport: ViewportEditor;
}

/** Owns the editor animation frame loop and resize disconnect helpers. */
export class LayoutRenderLoop {
  private isRunning: boolean;
  private isDisposed: boolean;
  private animationFrameId: number | null;
  private lastTime: number;
  private resizeObserver: ResizeObserver | null;
  private getActiveViewports: (() => readonly ViewportEditor[]) | null;
  private cameraFitCoordinator: CoordinatorCameraFit | null;
  private editorOrientationCoordinator: CoordinatorEditorOrientation | null;
  private clipPlaneHandler: HandlerClipPlane | null;
  private gridOrientationHandler: HandlerGridOrientation | null;
  private cadRulerSystem: CadRulerSystem | null;
  private transformGizmo: GizmoTransform | null;
  private transformHandler: HandlerTransform | null;
  private onBeforeRender: (() => void) | null;
  private onViewportPrepare: ((viewport: ViewportEditor) => void) | null;
  private multiViewComposer: MultiViewComposer | null;
  private sharedScene: SharedWorldScene | null;
  private boundOnAnimationFrame: () => void;
  private multiViewPassPool: ReusableMultiViewPass[];
  private multiViewPasses: ReusableMultiViewPass[];
  private afterRenderQueue: Array<() => void>;

  /** Creates an idle render loop. */
  constructor() {
    this.isRunning = false;
    this.isDisposed = false;
    this.animationFrameId = null;
    this.lastTime = 0;
    this.resizeObserver = null;
    this.getActiveViewports = null;
    this.cameraFitCoordinator = null;
    this.editorOrientationCoordinator = null;
    this.clipPlaneHandler = null;
    this.gridOrientationHandler = null;
    this.cadRulerSystem = null;
    this.transformGizmo = null;
    this.transformHandler = null;
    this.onBeforeRender = null;
    this.onViewportPrepare = null;
    this.multiViewComposer = null;
    this.sharedScene = null;
    this.boundOnAnimationFrame = () => this.onAnimationFrame();
    this.multiViewPassPool = [];
    this.multiViewPasses = [];
    this.afterRenderQueue = [];
  }

  /**
   * Runs work once, right after the next frame was drawn into the shared
   * canvas, while its pixels can still be read.
   *
   * @param run Work to run.
   */
  afterRenderOnce(run: () => void): void {
    this.afterRenderQueue.push(run);
  }

  /** Runs and forgets the work queued for after this frame. */
  private afterRenderRun(): void {
    if (this.afterRenderQueue.length === 0) return;
    const queued = this.afterRenderQueue;
    this.afterRenderQueue = [];
    queued.forEach((run) => run());
  }

  /**
   * Binds viewports and shared multi-view resources used each frame. Surface
   * and workspace sizing stay on MultiViewComposer / watchResize.
   *
   * @param parts Live layout subsystems for the render path.
   */
  bind(parts: {
    getActiveViewports: () => readonly ViewportEditor[];
    cameraFitCoordinator: CoordinatorCameraFit;
    clipPlaneHandler: HandlerClipPlane | null;
    editorOrientationCoordinator?: CoordinatorEditorOrientation | null;
    gridOrientationHandler?: HandlerGridOrientation | null;
    cadRulerSystem?: CadRulerSystem | null;
    transformGizmo?: GizmoTransform | null;
    transformHandler?: HandlerTransform | null;
    onBeforeRender: () => void;
    onViewportPrepare?: (viewport: ViewportEditor) => void;
    multiViewComposer: MultiViewComposer;
    sharedScene: SharedWorldScene;
  }): void {
    this.getActiveViewports = parts.getActiveViewports;
    this.cameraFitCoordinator = parts.cameraFitCoordinator;
    this.clipPlaneHandler = parts.clipPlaneHandler;
    this.editorOrientationCoordinator = parts.editorOrientationCoordinator ?? null;
    this.gridOrientationHandler = parts.gridOrientationHandler ?? null;
    this.cadRulerSystem = parts.cadRulerSystem ?? null;
    this.transformGizmo = parts.transformGizmo ?? null;
    this.transformHandler = parts.transformHandler ?? null;
    this.onBeforeRender = parts.onBeforeRender;
    this.onViewportPrepare = parts.onViewportPrepare ?? null;
    this.multiViewComposer = parts.multiViewComposer;
    this.sharedScene = parts.sharedScene;
  }

  /**
   * Updates the grid orientation handler used for align-preview scale.
   *
   * @param handler Grid orientation handler or null.
   */
  setGridOrientationHandler(handler: HandlerGridOrientation | null): void {
    this.gridOrientationHandler = handler;
  }

  /**
   * Updates the orientation coordinator used for reorientation animation.
   *
   * @param coordinator Orientation coordinator or null.
   */
  setEditorOrientationCoordinator(coordinator: CoordinatorEditorOrientation | null): void {
    this.editorOrientationCoordinator = coordinator;
  }

  /**
   * Updates the clip handler used for preview scale each frame.
   *
   * @param handler Clip plane handler or null.
   */
  setClipPlaneHandler(handler: HandlerClipPlane | null): void {
    this.clipPlaneHandler = handler;
  }

  /**
   * Watches workspace and viewport elements and invokes a resize callback.
   *
   * @param elements Elements that affect pane layout size.
   * @param onResize Resize handler.
   */
  watchResize(elements: HTMLElement[], onResize: () => void): void {
    this.disconnectResizeObserver();
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => onResize());
    });
    elements.forEach((element) => this.resizeObserver?.observe(element));
  }

  /** Starts the continuous render loop. */
  start(): void {
    if (this.isRunning || this.isDisposed) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  /** Stops the render loop without disposing resources. */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /** Stops the loop and disconnects resize observation. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stop();
    this.disconnectResizeObserver();
    managerMouseCursor.reset();
  }

  /**
   * Returns whether the loop has been disposed.
   *
   * @returns True when disposed.
   */
  getIsDisposed(): boolean {
    return this.isDisposed;
  }

  /** Schedules the next animation frame while running. */
  private scheduleNextFrame(): void {
    this.animationFrameId = requestAnimationFrame(this.boundOnAnimationFrame);
  }

  /** Advances one frame of viewport updates and multi-view rendering. */
  private onAnimationFrame(): void {
    if (
      !this.isRunning ||
      this.isDisposed ||
      !this.getActiveViewports ||
      !this.multiViewComposer ||
      !this.sharedScene
    ) {
      this.animationFrameId = null;
      return;
    }
    notificationFrameEvents.beginFrame();
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const activeViewports = this.getActiveViewports();
    this.updatePerspectiveViewports(activeViewports, delta);
    this.cameraFitCoordinator?.updateAnimations();
    this.editorOrientationCoordinator?.updateAnimations();
    this.onBeforeRender?.();
    this.updateClipPreviewScales(activeViewports);
    this.gridOrientationHandler?.updatePreviewScreenScales();
    this.renderMultiView(activeViewports);
    this.afterRenderRun();
    this.updateMouseCursorForFrame();
    controllerAudioPlayback.endFrame();
    this.scheduleNextFrame();
  }

  /**
   * Shape Editor repaint cursor path: after tools/widgets OnRender re-issue
   * SetMouseCursor, keep the last request for this frame or restore default.
   * Bounds hover / active-drag cursor re-issue happens in
   * BoxSelectTool.onRender via editorWindow onRepaint (onBeforeRender).
   */
  private updateMouseCursorForFrame(): void {
    this.transformHandler?.refreshBoundsHoverCursor();
    managerMouseCursor.update();
  }

  /**
   * Prepares and scissor-renders every active pane through the shared surface.
   *
   * @param viewports Active panes.
   */
  private renderMultiView(viewports: readonly ViewportEditor[]): void {
    if (!this.multiViewComposer || !this.sharedScene) return;
    this.syncMultiViewPasses(viewports);
    this.multiViewComposer.render(this.sharedScene.getScene(), this.multiViewPasses, Theme.separatorColor);
  }

  /**
   * Refreshes reusable pass slots for the active viewport list without
   * allocating pass objects or per-frame closures.
   *
   * @param viewports Active panes this frame.
   */
  private syncMultiViewPasses(viewports: readonly ViewportEditor[]): void {
    this.ensurePassPoolCount(viewports.length);
    this.multiViewPasses.length = viewports.length;
    for (let i = 0; i < viewports.length; i++) {
      const pass = this.multiViewPassPool[i]!;
      this.writePassFields(pass, viewports[i]!);
      this.multiViewPasses[i] = pass;
    }
  }

  /**
   * Grows the pass pool until it can hold the required number of panes. Pool
   * slots are never discarded when the active count shrinks.
   *
   * @param requiredCount Number of active panes.
   */
  private ensurePassPoolCount(requiredCount: number): void {
    while (this.multiViewPassPool.length < requiredCount) {
      this.multiViewPassPool.push(this.createPassSlot());
    }
  }

  /**
   * Creates one reusable pass with stable prepare/finalize/sync closures.
   *
   * @returns Pass slot owned by the loop.
   */
  private createPassSlot(): ReusableMultiViewPass {
    const pass = {} as ReusableMultiViewPass;
    pass.viewport = null as unknown as ViewportEditor;
    pass.camera = null as unknown as THREE.Camera;
    pass.contentElement = null as unknown as HTMLElement;
    pass.syncCameraSize = (width: number, height: number) => {
      pass.viewport.resize(width, height);
    };
    pass.prepare = () => {
      this.prepareViewportPass(pass.viewport);
    };
    pass.finalize = () => {
      this.finalizeViewportPass(pass.viewport);
    };
    return pass;
  }

  /**
   * Updates camera and DOM fields for a pass slot from the live viewport.
   *
   * @param pass Reusable pass slot.
   * @param viewport Source viewport for this pane.
   */
  private writePassFields(pass: ReusableMultiViewPass, viewport: ViewportEditor): void {
    pass.viewport = viewport;
    pass.camera = viewport.getCamera();
    pass.contentElement = viewport.getContentElement();
  }

  /**
   * Prepares pane-local helpers and isolates this pane's CAD rulers.
   *
   * @param viewport Active multi-view pane.
   */
  private prepareViewportPass(viewport: ViewportEditor): void {
    this.cadRulerSystem?.prepareForCamera(viewport.getCamera());
    this.prepareGizmoScreenSpace(viewport);
    viewport.prepareRender();
    this.onViewportPrepare?.(viewport);
  }

  /**
   * Sizes gizmo handles for the active pane camera only: bounds grips and
   * translate/rotate/scale clones. Each pane uses its own camera so 2D zoom
   * stays independent of 3D fly distance.
   *
   * @param viewport Active multi-view pane.
   */
  private prepareGizmoScreenSpace(viewport: ViewportEditor): void {
    if (!this.transformGizmo) return;
    if (typeof viewport.getGizmoGroup !== 'function') return;
    if (typeof viewport.getViewportKind !== 'function') return;
    const group = viewport.getGizmoGroup();
    if (!group) return;
    const camera = viewport.getCamera();
    const content = viewport.getContentElement();
    const height = Math.max(1, content.clientHeight || content.offsetHeight || 512);
    const viewPlane = getCadViewPlaneForKind(viewport.getViewportKind());
    this.transformGizmo.prepareTransformCloneForCamera(group, camera);
    this.transformGizmo.prepareBoundsCloneForCamera(group, camera, viewPlane, height);
  }

  /**
   * Hides pane-local helpers and shared-scene CAD rulers after the scissor
   * pass.
   *
   * @param viewport Active multi-view pane.
   */
  private finalizeViewportPass(viewport: ViewportEditor): void {
    const candidate = viewport as ViewportEditor & { endRenderPass?: () => void };
    candidate.endRenderPass?.();
    this.cadRulerSystem?.endCameraPass();
  }

  /**
   * Advances flying-camera simulation for every active perspective viewport.
   *
   * @param viewports Active viewports this frame.
   * @param delta Elapsed seconds.
   */
  private updatePerspectiveViewports(viewports: readonly ViewportEditor[], delta: number): void {
    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (!viewport) continue;
      if (isPerspectiveViewport(viewport)) {
        viewport.update(delta);
      }
    }
  }

  /**
   * Updates clip preview scales from the first active perspective camera.
   *
   * @param viewports Active viewports this frame.
   */
  private updateClipPreviewScales(viewports: readonly ViewportEditor[]): void {
    if (!this.clipPlaneHandler) return;
    const camera = this.findScaleCamera(viewports);
    if (camera) {
      this.clipPlaneHandler.updatePreviewScales(camera);
    }
  }

  /**
   * Picks the camera used for clip preview scaling (prefer perspective).
   *
   * @param viewports Active viewports this frame.
   * @returns Camera or undefined when no panes are active.
   */
  private findScaleCamera(viewports: readonly ViewportEditor[]): THREE.Camera | undefined {
    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (!viewport) continue;
      if (isPerspectiveViewport(viewport)) {
        return viewport.getCamera();
      }
    }
    return viewports[0]?.getCamera();
  }

  /** Disconnects the viewport resize observer when present. */
  private disconnectResizeObserver(): void {
    if (!this.resizeObserver) return;
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }
}
