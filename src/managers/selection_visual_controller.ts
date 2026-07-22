import * as THREE from 'three';
import { Theme } from '../theme.js';
import { SelectionManager } from './selection_manager.js';
import { SelectionHighlight } from '../selection/selection_highlight.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';
import { ViewportShadingController } from '../viewports/viewport_shading_controller.js';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';

/**
 * Owns selection outline instances across all viewports.
 * Keeps orange outlines glued to meshes during live transforms and after clone rebuilds.
 */
export class SelectionVisualController {
  private selectionManager: SelectionManager;
  private viewportSyncManager: ViewportSyncManager;
  private selectionHighlights: SelectionHighlight[];
  private shadingControllers: ViewportShadingController[];

  /**
   * Creates a selection visual controller.
   * @param selectionManager The shared selection state.
   * @param viewportSyncManager Used to find 2D clone meshes for a world mesh.
   */
  constructor(
    selectionManager: SelectionManager,
    viewportSyncManager: ViewportSyncManager
  ) {
    this.selectionManager = selectionManager;
    this.viewportSyncManager = viewportSyncManager;
    this.selectionHighlights = [];
    this.shadingControllers = [];
  }

  /**
   * Creates highlight instances for each viewport and wires selection change updates.
   * @param viewports All editor viewports that need selection outlines.
   */
  wireViewports(viewports: Array<Viewport3D | Viewport2D>): void {
    viewports.forEach((viewport) => {
      viewport.setSelectionManager(this.selectionManager);
      const highlight = new SelectionHighlight(viewport.getScene(), Theme);
      viewport.setSelectionHighlight(highlight);
      this.selectionHighlights.push(highlight);
    });
    this.selectionManager.onSelectionChanged(() => this.refreshFromSelection());
  }

  /**
   * Stores shading controllers so wireframe overlays can sync during transforms.
   * @param controllers Per-viewport shading controllers.
   */
  setShadingControllers(controllers: ViewportShadingController[]): void {
    this.shadingControllers = controllers;
  }

  /**
   * Rebuilds selection outlines for the current selection set.
   */
  refreshFromSelection(): void {
    this.clearAllHighlights();
    const selected = this.selectionManager.getSelectedObjects();
    selected.forEach((mesh) => this.highlightMeshAndClones(mesh));
  }

  /**
   * Re-applies outlines after 2D viewport clones are rebuilt.
   */
  reapplyAfterViewportSync(): void {
    this.refreshFromSelection();
  }

  /**
   * Rebuilds outline geometry for every currently highlighted mesh.
   * Call after extrude/CSG so orange edges match the new mesh shape.
   */
  rebuildHighlightGeometries(): void {
    this.selectionHighlights.forEach((highlight) => highlight.rebuildGeometries());
  }

  /**
   * Keeps outlines and shading wireframes glued to meshes during live drag.
   */
  syncDuringTransform(): void {
    this.selectionHighlights.forEach((highlight) => highlight.syncTransforms());
    this.shadingControllers.forEach((controller) =>
      controller.syncOverlayTransforms()
    );
  }

  /**
   * Disposes all highlight resources.
   */
  dispose(): void {
    this.selectionHighlights.forEach((highlight) => highlight.dispose());
    this.selectionHighlights = [];
  }

  /**
   * Highlights a world mesh and every matching 2D clone.
   * @param mesh The world mesh to outline.
   */
  private highlightMeshAndClones(mesh: THREE.Mesh): void {
    this.applyHighlightToMesh(mesh);
    this.viewportSyncManager
      .findCloneMeshesForWorldUuid(mesh.uuid)
      .forEach((clone) => this.applyHighlightToMesh(clone));
  }

  /**
   * Applies a highlight only in the viewport scene that owns this mesh.
   * Each mesh gets at most one orange outline child (not one per viewport).
   * @param mesh The mesh to highlight.
   */
  private applyHighlightToMesh(mesh: THREE.Mesh): void {
    this.selectionHighlights.forEach((highlight) => {
      highlight.apply(mesh);
    });
  }

  /**
   * Clears outlines from every highlight instance.
   */
  private clearAllHighlights(): void {
    this.selectionHighlights.forEach((highlight) => highlight.clearAll());
  }
}
