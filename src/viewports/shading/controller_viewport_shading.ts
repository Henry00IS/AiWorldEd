import * as THREE from 'three';
import { ShadingMode } from '@/types/shading_mode.js';
import { RendererWireframeOverlay } from './renderer_wireframe_overlay.js';
import { applySharedShadingPass, invalidateSharedShadingPass } from '@/viewports/shared/shared_shading_pass.js';
import { applyContentWireframeVisibilityForRenderPass } from './content_wireframe_visibility.js';
import { ManagerProjectedGrid } from '@/viewports/grid/projected/manager_projected_grid.js';
import { prepareBrushOverlapMaterials } from './shading_brush_overlap_materials.js';
import { addMeshWireframeOverlays } from './mesh_wireframe_overlay.js';

/** Base interface for viewports that support shading mode control. */
export interface ShadableViewport {
  getScene(): THREE.Scene;
}

/**
 * Controls per-viewport shading mode preference, content wireframe visibility,
 * projected grid preference, and orange wireframe overlays. Material swaps on
 * the shared scene go through {@link applySharedShadingPass} so multi-view panes
 * do not thrash materials every frame.
 */
export class ControllerViewportShading {
  private readonly scene: THREE.Scene;
  private rendererWireframeOverlay: RendererWireframeOverlay;
  private currentMode: ShadingMode;
  private contentWireframesVisible: boolean;
  private projectedGridVisible: boolean;
  private meshWireframesVisible: boolean;
  private brushOverlapRestore: (() => void) | null;
  private meshWireframeRestore: (() => void) | null;

  /**
   * Creates a new shading controller for the given viewport.
   *
   * @param viewport The viewport whose scene will be managed.
   */
  constructor(viewport: ShadableViewport) {
    this.scene = viewport.getScene();
    this.rendererWireframeOverlay = new RendererWireframeOverlay(this.scene);
    this.currentMode = ShadingMode.SOLID;
    this.contentWireframesVisible = true;
    this.projectedGridVisible = true;
    this.meshWireframesVisible = false;
    this.brushOverlapRestore = null;
    this.meshWireframeRestore = null;
  }

  /**
   * Switches the viewport to the specified shading mode.
   *
   * @param mode The new shading mode to activate.
   * @param applyImmediately When false, only stores the preference (used while
   *   constructing orthographic panes so creating Quad View does not paint the
   *   shared scene black/wireframe before the next multi-view pass).
   */
  setShadingMode(mode: ShadingMode, applyImmediately: boolean = true): void {
    this.currentMode = mode;
    if (!applyImmediately) {
      this.updateOverlayVisibility(mode);
      return;
    }
    this.refreshShadingMode();
  }

  /**
   * Re-applies the current shading mode to all meshes in the scene. Call after
   * meshes are added or replaced so materials stay consistent.
   */
  refreshShadingMode(): void {
    applySharedShadingPass(this.scene, this.currentMode, true);
    this.updateOverlayVisibility(this.currentMode);
  }

  /**
   * Applies this viewport's shading for one multi-view pass. No-ops when the
   * shared scene already uses this mode (avoids full-editor material thrash).
   */
  applyForRenderPass(): void {
    applySharedShadingPass(this.scene, this.currentMode, false);
    this.updateOverlayVisibility(this.currentMode);
    this.brushOverlapPassBegin();
  }

  /**
   * Restores brush and CSG result materials changed for this pane's pass. Call
   * after the pane has been drawn.
   */
  endRenderPass(): void {
    this.meshWireframeRestore?.();
    this.meshWireframeRestore = null;
    this.brushOverlapRestore?.();
    this.brushOverlapRestore = null;
  }

  /**
   * Swaps brush hulls to overdraw materials and hides CSG results for this pass
   * when the Overlap mode is active.
   */
  private brushOverlapPassBegin(): void {
    this.endRenderPass();
    if (this.currentMode !== ShadingMode.OVERLAP) {
      return;
    }
    this.brushOverlapRestore = prepareBrushOverlapMaterials(this.scene, false);
  }

  /**
   * Applies content wireframe, final mesh wireframe, and projected-grid
   * visibility for this pane pass.
   *
   * @param worldRoot World group containing content and brush wireframes.
   */
  applyDisplayOverlaysForRenderPass(worldRoot: THREE.Object3D | null): void {
    if (worldRoot) {
      applyContentWireframeVisibilityForRenderPass(worldRoot, this.contentWireframesVisible);
      this.meshWireframePassBegin(worldRoot);
    }
    ManagerProjectedGrid.setVisibleForRenderPass(this.projectedGridVisible);
  }

  /**
   * Adds the final mesh triangle wireframe for this pass when enabled.
   *
   * @param worldRoot World group containing content.
   */
  private meshWireframePassBegin(worldRoot: THREE.Object3D): void {
    this.meshWireframeRestore?.();
    if (!this.meshWireframesVisible) {
      this.meshWireframeRestore = null;
      return;
    }
    const seeThrough = this.currentMode === ShadingMode.WIREFRAME || this.currentMode === ShadingMode.OVERLAP;
    this.meshWireframeRestore = addMeshWireframeOverlays(worldRoot, this.scene, seeThrough);
  }

  /**
   * Sets whether the triangle wireframe of the final meshes draws in this
   * viewport, in every shading mode.
   *
   * @param visible True to show the final mesh wireframe.
   */
  setMeshWireframesVisible(visible: boolean): void {
    this.meshWireframesVisible = visible;
  }

  /**
   * Returns whether the final mesh wireframe is enabled for this viewport.
   *
   * @returns True when the final mesh wireframe should draw.
   */
  areMeshWireframesVisible(): boolean {
    return this.meshWireframesVisible;
  }

  /**
   * Sets whether permanent content and brush wireframes draw in this viewport.
   *
   * @param visible True to show wireframes.
   */
  setContentWireframesVisible(visible: boolean): void {
    this.contentWireframesVisible = visible;
  }

  /**
   * Returns whether content and brush wireframes are enabled for this viewport.
   *
   * @returns True when wireframes should draw.
   */
  areContentWireframesVisible(): boolean {
    return this.contentWireframesVisible;
  }

  /**
   * Sets whether the projected surface grid draws in this viewport.
   *
   * @param visible True to show the projected grid.
   */
  setProjectedGridVisible(visible: boolean): void {
    this.projectedGridVisible = visible;
  }

  /**
   * Returns whether the projected surface grid is enabled for this viewport.
   *
   * @returns True when the projected grid should draw.
   */
  isProjectedGridVisible(): boolean {
    return this.projectedGridVisible;
  }

  /**
   * Updates the wireframe overlay visibility based on the target mode.
   *
   * @param mode The shading mode being activated.
   */
  private updateOverlayVisibility(mode: ShadingMode): void {
    if (mode === ShadingMode.WIREFRAME_OVERLAY) {
      this.rendererWireframeOverlay.setVisible(true);
    } else {
      this.rendererWireframeOverlay.setVisible(false);
    }
  }

  /**
   * Returns the currently active shading mode.
   *
   * @returns The current ShadingMode value.
   */
  getShadingMode(): ShadingMode {
    return this.currentMode;
  }

  /**
   * Updates the wireframe overlay with the current mesh list. Invalidates the
   * shared shading pass so the next pane prepare re-applies materials. Does not
   * force-apply this viewport's mode immediately: walking every pane and
   * force-applying left the shared scene stuck on the last (often 2D wireframe)
   * mode, so brush rebuilds between frames baked black override colors.
   *
   * @param meshes The meshes to generate overlays for.
   */
  updateMeshes(meshes: THREE.Mesh[]): void {
    this.rendererWireframeOverlay.setMeshes(meshes);
    invalidateSharedShadingPass();
    this.updateOverlayVisibility(this.currentMode);
  }

  /** Keeps wireframe overlays glued to their meshes during live transforms. */
  syncOverlayTransforms(): void {
    this.rendererWireframeOverlay.syncTransforms();
  }

  /** Cleans up overlay resources held by this controller. */
  dispose(): void {
    this.endRenderPass();
    this.rendererWireframeOverlay.dispose();
  }
}
