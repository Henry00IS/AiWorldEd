import * as THREE from 'three';
import { getActiveThemeViewportPalette, type ThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { ViewportBackgroundGradient } from '@/viewports/theme/viewport_background_gradient.js';
import { createEditorWebGLCanvas, getEditorWebGLRendererOptions } from '@/viewports/webgl/webgl_renderer_options.js';
import { markWebGLContextLossAsIntentional } from '@/viewports/webgl/webgl_context_diagnostics.js';
import { isDrawableRect } from '@/viewports/pane/pane_content_rect.js';
import type { RenderSurface, SurfaceRenderPane } from './render_surface.js';

/**
 * Positions a workspace canvas to fill the host box exactly (no independent
 * pixel width that can drift 1px from the pane grid).
 *
 * @param canvas Shared workspace canvas element.
 */
export function applySharedWorkspaceCanvasLayout(canvas: HTMLCanvasElement): void {
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
}

/** Optional construction overrides for shared workspace surfaces. */
export interface SharedWebGLSurfaceOptions {
  /**
   * Diagnostic owner name for context-loss logs. Defaults to shared_workspace.
   * Detached popups should use a distinct name such as detached_viewport.
   */
  ownerName?: string;
}

/**
 * Single-canvas WebGL surface for the main editor workspace. All in-window
 * panes scissor-render through this surface. Also used for detached popups with
 * a distinct owner name.
 */
export class SharedWebGLSurface implements RenderSurface {
  private readonly workspaceElement: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly logicalSize: THREE.Vector2;
  private isDisposed: boolean;
  private backgroundGradient: ViewportBackgroundGradient | null;

  /**
   * Creates a surface and appends its canvas behind chrome in the workspace.
   *
   * @param workspaceElement Non-grid host that fills the viewport region.
   * @param options Optional owner name for diagnostics.
   */
  constructor(workspaceElement: HTMLElement, options: SharedWebGLSurfaceOptions = {}) {
    this.isDisposed = false;
    this.backgroundGradient = null;
    this.workspaceElement = workspaceElement;
    this.logicalSize = new THREE.Vector2(1, 1);
    const ownerName = options.ownerName ?? 'shared_workspace';
    this.canvas = createEditorWebGLCanvas(ownerName, workspaceElement.ownerDocument);
    applySharedWorkspaceCanvasLayout(this.canvas);
    workspaceElement.style.position = workspaceElement.style.position || 'relative';
    workspaceElement.insertBefore(this.canvas, workspaceElement.firstChild);
    this.renderer = new THREE.WebGLRenderer({
      ...getEditorWebGLRendererOptions({ alpha: false, antialias: true }),
      canvas: this.canvas,
    });
    const ownerWindow = workspaceElement.ownerDocument.defaultView ?? window;
    this.renderer.setPixelRatio(Math.min(ownerWindow.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setScissorTest(true);
    this.renderer.autoClear = false;
    this.syncSizeFromWorkspace();
  }

  /**
   * Returns the shared WebGL renderer.
   *
   * @returns Renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Returns the workspace canvas.
   *
   * @returns Canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Returns the workspace host used for layout measurement.
   *
   * @returns Workspace HTML element.
   */
  getWorkspaceElement(): HTMLElement {
    return this.workspaceElement;
  }

  /**
   * Returns the last logical size used for setSize / setViewport.
   *
   * @returns Width and height in logical CSS pixels.
   */
  getLogicalSize(): { width: number; height: number } {
    return { width: this.logicalSize.x, height: this.logicalSize.y };
  }

  /**
   * Resizes the drawing buffer to the workspace client size. Canvas CSS stays
   * 100% of the host so DOM panes and the buffer share the same box.
   *
   * @param cssWidth CSS width in pixels.
   * @param cssHeight CSS height in pixels.
   */
  resize(cssWidth: number, cssHeight: number): void {
    if (this.isDisposed) return;
    const width = Math.max(1, Math.floor(cssWidth));
    const height = Math.max(1, Math.floor(cssHeight));
    if (width === this.logicalSize.x && height === this.logicalSize.y) {
      this.applyCanvasFillStyles();
      return;
    }
    this.logicalSize.set(width, height);
    this.renderer.setSize(width, height, false);
    this.applyCanvasFillStyles();
  }

  /** Syncs the drawing buffer from the workspace host client box. */
  syncSizeFromWorkspace(): void {
    if (this.isDisposed) return;
    const width = Math.max(1, this.workspaceElement.clientWidth);
    const height = Math.max(1, this.workspaceElement.clientHeight);
    this.resize(width, height);
  }

  /**
   * Clears the full canvas then scissor-renders each pane.
   *
   * @param scene Shared editor scene.
   * @param panes Active pane passes.
   * @param clearColor Hex clear color for the full canvas (separators).
   */
  renderPanes(scene: THREE.Scene, panes: readonly SurfaceRenderPane[], clearColor: number): void {
    if (this.isDisposed) return;
    this.syncSizeFromWorkspace();
    const logicalWidth = Math.max(1, this.logicalSize.x);
    const logicalHeight = Math.max(1, this.logicalSize.y);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, logicalWidth, logicalHeight);
    this.renderer.setClearColor(clearColor, 1);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    const viewportPalette = getActiveThemeViewportPalette();
    for (const pane of panes) {
      if (!isDrawableRect(pane.viewportRect)) continue;
      const { x, y, width, height } = pane.viewportRect;
      this.renderer.setViewport(x, y, width, height);
      this.renderer.setScissor(x, y, width, height);
      this.renderer.setClearColor(viewportPalette.viewportBackground, 1);
      this.renderer.clear(true, true, true);
      this.paneBackgroundGradientRender(viewportPalette);
      pane.prepare?.();
      this.renderer.render(scene, pane.camera);
      pane.finalize?.();
    }
  }

  /**
   * Draws the theme's soft background gradient into the current pane when the
   * theme defines one.
   *
   * @param viewportPalette Active viewport palette.
   */
  private paneBackgroundGradientRender(viewportPalette: ThemeViewportPalette): void {
    const topColor = viewportPalette.viewportGradientTop;
    const bottomColor = viewportPalette.viewportGradientBottom;
    if (topColor === null || bottomColor === null) {
      return;
    }
    this.backgroundGradient ??= new ViewportBackgroundGradient();
    this.backgroundGradient.render(this.renderer, topColor, bottomColor);
  }

  /** Disposes the renderer and removes the canvas. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.backgroundGradient?.dispose();
    this.backgroundGradient = null;
    markWebGLContextLossAsIntentional(this.canvas);
    this.renderer.dispose();
    if (typeof this.renderer.forceContextLoss === 'function') {
      this.renderer.forceContextLoss();
    }
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  /** Keeps the canvas CSS box identical to the workspace host. */
  private applyCanvasFillStyles(): void {
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }
}
