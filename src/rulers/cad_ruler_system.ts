import * as THREE from 'three';
import { Theme } from '../theme.js';
import { OrientedBoundsBuilder, type OrientedBoundsData } from '../transform/bounds/oriented_bounds.js';
import {
  appendGhostBoxSegments,
  appendResizeSizeDeltaDimensions,
  appendSelectionSizeDimensions,
  appendTransformDeltaDimensions,
  type CadLabelSpec,
  type CadLineSegment,
} from './cad_dimension_geometry.js';
import { createCadPlacementContext, type CadPlacementContext } from './cad_placement_context.js';
import { formatCadDeltaStatus, formatCadSignedDelta } from './cad_ruler_format.js';
import type { CadViewPlane } from './cad_view_plane.js';
import { CadRulerViewport } from './cad_ruler_viewport.js';

/** Camera + renderer + container bindings for one editor viewport. */
export interface CadRulerViewportBinding {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;
  /** Orthographic grid plane or full 3D (`xyz`). */
  viewPlane: CadViewPlane;
}

/** How transform-drag feedback should be interpreted. */
export type CadRulerDragMode = 'idle' | 'translate' | 'resize';

/**
 * CAD ruler overlay system for selection dimensions and transform-drag
 * feedback. Geometry is rebuilt only for the active selection (never for every
 * brush). Each viewport gets its own camera-facing layout so rulers sit on the
 * near side with screen-stable stand-off.
 */
export class CadRulerSystem {
  private viewports: CadRulerViewport[];
  private viewportPlanes: CadViewPlane[];
  private boundsBuilder: OrientedBoundsBuilder;
  private sizeColor: THREE.Color;
  private extensionColor: THREE.Color;
  private deltaColor: THREE.Color;
  private ghostColor: THREE.Color;
  private axisColorX: THREE.Color;
  private axisColorY: THREE.Color;
  private axisColorZ: THREE.Color;
  private currentBounds: OrientedBoundsData | null;
  private dragMode: CadRulerDragMode;
  private dragStartBounds: OrientedBoundsData | null;
  private dragStartCenter: THREE.Vector3;
  private dragTranslation: THREE.Vector3;
  private ghostSegments: CadLineSegment[];
  private lastLabels: CadLabelSpec[];
  private lastStatusText: string;
  private isDisposed: boolean;

  /** Creates an idle ruler system with no viewports attached. */
  constructor() {
    this.viewports = [];
    this.viewportPlanes = [];
    this.boundsBuilder = new OrientedBoundsBuilder();
    this.sizeColor = new THREE.Color(Theme.rulerSizeColor);
    this.extensionColor = new THREE.Color(Theme.rulerExtensionColor);
    this.deltaColor = new THREE.Color(Theme.rulerDeltaColor);
    this.ghostColor = new THREE.Color(Theme.rulerGhostColor);
    this.axisColorX = new THREE.Color(Theme.gizmoXAxisColor);
    this.axisColorY = new THREE.Color(Theme.gizmoYAxisColor);
    this.axisColorZ = new THREE.Color(Theme.gizmoZAxisColor);
    this.currentBounds = null;
    this.dragMode = 'idle';
    this.dragStartBounds = null;
    this.dragStartCenter = new THREE.Vector3();
    this.dragTranslation = new THREE.Vector3();
    this.ghostSegments = [];
    this.lastLabels = [];
    this.lastStatusText = '';
    this.isDisposed = false;
  }

  /**
   * Attaches ruler rendering to the given viewport bindings.
   *
   * @param bindings One entry per editor viewport.
   */
  attachViewports(bindings: CadRulerViewportBinding[]): void {
    this.disposeViewports();
    this.viewportPlanes = bindings.map((binding) => binding.viewPlane);
    this.viewports = bindings.map(
      (binding) => new CadRulerViewport(binding.scene, binding.camera, binding.renderer, binding.container),
    );
  }

  /**
   * Rebuilds size dimensions for the current selection.
   *
   * @param meshes Selected world meshes (empty clears rulers).
   */
  setSelectionMeshes(meshes: THREE.Mesh[]): void {
    if (this.isDisposed) return;
    if (meshes.length === 0) {
      this.currentBounds = null;
      if (this.dragMode === 'idle') {
        this.clearAll();
      } else {
        this.rebuildAndUpload();
      }
      return;
    }
    this.currentBounds = this.cloneBounds(this.boundsBuilder.buildFromMeshes(meshes));
    this.rebuildAndUpload();
  }

  /**
   * Updates live bounds from meshes during transforms without ending drag.
   *
   * @param meshes Selected meshes being transformed.
   */
  updateLiveSelectionMeshes(meshes: THREE.Mesh[]): void {
    if (this.isDisposed || meshes.length === 0) return;
    this.currentBounds = this.cloneBounds(this.boundsBuilder.buildFromMeshes(meshes));
    this.rebuildAndUpload();
  }

  /**
   * Begins transform-drag feedback using the pre-drag selection bounds.
   *
   * @param startBounds Oriented bounds at pointer-down.
   * @param mode Translate (center path) or resize (size deltas only).
   */
  beginDrag(startBounds: OrientedBoundsData | null, mode: CadRulerDragMode = 'translate'): void {
    if (this.isDisposed || !startBounds || mode === 'idle') return;
    this.dragMode = mode;
    this.dragStartBounds = this.cloneBounds(startBounds);
    this.dragStartCenter.copy(startBounds.center);
    this.dragTranslation.set(0, 0, 0);
    this.rebuildAndUpload();
  }

  /**
   * Updates translate-drag feedback from an explicit world translation.
   *
   * @param translation World-space translation delta from drag start.
   * @param currentBounds Optional live bounds for size labels.
   */
  updateTranslateDrag(translation: THREE.Vector3, currentBounds: OrientedBoundsData | null = null): void {
    if (this.isDisposed || this.dragMode !== 'translate') return;
    this.dragTranslation.copy(translation);
    if (this.dragStartBounds) {
      const halfSource = currentBounds ?? this.dragStartBounds;
      this.currentBounds = {
        center: this.dragStartCenter.clone().add(translation),
        quaternion: halfSource.quaternion.clone(),
        halfExtents: halfSource.halfExtents.clone(),
      };
    } else if (currentBounds) {
      this.currentBounds = this.cloneBounds(currentBounds);
    }
    this.rebuildAndUpload();
  }

  /**
   * Updates translate feedback from live bounds so labels match snapped world
   * poses rather than unsnapped mouse motion.
   *
   * @param currentBounds Live selection bounds after transform/snap.
   */
  updateTranslateDragFromLiveBounds(currentBounds: OrientedBoundsData | null): void {
    if (this.isDisposed || this.dragMode !== 'translate' || !currentBounds) return;
    this.currentBounds = this.cloneBounds(currentBounds);
    this.dragTranslation.copy(currentBounds.center).sub(this.dragStartCenter);
    this.rebuildAndUpload();
  }

  /**
   * Updates resize-drag feedback from live oriented bounds.
   *
   * @param currentBounds Live oriented bounds during resize.
   */
  updateResizeDrag(currentBounds: OrientedBoundsData | null): void {
    if (this.isDisposed || this.dragMode !== 'resize' || !currentBounds) return;
    this.currentBounds = this.cloneBounds(currentBounds);
    this.rebuildAndUpload();
  }

  /** Ends drag feedback and restores selection-only dimensions. */
  endDrag(): void {
    if (this.isDisposed) return;
    this.dragMode = 'idle';
    this.dragStartBounds = null;
    this.dragTranslation.set(0, 0, 0);
    this.lastStatusText = '';
    this.rebuildAndUpload();
  }

  /**
   * Rebuilds camera-facing geometry and reprojects labels. Called every frame
   * so orbiting/panning moves rulers to the near side of the box.
   */
  refreshLabelProjection(): void {
    if (this.isDisposed) return;
    if (!this.currentBounds && this.dragMode === 'idle') return;
    this.rebuildAndUpload();
  }

  /**
   * Shows only the ruler world geometry that belongs to the given pane camera.
   * Required for shared multi-view: each pane has custom placement (2D vs 3D)
   * and must not draw sibling pane rulers into its scissor pass. Orthographic
   * cameras disable depth darkening so lines stay readable over sky geometry.
   *
   * @param camera Active multi-view pane camera.
   */
  prepareForCamera(camera: THREE.Camera): void {
    if (this.isDisposed) return;
    const depthOcclusionEnabled = camera instanceof THREE.PerspectiveCamera;
    this.viewports.forEach((viewport) => {
      const isActive = viewport.getCamera() === camera;
      if (isActive) {
        viewport.setDepthOcclusionEnabled(depthOcclusionEnabled);
      }
      viewport.setGeometryVisible(isActive);
    });
  }

  /** Hides all shared-scene ruler line batches after a multi-view pane pass. */
  endCameraPass(): void {
    if (this.isDisposed) return;
    this.viewports.forEach((viewport) => viewport.setGeometryVisible(false));
  }

  /**
   * Returns the latest drag status summary for the status bar.
   *
   * @returns Status text, or empty when not dragging / zero delta.
   */
  getStatusText(): string {
    return this.lastStatusText;
  }

  /**
   * Returns whether a transform drag overlay is active.
   *
   * @returns True during drag feedback.
   */
  isDragActive(): boolean {
    return this.dragMode !== 'idle';
  }

  /**
   * Returns the active drag mode (tests / integration).
   *
   * @returns Current drag mode.
   */
  getDragMode(): CadRulerDragMode {
    return this.dragMode;
  }

  /**
   * Returns dimension segment count from the first viewport (tests).
   *
   * @returns Segment count, or 0.
   */
  getDimensionSegmentCount(): number {
    if (this.viewports.length === 0) return 0;
    return this.viewports[0]!.getDimensionSegmentCount();
  }

  /**
   * Returns whether the first viewport uses dual-pass depth darkening (tests).
   *
   * @returns True when depth occlusion is enabled.
   */
  isDepthOcclusionEnabled(): boolean {
    if (this.viewports.length === 0) return true;
    return this.viewports[0]!.isDepthOcclusionEnabled();
  }

  /**
   * Returns ghost segment count from the first viewport (tests).
   *
   * @returns Segment count, or 0.
   */
  getGhostSegmentCount(): number {
    if (this.viewports.length === 0) return 0;
    return this.viewports[0]!.getGhostSegmentCount();
  }

  /**
   * Returns current label specifications from the last rebuild (tests).
   *
   * @returns Label array snapshot.
   */
  getLabels(): readonly CadLabelSpec[] {
    return this.lastLabels;
  }

  /**
   * Returns attached viewport count (tests).
   *
   * @returns Number of ruler viewports.
   */
  getViewportCount(): number {
    return this.viewports.length;
  }

  /** Disposes all viewport rulers and clears state. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.disposeViewports();
    this.currentBounds = null;
    this.dragStartBounds = null;
    this.ghostSegments = [];
    this.lastLabels = [];
  }

  /** Removes and disposes all attached viewport renderers. */
  private disposeViewports(): void {
    this.viewports.forEach((viewport) => viewport.dispose());
    this.viewports = [];
    this.viewportPlanes = [];
  }

  /** Hides all ruler visuals. */
  private clearAll(): void {
    this.ghostSegments = [];
    this.lastLabels = [];
    this.lastStatusText = '';
    this.viewports.forEach((viewport) => viewport.clear());
  }

  /**
   * Rebuilds ghost once, then per-viewport camera-facing dimensions/labels so
   * each view parks rulers on its near side with a screen-stable stand-off.
   */
  private rebuildAndUpload(): void {
    this.ghostSegments = [];
    this.lastStatusText = '';
    if (this.dragMode !== 'idle' && this.dragStartBounds) {
      appendGhostBoxSegments(this.dragStartBounds, this.ghostColor, this.ghostSegments);
    }
    this.lastLabels = [];
    this.viewports.forEach((viewport, index) => this.uploadViewport(viewport, this.viewportPlanes[index] ?? 'xyz'));
  }

  /**
   * Builds and uploads ruler geometry for a single viewport.
   *
   * @param viewport Target ruler viewport.
   * @param viewPlane View plane for axis filtering and in-plane offset.
   */
  private uploadViewport(viewport: CadRulerViewport, viewPlane: CadViewPlane): void {
    const segments: CadLineSegment[] = [];
    const labels: CadLabelSpec[] = [];
    const placement = this.createPlacementForViewport(viewport, viewPlane);
    this.appendSelectionDimensions(placement, segments, labels);
    this.appendDragFeedback(placement, segments, labels);
    viewport.setDimensions(segments, labels);
    viewport.setGhost(this.ghostSegments);
    if (this.lastLabels.length === 0) {
      this.lastLabels = labels;
    }
  }

  /**
   * Builds screen-stable placement metrics at the selection center.
   *
   * @param viewport Viewport providing camera and renderer.
   * @param viewPlane View plane for this viewport.
   * @returns Placement context.
   */
  private createPlacementForViewport(viewport: CadRulerViewport, viewPlane: CadViewPlane): CadPlacementContext {
    const anchor = this.currentBounds?.center ?? this.dragStartCenter;
    return createCadPlacementContext(viewport.getCamera(), viewport.getViewportCssHeight(), anchor, viewPlane);
  }

  /**
   * Appends size dimensions for the live selection bounds.
   *
   * @param placement Viewport placement context.
   * @param segments Output segments.
   * @param labels Output labels.
   */
  private appendSelectionDimensions(
    placement: CadPlacementContext,
    segments: CadLineSegment[],
    labels: CadLabelSpec[],
  ): void {
    if (!this.currentBounds) return;
    appendSelectionSizeDimensions(
      this.currentBounds,
      this.sizeColor,
      this.extensionColor,
      Theme.rulerLabelSizeText,
      segments,
      labels,
      placement,
    );
  }

  /**
   * Appends mode-specific drag feedback into the given buffers.
   *
   * @param placement Viewport placement context.
   * @param segments Output segments.
   * @param labels Output labels.
   */
  private appendDragFeedback(placement: CadPlacementContext, segments: CadLineSegment[], labels: CadLabelSpec[]): void {
    if (this.dragMode === 'idle' || !this.dragStartBounds) return;
    if (this.dragMode === 'translate') {
      this.appendTranslateFeedback(placement, segments, labels);
      return;
    }
    this.appendResizeFeedback(placement, segments, labels);
  }

  /**
   * Appends trailing-face translation deltas from start/live bounds.
   *
   * @param placement Viewport placement context.
   * @param segments Output segments.
   * @param labels Output labels.
   */
  private appendTranslateFeedback(
    placement: CadPlacementContext,
    segments: CadLineSegment[],
    labels: CadLabelSpec[],
  ): void {
    if (!this.dragStartBounds) return;
    const liveBounds = this.currentBounds ?? this.buildTranslatedBounds(this.dragStartBounds, this.dragTranslation);
    if (!liveBounds) return;
    appendTransformDeltaDimensions(
      this.dragStartBounds,
      liveBounds,
      this.deltaColor,
      { x: this.axisColorX, y: this.axisColorY, z: this.axisColorZ },
      Theme.rulerLabelDeltaText,
      segments,
      labels,
      placement,
    );
    if (this.dragTranslation.lengthSq() > 1e-12 && this.lastStatusText.length === 0) {
      this.lastStatusText = formatCadDeltaStatus(
        this.dragTranslation.x,
        this.dragTranslation.y,
        this.dragTranslation.z,
      );
    }
  }

  /**
   * Builds a bounds copy translated by a world delta (for tests / partial
   * updates).
   *
   * @param startBounds Source bounds.
   * @param translation World translation.
   * @returns Cloned translated bounds.
   */
  private buildTranslatedBounds(startBounds: OrientedBoundsData, translation: THREE.Vector3): OrientedBoundsData {
    return {
      center: startBounds.center.clone().add(translation),
      quaternion: startBounds.quaternion.clone(),
      halfExtents: startBounds.halfExtents.clone(),
    };
  }

  /**
   * Appends local face-travel dimensions for resize drags only.
   *
   * @param placement Viewport placement context.
   * @param segments Output segments.
   * @param labels Output labels.
   */
  private appendResizeFeedback(
    placement: CadPlacementContext,
    segments: CadLineSegment[],
    labels: CadLabelSpec[],
  ): void {
    if (!this.currentBounds || !this.dragStartBounds) return;
    appendResizeSizeDeltaDimensions(
      this.dragStartBounds,
      this.currentBounds,
      this.deltaColor,
      this.extensionColor,
      Theme.rulerLabelDeltaText,
      segments,
      labels,
      placement,
    );
    if (this.lastStatusText.length === 0) {
      this.lastStatusText = this.buildResizeStatusText(this.dragStartBounds, this.currentBounds);
    }
  }

  /**
   * Builds a compact status line for size changes along local axes.
   *
   * @param startBounds Bounds at drag start.
   * @param currentBounds Live bounds.
   * @returns Status text, or empty when sizes match.
   */
  private buildResizeStatusText(startBounds: OrientedBoundsData, currentBounds: OrientedBoundsData): string {
    const dx = currentBounds.halfExtents.x * 2 - startBounds.halfExtents.x * 2;
    const dy = currentBounds.halfExtents.y * 2 - startBounds.halfExtents.y * 2;
    const dz = currentBounds.halfExtents.z * 2 - startBounds.halfExtents.z * 2;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) {
      return '';
    }
    return `Size Δ ${formatCadSignedDelta(dx)}, ${formatCadSignedDelta(dy)}, ${formatCadSignedDelta(dz)}`;
  }

  /**
   * Deep-clones oriented bounds data when present.
   *
   * @param bounds Source bounds or null.
   * @returns Independent clone, or null.
   */
  private cloneBounds(bounds: OrientedBoundsData | null): OrientedBoundsData | null {
    if (!bounds) return null;
    return {
      center: bounds.center.clone(),
      quaternion: bounds.quaternion.clone(),
      halfExtents: bounds.halfExtents.clone(),
    };
  }
}
