import type * as THREE from 'three';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { getCadViewPlaneForKind, isPerspectiveViewport } from '../../viewports/editor_viewport.js';
import { CameraFitCoordinator } from '../camera/camera_fit_coordinator.js';
import { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import { MultiViewComposer, type MultiViewPanePass } from '../../viewports/multi_view_composer.js';
import type { SharedWorldScene } from '../../viewports/shared_world_scene.js';
import type { CadRulerSystem } from '../../rulers/cad_ruler_system.js';
import type { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { Theme } from '../../theme.js';

/**
 * Mutable multi-view pass with a stable viewport reference so per-frame
 * closures can be created once and reused.
 */
interface ReusableMultiViewPass extends MultiViewPanePass {
  viewport: EditorViewport;
}

/** Owns the editor animation frame loop and resize disconnect helpers. */
export class LayoutRenderLoop {
  private isRunning: boolean;
  private isDisposed: boolean;
  private animationFrameId: number | null;
  private lastTime: number;
  private resizeObserver: ResizeObserver | null;
  private getActiveViewports: (() => readonly EditorViewport[]) | null;
  private cameraFitCoordinator: CameraFitCoordinator | null;
  private clipPlaneHandler: ClipPlaneHandler | null;
  private cadRulerSystem: CadRulerSystem | null;
  private transformGizmo: TransformGizmo | null;
  private onBeforeRender: (() => void) | null;
  private multiViewComposer: MultiViewComposer | null;
  private sharedScene: SharedWorldScene | null;
  private afterNextRenderCallback: (() => void) | null;
  private boundOnAnimationFrame: () => void;
  private multiViewPassPool: ReusableMultiViewPass[];
  private multiViewPasses: ReusableMultiViewPass[];

  /** Creates an idle render loop. */
  constructor() {
    this.isRunning = false;
    this.isDisposed = false;
    this.animationFrameId = null;
    this.lastTime = 0;
    this.resizeObserver = null;
    this.getActiveViewports = null;
    this.cameraFitCoordinator = null;
    this.clipPlaneHandler = null;
    this.cadRulerSystem = null;
    this.transformGizmo = null;
    this.onBeforeRender = null;
    this.multiViewComposer = null;
    this.sharedScene = null;
    this.afterNextRenderCallback = null;
    this.boundOnAnimationFrame = () => this.onAnimationFrame();
    this.multiViewPassPool = [];
    this.multiViewPasses = [];
  }

  /**
   * Binds viewports and shared multi-view resources used each frame. Surface
   * and workspace sizing stay on MultiViewComposer / watchResize.
   *
   * @param parts Live layout subsystems for the render path.
   */
  bind(parts: {
    getActiveViewports: () => readonly EditorViewport[];
    cameraFitCoordinator: CameraFitCoordinator;
    clipPlaneHandler: ClipPlaneHandler | null;
    cadRulerSystem?: CadRulerSystem | null;
    transformGizmo?: TransformGizmo | null;
    onBeforeRender: () => void;
    multiViewComposer: MultiViewComposer;
    sharedScene: SharedWorldScene;
  }): void {
    this.getActiveViewports = parts.getActiveViewports;
    this.cameraFitCoordinator = parts.cameraFitCoordinator;
    this.clipPlaneHandler = parts.clipPlaneHandler;
    this.cadRulerSystem = parts.cadRulerSystem ?? null;
    this.transformGizmo = parts.transformGizmo ?? null;
    this.onBeforeRender = parts.onBeforeRender;
    this.multiViewComposer = parts.multiViewComposer;
    this.sharedScene = parts.sharedScene;
  }

  /**
   * Updates the clip handler used for preview scale each frame.
   *
   * @param handler Clip plane handler or null.
   */
  setClipPlaneHandler(handler: ClipPlaneHandler | null): void {
    this.clipPlaneHandler = handler;
  }

  /**
   * Runs a callback after the next successful multi-view render.
   *
   * @param callback One-shot callback to invoke after rendering.
   */
  runAfterNextRender(callback: () => void): void {
    this.afterNextRenderCallback = callback;
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
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const activeViewports = this.getActiveViewports();
    this.updatePerspectiveViewports(activeViewports, delta);
    this.cameraFitCoordinator?.updateAnimations();
    this.onBeforeRender?.();
    this.updateClipPreviewScales(activeViewports);
    this.renderMultiView(activeViewports);
    this.notifyAfterRender();
    this.scheduleNextFrame();
  }

  /** Runs and clears the one-shot post-render callback. */
  private notifyAfterRender(): void {
    const callback = this.afterNextRenderCallback;
    this.afterNextRenderCallback = null;
    callback?.();
  }

  /**
   * Prepares and scissor-renders every active pane through the shared surface.
   *
   * @param viewports Active panes.
   */
  private renderMultiView(viewports: readonly EditorViewport[]): void {
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
  private syncMultiViewPasses(viewports: readonly EditorViewport[]): void {
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
    pass.viewport = null as unknown as EditorViewport;
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
  private writePassFields(pass: ReusableMultiViewPass, viewport: EditorViewport): void {
    pass.viewport = viewport;
    pass.camera = viewport.getCamera();
    pass.contentElement = viewport.getContentElement();
  }

  /**
   * Prepares pane-local helpers and isolates this pane's CAD rulers.
   *
   * @param viewport Active multi-view pane.
   */
  private prepareViewportPass(viewport: EditorViewport): void {
    this.cadRulerSystem?.prepareForCamera(viewport.getCamera());
    this.prepareGizmoScreenSpace(viewport);
    viewport.prepareRender();
  }

  /**
   * Sizes gizmo handles for the active pane camera only: bounds grips and
   * translate/rotate/scale clones. Each pane uses its own camera so 2D zoom
   * stays independent of 3D fly distance.
   *
   * @param viewport Active multi-view pane.
   */
  private prepareGizmoScreenSpace(viewport: EditorViewport): void {
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
  private finalizeViewportPass(viewport: EditorViewport): void {
    const candidate = viewport as EditorViewport & { endRenderPass?: () => void };
    candidate.endRenderPass?.();
    this.cadRulerSystem?.endCameraPass();
  }

  /**
   * Advances flying-camera simulation for every active perspective viewport.
   *
   * @param viewports Active viewports this frame.
   * @param delta Elapsed seconds.
   */
  private updatePerspectiveViewports(viewports: readonly EditorViewport[], delta: number): void {
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
  private updateClipPreviewScales(viewports: readonly EditorViewport[]): void {
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
  private findScaleCamera(viewports: readonly EditorViewport[]): THREE.Camera | undefined {
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
