import * as THREE from 'three';
import { createScreenPixelDashedLineMaterial } from '@/transform/bounds/bounds_guide_line_material.js';
import { CadRulerStyle } from './cad_ruler_style.js';
import type { CadLineSegment } from '@/rulers/dimension/cad_dimension_geometry.js';

/** Optional construction flags for a CAD line batch. */
export interface CadRulerLineBatchOptions {
  /**
   * When true, strokes use screen-pixel dashing (same shader as bounds guide
   * lines). Requires lineStart/lineEnd attributes on every segment.
   */
  dashed?: boolean;
}

/**
 * Dual-pass (front + occluded) line batch for CAD ruler geometry. Reuses typed
 * arrays and BufferAttributes across uploads so idle / per-frame projection
 * refreshes do not reallocate GPU buffers every frame.
 */
export class CadRulerLineBatch {
  private rootGroup: THREE.Group;
  private geometry: THREE.BufferGeometry;
  private frontMaterial: THREE.Material;
  private occludedMaterial: THREE.Material;
  private frontLines: THREE.LineSegments;
  private occludedLines: THREE.LineSegments;
  private positions: Float32Array;
  private colors: Float32Array;
  private lineStarts: Float32Array;
  private lineEnds: Float32Array;
  private positionAttribute: THREE.BufferAttribute | null;
  private colorAttribute: THREE.BufferAttribute | null;
  private lineStartAttribute: THREE.BufferAttribute | null;
  private lineEndAttribute: THREE.BufferAttribute | null;
  private capacityVertices: number;
  private usedVertices: number;
  private depthOcclusionEnabled: boolean;
  private dashed: boolean;

  /**
   * Creates an empty dual-pass line batch.
   *
   * @param name Root group name for debugging.
   * @param frontOpacity Front-pass opacity.
   * @param occludedOpacity Occluded-pass opacity.
   * @param options Optional dashed-stroke mode.
   */
  constructor(
    name: string,
    frontOpacity: number = CadRulerStyle.lineFrontOpacity,
    occludedOpacity: number = CadRulerStyle.lineOccludedOpacity,
    options: CadRulerLineBatchOptions = {},
  ) {
    this.dashed = options.dashed === true;
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(0);
    this.colors = new Float32Array(0);
    this.lineStarts = new Float32Array(0);
    this.lineEnds = new Float32Array(0);
    this.positionAttribute = null;
    this.colorAttribute = null;
    this.lineStartAttribute = null;
    this.lineEndAttribute = null;
    this.capacityVertices = 0;
    this.usedVertices = 0;
    this.depthOcclusionEnabled = true;
    this.frontMaterial = this.createFrontMaterial(frontOpacity);
    this.occludedMaterial = this.createOccludedMaterial(occludedOpacity);
    this.frontLines = this.createLinePass('front', this.frontMaterial, CadRulerStyle.frontRenderOrder);
    this.occludedLines = this.createLinePass('occluded', this.occludedMaterial, CadRulerStyle.occludedRenderOrder);
    this.occludedLines.userData['isGizmoOccludedGhost'] = true;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = name;
    this.rootGroup.userData['isCadRuler'] = true;
    this.rootGroup.frustumCulled = false;
    this.rootGroup.add(this.occludedLines);
    this.rootGroup.add(this.frontLines);
    this.clear();
  }

  /**
   * Returns the root group to parent in a viewport scene.
   *
   * @returns Root group containing both line passes.
   */
  getObject(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Shows or hides the entire batch.
   *
   * @param visible Whether lines should draw.
   */
  setVisible(visible: boolean): void {
    if (this.rootGroup.visible === visible) {
      this.syncOccludedPassVisibility();
      return;
    }
    this.rootGroup.visible = visible;
    this.syncOccludedPassVisibility();
  }

  /**
   * Returns whether the batch is visible.
   *
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.rootGroup.visible;
  }

  /**
   * Enables or disables depth-based occlusion (front + dim ghost). Perspective
   * viewports keep dual-pass darkening; orthographic 2D panes draw full-bright
   * lines that are not darkened by geometry along the view axis.
   *
   * @param enabled True for 3D dual-pass depth; false for always-on-top 2D.
   */
  setDepthOcclusionEnabled(enabled: boolean): void {
    if (this.depthOcclusionEnabled === enabled) return;
    this.depthOcclusionEnabled = enabled;
    this.applyDepthMode(this.frontMaterial, enabled, THREE.LessEqualDepth);
    this.applyDepthMode(this.occludedMaterial, enabled, THREE.GreaterDepth);
    this.syncOccludedPassVisibility();
  }

  /**
   * Returns whether dual-pass depth occlusion is active.
   *
   * @returns True when front/occluded depth testing is enabled.
   */
  isDepthOcclusionEnabled(): boolean {
    return this.depthOcclusionEnabled;
  }

  /**
   * Returns whether this batch draws dashed strokes.
   *
   * @returns True when constructed with dashed mode.
   */
  isDashed(): boolean {
    return this.dashed;
  }

  /**
   * Returns the front-pass material (tests / debugging).
   *
   * @returns Front line material.
   */
  getFrontMaterial(): THREE.Material {
    return this.frontMaterial;
  }

  /**
   * Returns the occluded-pass material (tests / debugging).
   *
   * @returns Occluded line material.
   */
  getOccludedMaterial(): THREE.Material {
    return this.occludedMaterial;
  }

  /**
   * Returns whether the occluded ghost pass is currently drawn.
   *
   * @returns True when the occluded LineSegments object is visible.
   */
  isOccludedPassVisible(): boolean {
    return this.occludedLines.visible;
  }

  /**
   * Replaces geometry with the provided segments.
   *
   * @param segments World-space colored segments.
   */
  setSegments(segments: CadLineSegment[]): void {
    const vertexCount = segments.length * 2;
    this.ensureCapacity(vertexCount);
    this.writeSegments(segments);
    this.usedVertices = vertexCount;
    this.uploadAttributes(vertexCount);
    this.setVisible(segments.length > 0);
  }

  /** Clears all segments and hides the batch. */
  clear(): void {
    this.usedVertices = 0;
    this.uploadAttributes(0);
    this.setVisible(false);
  }

  /**
   * Returns the number of line segments currently stored.
   *
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return Math.floor(this.usedVertices / 2);
  }

  /**
   * Returns whether the position attribute was recreated on the last capacity
   * growth (tests).
   *
   * @returns True when attributes currently bind the capacity arrays.
   */
  hasStableAttributes(): boolean {
    return (
      this.positionAttribute !== null &&
      this.positionAttribute.array === this.positions &&
      this.colorAttribute !== null &&
      this.colorAttribute.array === this.colors
    );
  }

  /** Disposes GPU resources owned by this batch. */
  dispose(): void {
    this.geometry.dispose();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }

  /**
   * Creates the front-pass line material (solid or dashed).
   *
   * @param opacity Front opacity.
   * @returns Configured material.
   */
  private createFrontMaterial(opacity: number): THREE.Material {
    if (this.dashed) {
      return createScreenPixelDashedLineMaterial(opacity, THREE.LessEqualDepth);
    }
    return this.createSolidLineMaterial(opacity, THREE.LessEqualDepth);
  }

  /**
   * Creates the occluded ghost line material (solid or dashed).
   *
   * @param opacity Occluded opacity.
   * @returns Configured material.
   */
  private createOccludedMaterial(opacity: number): THREE.Material {
    if (this.dashed) {
      return createScreenPixelDashedLineMaterial(opacity, THREE.GreaterDepth);
    }
    return this.createSolidLineMaterial(opacity, THREE.GreaterDepth);
  }

  /**
   * Builds a vertex-colored solid LineBasicMaterial for extension and delta
   * strokes.
   *
   * @param opacity Pass opacity.
   * @param depthFunc Depth comparison.
   * @returns Configured solid line material.
   */
  private createSolidLineMaterial(opacity: number, depthFunc: THREE.DepthModes): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      depthWrite: false,
      depthFunc,
      transparent: true,
      opacity,
      toneMapped: false,
      linewidth: 1,
    });
  }

  /**
   * Applies depth-test mode for a dual-pass material.
   *
   * @param material Line material to update.
   * @param depthOcclusionEnabled Whether 3D occlusion is active.
   * @param occludedDepthFunc Depth function when occlusion is on.
   */
  private applyDepthMode(
    material: THREE.Material,
    depthOcclusionEnabled: boolean,
    occludedDepthFunc: THREE.DepthModes,
  ): void {
    material.depthTest = depthOcclusionEnabled;
    material.depthWrite = false;
    material.depthFunc = depthOcclusionEnabled ? occludedDepthFunc : THREE.AlwaysDepth;
  }

  /** Hides the dim occluded pass when drawing full-bright 2D lines. */
  private syncOccludedPassVisibility(): void {
    const showOccluded = this.depthOcclusionEnabled && this.rootGroup.visible;
    if (this.occludedLines.visible !== showOccluded) {
      this.occludedLines.visible = showOccluded;
    }
  }

  /**
   * Builds one LineSegments pass sharing the batch geometry.
   *
   * @param suffix Name suffix.
   * @param material Pass material.
   * @param renderOrder Draw order.
   * @returns Configured line object.
   */
  private createLinePass(suffix: string, material: THREE.Material, renderOrder: number): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, material);
    lines.name = `cad_ruler_lines_${suffix}`;
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Grows typed arrays when the next upload needs more vertices.
   *
   * @param vertexCount Required vertex count.
   */
  private ensureCapacity(vertexCount: number): void {
    if (vertexCount <= this.capacityVertices) return;
    const nextCapacity = Math.max(vertexCount, Math.max(64, this.capacityVertices * 2));
    this.positions = new Float32Array(nextCapacity * 3);
    this.colors = new Float32Array(nextCapacity * 3);
    if (this.dashed) {
      this.lineStarts = new Float32Array(nextCapacity * 3);
      this.lineEnds = new Float32Array(nextCapacity * 3);
    }
    this.capacityVertices = nextCapacity;
    this.positionAttribute = null;
    this.colorAttribute = null;
    this.lineStartAttribute = null;
    this.lineEndAttribute = null;
  }

  /**
   * Copies segment endpoints and colors into flat arrays.
   *
   * @param segments Source segments.
   */
  private writeSegments(segments: CadLineSegment[]): void {
    let offset = 0;
    for (const segment of segments) {
      this.writeSegmentAt(offset, segment);
      offset += 6;
    }
  }

  /**
   * Writes one segment's twelve floats (two vertices × position/color, and
   * optional dashed lineStart/lineEnd) at a flat component offset.
   *
   * @param offset Flat float index into the attribute streams.
   * @param segment Source segment.
   */
  private writeSegmentAt(offset: number, segment: CadLineSegment): void {
    this.positions[offset] = segment.ax;
    this.positions[offset + 1] = segment.ay;
    this.positions[offset + 2] = segment.az;
    this.colors[offset] = segment.colorA.r;
    this.colors[offset + 1] = segment.colorA.g;
    this.colors[offset + 2] = segment.colorA.b;
    this.positions[offset + 3] = segment.bx;
    this.positions[offset + 4] = segment.by;
    this.positions[offset + 5] = segment.bz;
    this.colors[offset + 3] = segment.colorB.r;
    this.colors[offset + 4] = segment.colorB.g;
    this.colors[offset + 5] = segment.colorB.b;
    if (this.dashed) {
      this.writeDashedEndpoints(offset, segment);
    }
  }

  /**
   * Duplicates world endpoints onto both vertices so the dash shader can treat
   * screen-space start/end as constants (no perspective warp).
   *
   * @param offset Flat float index into the attribute streams.
   * @param segment Source segment.
   */
  private writeDashedEndpoints(offset: number, segment: CadLineSegment): void {
    this.lineStarts[offset] = segment.ax;
    this.lineStarts[offset + 1] = segment.ay;
    this.lineStarts[offset + 2] = segment.az;
    this.lineStarts[offset + 3] = segment.ax;
    this.lineStarts[offset + 4] = segment.ay;
    this.lineStarts[offset + 5] = segment.az;
    this.lineEnds[offset] = segment.bx;
    this.lineEnds[offset + 1] = segment.by;
    this.lineEnds[offset + 2] = segment.bz;
    this.lineEnds[offset + 3] = segment.bx;
    this.lineEnds[offset + 4] = segment.by;
    this.lineEnds[offset + 5] = segment.bz;
  }

  /**
   * Uploads position/color attributes for the used vertex range without
   * allocating new BufferAttributes when capacity is unchanged.
   *
   * @param vertexCount Used vertex count.
   */
  private uploadAttributes(vertexCount: number): void {
    if (this.capacityVertices === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    this.bindAttributesIfNeeded();
    const componentCount = vertexCount * 3;
    if (this.positionAttribute && this.colorAttribute) {
      this.markAttributeUpdated(this.positionAttribute, componentCount);
      this.markAttributeUpdated(this.colorAttribute, componentCount);
    }
    if (this.dashed && this.lineStartAttribute && this.lineEndAttribute) {
      this.markAttributeUpdated(this.lineStartAttribute, componentCount);
      this.markAttributeUpdated(this.lineEndAttribute, componentCount);
    }
    this.geometry.setDrawRange(0, vertexCount);
  }

  /**
   * Flags a dynamic attribute for GPU re-upload of the used range.
   *
   * @param attribute Position or color attribute.
   * @param componentCount Number of scalar components to upload.
   */
  private markAttributeUpdated(attribute: THREE.BufferAttribute, componentCount: number): void {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, componentCount);
    attribute.needsUpdate = true;
  }

  /** Creates or rebinds buffer attributes when capacity arrays change. */
  private bindAttributesIfNeeded(): void {
    if (this.positionAttribute && this.positionAttribute.array === this.positions) {
      return;
    }
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    if (this.dashed) {
      this.lineStartAttribute = new THREE.BufferAttribute(this.lineStarts, 3);
      this.lineEndAttribute = new THREE.BufferAttribute(this.lineEnds, 3);
      this.lineStartAttribute.setUsage(THREE.DynamicDrawUsage);
      this.lineEndAttribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute('lineStart', this.lineStartAttribute);
      this.geometry.setAttribute('lineEnd', this.lineEndAttribute);
    }
  }
}
