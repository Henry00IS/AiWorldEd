import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { CadRulerStyle } from './cad_ruler_style.js';
import { CadRulerLineBatch } from './cad_ruler_line_batch.js';
import { CadRulerLabelLayer } from './cad_ruler_label_layer.js';
import type { CadLabelSpec, CadLineSegment } from '@/rulers/dimension/cad_dimension_geometry.js';

/**
 * Per-viewport CAD ruler rendering: world-space dual-pass lines plus sharp DOM
 * labels. Geometry is shared via uploaded segment lists from CadRulerSystem.
 * Dashed batches hold blue size-dimension wings; solid batches hold gray
 * extension legs and drag-delta strokes.
 */
export class CadRulerViewport {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private solidDimensionBatch: CadRulerLineBatch;
  private dashedDimensionBatch: CadRulerLineBatch;
  private ghostBatch: CadRulerLineBatch;
  private labelLayer: CadRulerLabelLayer;
  private isDisposed: boolean;
  private scratchSolidSegments: CadLineSegment[];
  private scratchDashedSegments: CadLineSegment[];

  /**
   * Creates ruler rendering for one viewport.
   *
   * @param scene Viewport scene that receives line groups.
   * @param camera Viewport camera for label projection.
   * @param renderer WebGL renderer associated with this viewport.
   * @param container Pane content element for label overlay and CSS size.
   */
  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, container: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.container = container;
    this.solidDimensionBatch = new CadRulerLineBatch(
      'cad_ruler_dimensions_solid',
      CadRulerStyle.lineFrontOpacity,
      CadRulerStyle.lineOccludedOpacity,
    );
    this.dashedDimensionBatch = new CadRulerLineBatch(
      'cad_ruler_dimensions_dashed',
      CadRulerStyle.lineFrontOpacity,
      CadRulerStyle.lineOccludedOpacity,
      { dashed: true },
    );
    this.ghostBatch = new CadRulerLineBatch(
      'cad_ruler_ghost',
      CadRulerStyle.ghostFrontOpacity,
      CadRulerStyle.ghostOccludedOpacity,
    );
    this.labelLayer = new CadRulerLabelLayer(container);
    this.isDisposed = false;
    this.scratchSolidSegments = [];
    this.scratchDashedSegments = [];
    this.scene.add(this.solidDimensionBatch.getObject());
    this.scene.add(this.dashedDimensionBatch.getObject());
    this.scene.add(this.ghostBatch.getObject());
    this.setGeometryVisible(false);
  }

  /**
   * Uploads dimension segments and refreshes screen-space labels. Dashed size
   * wings and solid extension/delta strokes are split into separate batches.
   *
   * @param segments Dimension and extension line segments.
   * @param labels Label specifications.
   */
  setDimensions(segments: CadLineSegment[], labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.partitionDimensionSegments(segments);
    this.solidDimensionBatch.setSegments(this.scratchSolidSegments);
    this.dashedDimensionBatch.setSegments(this.scratchDashedSegments);
    this.labelLayer.update(labels, this.camera);
    this.solidDimensionBatch.setVisible(false);
    this.dashedDimensionBatch.setVisible(false);
  }

  /**
   * Uploads ghost bounds wireframe segments.
   *
   * @param segments Ghost wire segments.
   */
  setGhost(segments: CadLineSegment[]): void {
    if (this.isDisposed) return;
    this.ghostBatch.setSegments(segments);
    this.ghostBatch.setVisible(false);
  }

  /**
   * Shows or hides world-space ruler line batches that currently hold segments.
   * DOM labels are not changed.
   *
   * @param visible Whether line batches with segments should draw.
   */
  setGeometryVisible(visible: boolean): void {
    if (this.isDisposed) return;
    const hasSolid = this.solidDimensionBatch.getSegmentCount() > 0;
    const hasDashed = this.dashedDimensionBatch.getSegmentCount() > 0;
    const hasGhost = this.ghostBatch.getSegmentCount() > 0;
    this.solidDimensionBatch.setVisible(visible && hasSolid);
    this.dashedDimensionBatch.setVisible(visible && hasDashed);
    this.ghostBatch.setVisible(visible && hasGhost);
  }

  /**
   * Enables or disables dual-pass depth occlusion on solid, dashed, and ghost
   * line batches.
   *
   * @param enabled True to enable dual-pass depth testing; false to disable it.
   */
  setDepthOcclusionEnabled(enabled: boolean): void {
    if (this.isDisposed) return;
    this.solidDimensionBatch.setDepthOcclusionEnabled(enabled);
    this.dashedDimensionBatch.setDepthOcclusionEnabled(enabled);
    this.ghostBatch.setDepthOcclusionEnabled(enabled);
  }

  /**
   * Returns whether depth occlusion is enabled on the solid dimension batch.
   *
   * @returns True when dual-pass depth testing is active.
   */
  isDepthOcclusionEnabled(): boolean {
    return this.solidDimensionBatch.isDepthOcclusionEnabled();
  }

  /**
   * Reprojects existing labels after camera motion without rebuilding lines.
   *
   * @param labels Current label specifications.
   */
  refreshLabels(labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.labelLayer.update(labels, this.camera);
  }

  /** Hides dimension lines, ghost, and labels. */
  clear(): void {
    this.solidDimensionBatch.clear();
    this.dashedDimensionBatch.clear();
    this.ghostBatch.clear();
    this.labelLayer.clear();
  }

  /**
   * Returns the total dimension segment count across solid and dashed batches.
   *
   * @returns Solid segment count plus dashed segment count.
   */
  getDimensionSegmentCount(): number {
    return this.solidDimensionBatch.getSegmentCount() + this.dashedDimensionBatch.getSegmentCount();
  }

  /**
   * Returns the dashed dimension batch segment count.
   *
   * @returns Dashed segment count.
   */
  getDashedDimensionSegmentCount(): number {
    return this.dashedDimensionBatch.getSegmentCount();
  }

  /**
   * Returns the solid dimension batch segment count.
   *
   * @returns Solid segment count.
   */
  getSolidDimensionSegmentCount(): number {
    return this.solidDimensionBatch.getSegmentCount();
  }

  /**
   * Returns whether the dashed dimension batch is in dashed stroke mode.
   *
   * @returns True when dashed mode is active.
   */
  isDimensionStrokeDashed(): boolean {
    return this.dashedDimensionBatch.isDashed();
  }

  /**
   * Returns the ghost batch segment count.
   *
   * @returns Ghost segment count.
   */
  getGhostSegmentCount(): number {
    return this.ghostBatch.getSegmentCount();
  }

  /**
   * Returns the label layer chip count.
   *
   * @returns Chip count.
   */
  getLabelChipCount(): number {
    return this.labelLayer.getChipCount();
  }

  /** Removes line groups and DOM labels. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.scene.remove(this.solidDimensionBatch.getObject());
    this.scene.remove(this.dashedDimensionBatch.getObject());
    this.scene.remove(this.ghostBatch.getObject());
    this.solidDimensionBatch.dispose();
    this.dashedDimensionBatch.dispose();
    this.ghostBatch.dispose();
    this.labelLayer.dispose();
  }

  /**
   * Returns the theme ruler size color.
   *
   * @returns Hex color from the theme.
   */
  getThemeSizeColor(): number {
    return Theme.rulerSizeColor;
  }

  /**
   * Returns the camera stored for this viewport.
   *
   * @returns Camera instance.
   */
  getCamera(): THREE.Camera {
    return this.camera;
  }

  /**
   * Returns the renderer stored for this viewport.
   *
   * @returns Renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Returns the pane content element stored for this viewport.
   *
   * @returns Content host element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the pane content element CSS height, clamped to at least 1.
   *
   * @returns Height in CSS pixels (at least 1).
   */
  getViewportCssHeight(): number {
    return Math.max(1, this.container.clientHeight || 1);
  }

  /**
   * Splits mixed dimension geometry into solid and dashed scratch lists without
   * allocating new arrays each upload.
   *
   * @param segments Mixed solid and dashed segments to partition.
   */
  private partitionDimensionSegments(segments: CadLineSegment[]): void {
    this.scratchSolidSegments.length = 0;
    this.scratchDashedSegments.length = 0;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;
      if (segment.dashed) {
        this.scratchDashedSegments.push(segment);
      } else {
        this.scratchSolidSegments.push(segment);
      }
    }
  }
}
