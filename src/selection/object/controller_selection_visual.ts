import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerSelection } from './manager_selection.js';
import { SelectionHighlight, SELECTION_HIGHLIGHT_USERDATA_KEY } from './selection_highlight.js';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeFader } from '@/solid/model/solid_brush_edge_fader.js';
import { SolidBrushEdgeBatch } from '@/solid/model/solid_brush_edge_batch.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/**
 * Owns selection outline instances across all viewports. Keeps orange outlines
 * glued to meshes during live transforms and after selectable-list refresh.
 * Also toggles solid-brush hull fills so only selected brushes draw translucent
 * volumes.
 */
export class ControllerSelectionVisual {
  private selectionManager: ManagerSelection;
  private viewportSyncManager: ManagerViewportSync;
  private selectionHighlights: SelectionHighlight[];
  private shadingControllers: ControllerViewportShading[];
  /** Brush meshes currently showing a translucent hull fill. */
  private hullFillMeshes = new Set<THREE.Mesh>();
  /** Modifier volumes and generator nodes currently showing their box fill. */
  private volumeFillMeshes = new Set<THREE.Mesh>();
  /**
   * When false, orange object selection outlines and solid-brush hull fills are
   * suppressed (Edit Mode). Does not touch permanent content/brush wireframes.
   */
  private objectSelectionChromeEnabled: boolean;

  /**
   * Creates a selection visual controller.
   *
   * @param selectionManager The shared selection state.
   * @param viewportSyncManager Provides the authoritative world object.
   */
  constructor(selectionManager: ManagerSelection, viewportSyncManager: ManagerViewportSync) {
    this.selectionManager = selectionManager;
    this.viewportSyncManager = viewportSyncManager;
    this.selectionHighlights = [];
    this.shadingControllers = [];
    this.objectSelectionChromeEnabled = true;
  }

  /**
   * Enables or disables object-mode selection chrome (orange outlines and solid
   * brush hull fills). Permanent mesh/brush edge wireframes are not modified.
   * Disabling always rebuilds so leftover outlines cannot stick after Edit
   * Mode.
   *
   * @param enabled True to show object selection visuals.
   */
  setObjectSelectionChromeEnabled(enabled: boolean): void {
    const changed = this.objectSelectionChromeEnabled !== enabled;
    this.objectSelectionChromeEnabled = enabled;
    if (!changed && enabled) {
      return;
    }
    this.refreshFromSelection();
  }

  /**
   * Creates highlight instances for each viewport and wires selection change
   * updates.
   *
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
   * Stores shading controllers so wireframe overlays can sync during
   * transforms.
   *
   * @param controllers Per-viewport shading controllers.
   */
  setShadingControllers(controllers: ControllerViewportShading[]): void {
    this.shadingControllers = controllers;
  }

  /** Rebuilds selection outlines for the current selection set. */
  refreshFromSelection(): void {
    this.clearAllHighlights();
    if (!this.objectSelectionChromeEnabled) {
      this.applyObjectSelectionChromeDisabled();
      return;
    }
    this.applyObjectSelectionChromeEnabled();
  }

  /** Clears outlines, hull fills, and personal brush edges for Edit Mode. */
  private applyObjectSelectionChromeDisabled(): void {
    this.stripOrphanSelectionOutlinesFromSelection();
    this.hideAllSolidBrushHullFills();
    this.hideAllVolumeFills();
    this.clearSolidBrushEdgeIndividualSet();
    SolidBrushEdgeFader.invalidateCameraCache();
  }

  /** Applies outlines and hull fills for the current Object Mode selection. */
  private applyObjectSelectionChromeEnabled(): void {
    const selected = this.selectionManager.getSelectedObjects();
    selected.forEach((mesh) => this.applyHighlightToMesh(mesh));
    this.syncSolidBrushHullFills();
    this.syncVolumeFills();
    this.syncSolidBrushEdgeBatches();
    SolidBrushEdgeFader.invalidateCameraCache();
  }

  /** Clears individual solid-brush edge tracking while chrome is suppressed. */
  private clearSolidBrushEdgeIndividualSet(): void {
    const worldObject =
      typeof this.viewportSyncManager.getWorldObject === 'function' ? this.viewportSyncManager.getWorldObject() : null;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(worldObject, []);
  }

  /**
   * Removes selection outline children that are no longer tracked by a
   * highlight instance (orphans from multi-viewport apply or interrupted
   * clears).
   */
  private stripOrphanSelectionOutlinesFromSelection(): void {
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      this.stripOrphanSelectionOutlinesFromMesh(mesh);
    }
  }

  /**
   * Removes selection outline groups and line children from one mesh.
   *
   * @param mesh Mesh that may still own orange selection outlines.
   */
  private stripOrphanSelectionOutlinesFromMesh(mesh: THREE.Mesh): void {
    const orphans = mesh.children.filter(
      (child) =>
        child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true || child.userData['isSelectionHighlight'] === true,
    );
    for (const orphan of orphans) {
      mesh.remove(orphan);
      this.disposeSelectionOutlineObject(orphan);
    }
  }

  /**
   * Disposes geometry for a detached selection outline object.
   *
   * @param object Outline group or line segments.
   */
  private disposeSelectionOutlineObject(object: THREE.Object3D): void {
    if (object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      return;
    }
    if (!(object instanceof THREE.Group)) {
      return;
    }
    let sharedGeometry: THREE.BufferGeometry | null = null;
    for (const child of object.children) {
      if (!(child instanceof THREE.LineSegments)) {
        continue;
      }
      if (!sharedGeometry) {
        sharedGeometry = child.geometry;
      }
    }
    object.clear();
    if (sharedGeometry) {
      sharedGeometry.dispose();
    }
  }

  /** Hides every solid-brush translucent hull fill currently tracked. */
  private hideAllSolidBrushHullFills(): void {
    for (const mesh of this.hullFillMeshes) {
      this.applyBrushHullFillToMesh(mesh, false);
    }
    this.hullFillMeshes = new Set();
  }

  /** Hides the box fill of every modifier volume and generator node tracked. */
  private hideAllVolumeFills(): void {
    for (const mesh of this.volumeFillMeshes) {
      ModifierVolume.setFillVisible(mesh, false);
    }
    this.volumeFillMeshes = new Set();
  }

  /**
   * Shows the translucent box fill only for selected modifier volumes and
   * generator nodes, as for brush hulls; unselected ones keep only their
   * outline.
   */
  private syncVolumeFills(): void {
    const nextFills = new Set<THREE.Mesh>();
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      if (ModifierVolume.isVolume(mesh) && mesh.parent) nextFills.add(mesh);
    }
    for (const mesh of this.volumeFillMeshes) {
      if (!nextFills.has(mesh)) ModifierVolume.setFillVisible(mesh, false);
    }
    for (const mesh of nextFills) ModifierVolume.setFillVisible(mesh, true);
    this.volumeFillMeshes = nextFills;
  }

  /** Re-applies outlines after viewport selectable lists are refreshed. */
  reapplyAfterViewportSync(): void {
    this.refreshFromSelection();
  }

  /**
   * Rebuilds outline geometry for every currently highlighted mesh. Call after
   * extrude/CSG so orange edges match the new mesh shape.
   */
  rebuildHighlightGeometries(): void {
    this.selectionHighlights.forEach((highlight) => highlight.rebuildGeometries());
  }

  /** Keeps outlines and shading wireframes glued to meshes during live drag. */
  syncDuringTransform(): void {
    this.selectionHighlights.forEach((highlight) => highlight.syncTransforms());
    this.shadingControllers.forEach((controller) => controller.syncOverlayTransforms());
  }

  /** Disposes all highlight resources. */
  dispose(): void {
    this.selectionHighlights.forEach((highlight) => highlight.dispose());
    this.selectionHighlights = [];
  }

  /**
   * Applies a highlight only in the viewport scene that owns this mesh. Each
   * mesh gets at most one orange outline child (not one per viewport).
   *
   * @param mesh The mesh to highlight.
   */
  private applyHighlightToMesh(mesh: THREE.Mesh): void {
    this.selectionHighlights.forEach((highlight) => {
      highlight.apply(mesh);
    });
  }

  /** Clears outlines from every highlight instance. */
  private clearAllHighlights(): void {
    this.selectionHighlights.forEach((highlight) => highlight.clearAll());
  }

  /**
   * Shows translucent brush hulls only for selected solid brushes. Unselected
   * brushes keep operation-colored outlines without filled volumes. Only
   * brushes that enter or leave selection are restyled so maps with thousands
   * of brushes stay interactive.
   */
  private syncSolidBrushHullFills(): void {
    const nextFills = this.collectSelectedBrushMeshes();
    for (const mesh of this.hullFillMeshes) {
      if (nextFills.has(mesh)) continue;
      this.applyBrushHullFillToMesh(mesh, false);
    }
    for (const mesh of nextFills) {
      if (this.hullFillMeshes.has(mesh)) continue;
      this.applyBrushHullFillToMesh(mesh, true);
    }
    this.hullFillMeshes = nextFills;
  }

  /**
   * Collects selected solid brush previews that are still parented in a scene.
   * Detached meshes (e.g. mid undo) never keep a filled hull.
   *
   * @returns Set of selected brush meshes that should show hull fill.
   */
  private collectSelectedBrushMeshes(): Set<THREE.Mesh> {
    const nextFills = new Set<THREE.Mesh>();
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      if (!SolidBrushVisual.isBrushObject(mesh)) continue;
      if (!mesh.parent) continue;
      nextFills.add(mesh);
    }
    return nextFills;
  }

  /**
   * Applies hull fill visibility to a world brush mesh. Always updates the
   * world mesh userData even when detached so undo/redo cannot resurrect a
   * selected fill after the brush is re-parented.
   *
   * @param worldMesh Authoritative brush preview mesh.
   * @param fillVisible Whether the translucent volume should be drawn.
   */
  private applyBrushHullFillToMesh(worldMesh: THREE.Mesh, fillVisible: boolean): void {
    SolidBrushVisual.setHullFillVisible(worldMesh, fillVisible);
  }

  /**
   * Syncs solid-brush edge batch membership with the current selection. Static
   * batches already draw every brush; this only updates the individual set so
   * selection stays cheap on large solids.
   */
  private syncSolidBrushEdgeBatches(): void {
    const individual = this.collectSelectedBrushMeshes();
    const worldObject =
      typeof this.viewportSyncManager.getWorldObject === 'function' ? this.viewportSyncManager.getWorldObject() : null;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(worldObject, individual);
  }
}
