import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { CameraFitCoordinator } from './camera_fit_coordinator.js';
import { ClipPlaneHandler } from './clip_plane_handler.js';

/**
 * Owns the editor animation frame loop and resize disconnect helpers.
 */
export class LayoutRenderLoop {
  private isRunning: boolean;
  private isDisposed: boolean;
  private animationFrameId: number | null;
  private lastTime: number;
  private resizeObserver: ResizeObserver | null;
  private viewport3D: Viewport3D | null;
  private viewport2DTop: Viewport2D | null;
  private viewport2DFront: Viewport2D | null;
  private viewport2DSide: Viewport2D | null;
  private cameraFitCoordinator: CameraFitCoordinator | null;
  private clipPlaneHandler: ClipPlaneHandler | null;
  private onBeforeRender: (() => void) | null;

  /**
   * Creates an idle render loop.
   */
  constructor() {
    this.isRunning = false;
    this.isDisposed = false;
    this.animationFrameId = null;
    this.lastTime = 0;
    this.resizeObserver = null;
    this.viewport3D = null;
    this.viewport2DTop = null;
    this.viewport2DFront = null;
    this.viewport2DSide = null;
    this.cameraFitCoordinator = null;
    this.clipPlaneHandler = null;
    this.onBeforeRender = null;
  }

  /**
   * Binds viewports and coordinators used each frame.
   * @param parts Live layout subsystems for the render path.
   */
  bind(parts: {
    viewport3D: Viewport3D;
    viewport2DTop: Viewport2D;
    viewport2DFront: Viewport2D;
    viewport2DSide: Viewport2D;
    cameraFitCoordinator: CameraFitCoordinator;
    clipPlaneHandler: ClipPlaneHandler | null;
    onBeforeRender: () => void;
  }): void {
    this.viewport3D = parts.viewport3D;
    this.viewport2DTop = parts.viewport2DTop;
    this.viewport2DFront = parts.viewport2DFront;
    this.viewport2DSide = parts.viewport2DSide;
    this.cameraFitCoordinator = parts.cameraFitCoordinator;
    this.clipPlaneHandler = parts.clipPlaneHandler;
    this.onBeforeRender = parts.onBeforeRender;
  }

  /**
   * Updates the clip handler used for preview scale each frame.
   * @param handler Clip plane handler or null.
   */
  setClipPlaneHandler(handler: ClipPlaneHandler | null): void {
    this.clipPlaneHandler = handler;
  }

  /**
   * Watches viewport elements and invokes a resize callback.
   * @param viewports Viewport root elements.
   * @param onResize Resize handler.
   */
  watchResize(viewports: HTMLElement[], onResize: () => void): void {
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => onResize());
    });
    viewports.forEach((viewport) => this.resizeObserver?.observe(viewport));
  }

  /**
   * Starts the continuous render loop.
   */
  start(): void {
    if (this.isRunning || this.isDisposed) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  /**
   * Stops the render loop without disposing resources.
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Stops the loop and disconnects resize observation.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stop();
    this.disconnectResizeObserver();
  }

  /**
   * Returns whether the loop has been disposed.
   * @returns True when disposed.
   */
  getIsDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Schedules the next animation frame while running.
   */
  private scheduleNextFrame(): void {
    this.animationFrameId = requestAnimationFrame(() => this.onAnimationFrame());
  }

  /**
   * Advances one frame of viewport updates and rendering.
   */
  private onAnimationFrame(): void {
    if (!this.isRunning || this.isDisposed || !this.viewport3D) {
      this.animationFrameId = null;
      return;
    }
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.viewport3D.update(delta);
    this.cameraFitCoordinator?.updateAnimations();
    this.onBeforeRender?.();
    this.clipPlaneHandler?.updatePreviewScales(this.viewport3D.getCamera());
    this.viewport2DTop?.render();
    this.viewport2DFront?.render();
    this.viewport2DSide?.render();
    this.viewport3D.render();
    this.scheduleNextFrame();
  }

  /**
   * Disconnects the viewport resize observer when present.
   */
  private disconnectResizeObserver(): void {
    if (!this.resizeObserver) return;
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }
}
