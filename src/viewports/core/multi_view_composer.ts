import * as THREE from 'three';
import {
  type PaneCssRect,
  type PaneLogicalRect,
  cssRectToLogicalRectInto,
  measureRelativeCssRectInto,
} from '@/viewports/pane/pane_content_rect.js';
import type { RenderSurface, SurfaceRenderPane } from '@/viewports/shared/render_surface.js';
import { viewportWorkspaceSeparatorClearColor } from './viewport_workspace_chrome.js';

/** Pane contribution for one multi-view frame. */
export interface MultiViewPanePass {
  camera: THREE.Camera;
  /**
   * Drawable DOM box for this pane (content under the title bar). Scissor and
   * camera aspect use this box so GL does not draw under chrome.
   */
  contentElement: HTMLElement;
  /**
   * Optional camera resize using the exact scissor pixel size (keeps grids
   * sharp by matching projection to the drawable box).
   *
   * @param width Scissor width in logical pixels.
   * @param height Scissor height in logical pixels.
   */
  syncCameraSize?: (width: number, height: number) => void;
  /** Optional prepare hook (grids, shading, gizmo visibility). */
  prepare?: () => void;
  /** Optional finalize hook after the pane is drawn. */
  finalize?: () => void;
}

/** Builds scissor passes and draws all active panes through one render surface. */
export class MultiViewComposer {
  private surface: RenderSurface;
  private surfacePanePool: SurfaceRenderPane[];
  private surfacePanes: SurfaceRenderPane[];
  private scratchCssRect: PaneCssRect;
  private scratchLogicalRect: PaneLogicalRect;

  /**
   * Creates a composer bound to a render surface.
   *
   * @param surface Shared workspace surface (or future detached surface).
   */
  constructor(surface: RenderSurface) {
    this.surface = surface;
    this.surfacePanePool = [];
    this.surfacePanes = [];
    this.scratchCssRect = { left: 0, top: 0, width: 0, height: 0 };
    this.scratchLogicalRect = { x: 0, y: 0, width: 0, height: 0 };
  }

  /**
   * Rebinds the composer to a different surface.
   *
   * @param surface New render surface.
   */
  setSurface(surface: RenderSurface): void {
    this.surface = surface;
  }

  /**
   * Renders every provided pane into the shared surface, clearing the gaps
   * between panes to the active theme's separator colour. Every window renders
   * through here, so the separator colour has a single source.
   *
   * @param scene Shared editor scene.
   * @param panes Active multi-view panes.
   */
  render(scene: THREE.Scene, panes: readonly MultiViewPanePass[]): void {
    const clearColor = viewportWorkspaceSeparatorClearColor();
    this.surface.syncSizeFromWorkspace();
    const canvas = this.surface.getCanvas();
    const logicalSize = this.surface.getLogicalSize();
    this.syncSurfacePanes(panes, canvas, logicalSize.width, logicalSize.height);
    this.surface.renderPanes(scene, this.surfacePanes, clearColor);
  }

  /**
   * Fills reusable surface panes for the current multi-view frame.
   *
   * @param panes Active multi-view pane passes.
   * @param canvas Drawing canvas used as the scissor origin.
   * @param logicalWidth Surface logical width.
   * @param logicalHeight Surface logical height.
   */
  private syncSurfacePanes(
    panes: readonly MultiViewPanePass[],
    canvas: HTMLCanvasElement,
    logicalWidth: number,
    logicalHeight: number,
  ): void {
    this.ensureSurfacePanePoolCount(panes.length);
    this.surfacePanes.length = panes.length;
    for (let i = 0; i < panes.length; i++) {
      const surfacePane = this.surfacePanePool[i]!;
      this.writeSurfacePane(surfacePane, panes[i]!, canvas, logicalWidth, logicalHeight);
      this.surfacePanes[i] = surfacePane;
    }
  }

  /**
   * Grows the surface-pane pool until it can hold the required count. Pool
   * slots are never discarded when the active count shrinks.
   *
   * @param requiredCount Number of active panes.
   */
  private ensureSurfacePanePoolCount(requiredCount: number): void {
    while (this.surfacePanePool.length < requiredCount) {
      this.surfacePanePool.push(this.createSurfacePaneSlot());
    }
  }

  /**
   * Creates one reusable surface pane with its own viewport rect object.
   *
   * @returns Empty surface pane slot.
   */
  private createSurfacePaneSlot(): SurfaceRenderPane {
    return {
      camera: null as unknown as THREE.Camera,
      viewportRect: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  /**
   * Writes camera, rect, and optional hooks into a reusable surface pane.
   *
   * @param surfacePane Destination surface pane.
   * @param pane Source multi-view pass.
   * @param canvas Drawing canvas used as the scissor origin.
   * @param logicalWidth Surface logical width.
   * @param logicalHeight Surface logical height.
   */
  private writeSurfacePane(
    surfacePane: SurfaceRenderPane,
    pane: MultiViewPanePass,
    canvas: HTMLCanvasElement,
    logicalWidth: number,
    logicalHeight: number,
  ): void {
    this.measurePaneRectInto(pane.contentElement, canvas, logicalWidth, logicalHeight, surfacePane.viewportRect);
    surfacePane.camera = pane.camera;
    this.assignOptionalHooks(surfacePane, pane);
    const rect = surfacePane.viewportRect;
    if (rect.width > 0 && rect.height > 0) {
      pane.syncCameraSize?.(rect.width, rect.height);
    }
  }

  /**
   * Measures a pane content element into an existing logical rect.
   *
   * @param contentElement Pane content hit target.
   * @param canvas Drawing canvas used as the scissor origin.
   * @param logicalWidth Surface logical width.
   * @param logicalHeight Surface logical height.
   * @param out Destination logical rect.
   */
  private measurePaneRectInto(
    contentElement: HTMLElement,
    canvas: HTMLCanvasElement,
    logicalWidth: number,
    logicalHeight: number,
    out: PaneLogicalRect,
  ): void {
    measureRelativeCssRectInto(contentElement, canvas, this.scratchCssRect);
    cssRectToLogicalRectInto(this.scratchCssRect, logicalWidth, logicalHeight, this.scratchLogicalRect);
    out.x = this.scratchLogicalRect.x;
    out.y = this.scratchLogicalRect.y;
    out.width = this.scratchLogicalRect.width;
    out.height = this.scratchLogicalRect.height;
  }

  /**
   * Copies optional prepare/finalize hooks, clearing them when absent.
   *
   * @param surfacePane Destination surface pane.
   * @param pane Source multi-view pass.
   */
  private assignOptionalHooks(surfacePane: SurfaceRenderPane, pane: MultiViewPanePass): void {
    if (pane.prepare) {
      surfacePane.prepare = pane.prepare;
    } else {
      delete surfacePane.prepare;
    }
    if (pane.finalize) {
      surfacePane.finalize = pane.finalize;
    } else {
      delete surfacePane.finalize;
    }
  }
}
