import * as THREE from 'three';
import { ShadingMode } from '../types/shading_mode.js';
import { ShadingModeManager } from './shading_mode_manager.js';
import { WireframeOverlayRenderer } from './wireframe_overlay_renderer.js';

/**
 * Base interface for viewports that support shading mode control.
 */
export interface ShadableViewport {
  getScene(): THREE.Scene;
}

/**
 * Controls shading mode for a single viewport.
 * Coordinates between ShadingModeManager and WireframeOverlayRenderer
 * to apply the correct visual style.
 */
export class ViewportShadingController {
  private shadingModeManager: ShadingModeManager;
  private wireframeOverlayRenderer: WireframeOverlayRenderer;
  private currentMode: ShadingMode;

  /**
   * Creates a new shading controller for the given viewport.
   * @param viewport The viewport whose scene will be managed.
   */
  constructor(viewport: ShadableViewport) {
    const scene = viewport.getScene();
    this.shadingModeManager = new ShadingModeManager(scene);
    this.wireframeOverlayRenderer = new WireframeOverlayRenderer(scene);
    this.currentMode = ShadingMode.SOLID;
    this.shadingModeManager.snapshotMaterials();
  }

  /**
   * Switches the viewport to the specified shading mode.
   * @param mode The new shading mode to activate.
   */
  setShadingMode(mode: ShadingMode): void {
    this.currentMode = mode;
    this.refreshShadingMode();
  }

  /**
   * Re-applies the current shading mode to all meshes in the scene.
   * Call after meshes are cloned or replaced so materials stay consistent.
   */
  refreshShadingMode(): void {
    this.shadingModeManager.snapshotMaterials();
    this.shadingModeManager.setMode(this.currentMode);
    this.updateOverlayVisibility(this.currentMode);
  }

  /**
   * Updates the wireframe overlay visibility based on the target mode.
   * @param mode The shading mode being activated.
   */
  private updateOverlayVisibility(mode: ShadingMode): void {
    if (mode === ShadingMode.WIREFRAME_OVERLAY) {
      this.wireframeOverlayRenderer.setVisible(true);
    } else {
      this.wireframeOverlayRenderer.setVisible(false);
    }
  }

  /**
   * Returns the currently active shading mode.
   * @returns The current ShadingMode value.
   */
  getShadingMode(): ShadingMode {
    return this.currentMode;
  }

  /**
   * Updates the wireframe overlay with the current mesh list.
   * Should be called when the scene content changes.
   * @param meshes The meshes to generate overlays for.
   */
  updateMeshes(meshes: THREE.Mesh[]): void {
    this.wireframeOverlayRenderer.setMeshes(meshes);
    this.refreshShadingMode();
  }

  /**
   * Keeps wireframe overlays glued to their meshes during live transforms.
   */
  syncOverlayTransforms(): void {
    this.wireframeOverlayRenderer.syncTransforms();
  }

  /**
   * Cleans up all resources held by this controller.
   */
  dispose(): void {
    this.shadingModeManager.dispose();
    this.wireframeOverlayRenderer.dispose();
  }
}
