import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoVisualStyle } from '@/transform/gizmo/gizmo_visual_style.js';
import {
  createBoundsGuideFrontLineMaterial,
  createBoundsGuideOccludedLineMaterial,
} from './bounds_guide_line_material.js';

/** Flat attribute arrays accumulated while building guide rays. */
interface GuideRayBuffers {
  positions: number[];
  lineStarts: number[];
  lineEnds: number[];
  colors: number[];
}

/**
 * Draws RGB axis guide rays from each corner of an oriented bounds box. Rays
 * are fixed length (no scene raycasts), solid at the corner and faded at the
 * tip. Dashing uses true framebuffer pixels along the projected stroke so 3D
 * perspective cannot stretch the pattern with depth.
 */
export class BoundsGuideLines {
  private rootGroup: THREE.Group;
  private geometry: THREE.BufferGeometry;
  private frontMaterial: THREE.ShaderMaterial;
  private occludedMaterial: THREE.ShaderMaterial;
  private frontLines: THREE.LineSegments;
  private occludedLines: THREE.LineSegments;
  private fixedGuideLength: number;
  private colorX: THREE.Color;
  private colorY: THREE.Color;
  private colorZ: THREE.Color;
  private readonly cornerSigns: ReadonlyArray<number>;

  /**
   * Creates guide-line geometry using theme axis colors.
   *
   * @param theme Theme providing gizmo axis colors.
   * @param fixedGuideLength Constant outward ray length in world units.
   */
  constructor(theme: typeof Theme, fixedGuideLength: number = 4) {
    this.fixedGuideLength = fixedGuideLength;
    this.colorX = new THREE.Color(theme.gizmoXAxisColor);
    this.colorY = new THREE.Color(theme.gizmoYAxisColor);
    this.colorZ = new THREE.Color(theme.gizmoZAxisColor);
    this.cornerSigns = [-1, 1];
    this.geometry = new THREE.BufferGeometry();
    this.frontMaterial = createBoundsGuideFrontLineMaterial();
    this.occludedMaterial = createBoundsGuideOccludedLineMaterial();
    this.frontLines = this.createFrontLineSegments();
    this.occludedLines = this.createOccludedLineSegments();
    this.rootGroup = this.createRootGroup();
    this.allocateEmptyGeometry();
  }

  /**
   * Builds the front LineSegments with standard gizmo depth testing.
   *
   * @returns Configured front line object.
   */
  private createFrontLineSegments(): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, this.frontMaterial);
    lines.name = 'bounds_guide_lines_front';
    lines.renderOrder = GizmoVisualStyle.frontRenderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Builds the occluded ghost LineSegments sharing the front geometry.
   *
   * @returns Configured occluded line object.
   */
  private createOccludedLineSegments(): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, this.occludedMaterial);
    lines.name = 'bounds_guide_lines_occluded';
    lines.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    lines.frustumCulled = false;
    lines.userData['isGizmoOccludedGhost'] = true;
    return lines;
  }

  /**
   * Builds the parent group containing front and occluded line passes.
   *
   * @returns The configured root group.
   */
  private createRootGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'bounds_guide_lines';
    group.userData['isBoundsGuideLines'] = true;
    group.visible = false;
    group.add(this.occludedLines);
    group.add(this.frontLines);
    return group;
  }

  /** Allocates zero-length attribute buffers on the shared geometry. */
  private allocateEmptyGeometry(): void {
    this.applyBuffers(this.createEmptyBuffers());
  }

  /**
   * Creates empty attribute arrays for guide ray geometry.
   *
   * @returns Empty buffer set.
   */
  private createEmptyBuffers(): GuideRayBuffers {
    return { positions: [], lineStarts: [], lineEnds: [], colors: [] };
  }

  /**
   * Returns the root group that holds the guide line objects.
   *
   * @returns The guide lines root group.
   */
  getObject(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Returns the shared guide-line buffer geometry.
   *
   * @returns The guide-line buffer geometry.
   */
  getGeometry(): THREE.BufferGeometry {
    return this.geometry;
  }

  /**
   * Shows or hides the guide lines.
   *
   * @param visible Whether the lines should be drawn.
   */
  setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
  }

  /**
   * Returns whether the guide lines are currently visible.
   *
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.rootGroup.visible;
  }

  /**
   * Rebuilds guide rays for the given local half extents. Ray length is fixed
   * and does not scale with object size. Lines are authored in local bounds
   * space (origin at box center).
   *
   * @param halfExtents Local half extents of the oriented bounds.
   */
  updateFromHalfExtents(halfExtents: THREE.Vector3): void {
    const buffers = this.createEmptyBuffers();
    this.appendAllCornerGuides(buffers, halfExtents);
    this.applyBuffers(buffers);
  }

  /**
   * Appends outward X/Y/Z rays for every box corner.
   *
   * @param buffers Attribute accumulators.
   * @param halfExtents Local half extents.
   */
  private appendAllCornerGuides(buffers: GuideRayBuffers, halfExtents: THREE.Vector3): void {
    this.cornerSigns.forEach((signX) => {
      this.cornerSigns.forEach((signY) => {
        this.cornerSigns.forEach((signZ) => {
          this.appendCornerAxisRays(buffers, halfExtents, this.fixedGuideLength, signX, signY, signZ);
        });
      });
    });
  }

  /**
   * Appends three outward axis rays for one corner.
   *
   * @param buffers Attribute accumulators.
   * @param halfExtents Local half extents.
   * @param length Outward ray length.
   * @param signX Corner sign on X (-1 or 1).
   * @param signY Corner sign on Y (-1 or 1).
   * @param signZ Corner sign on Z (-1 or 1).
   */
  private appendCornerAxisRays(
    buffers: GuideRayBuffers,
    halfExtents: THREE.Vector3,
    length: number,
    signX: number,
    signY: number,
    signZ: number,
  ): void {
    const cornerX = signX * halfExtents.x;
    const cornerY = signY * halfExtents.y;
    const cornerZ = signZ * halfExtents.z;
    this.appendRay(buffers, cornerX, cornerY, cornerZ, cornerX + signX * length, cornerY, cornerZ, this.colorX);
    this.appendRay(buffers, cornerX, cornerY, cornerZ, cornerX, cornerY + signY * length, cornerZ, this.colorY);
    this.appendRay(buffers, cornerX, cornerY, cornerZ, cornerX, cornerY, cornerZ + signZ * length, this.colorZ);
  }

  /**
   * Appends one colored ray. lineStart/lineEnd are duplicated on both vertices
   * so the GPU can treat screen endpoints as constants (no depth warp).
   *
   * @param buffers Attribute accumulators.
   * @param ax Corner X.
   * @param ay Corner Y.
   * @param az Corner Z.
   * @param bx Tip X.
   * @param by Tip Y.
   * @param bz Tip Z.
   * @param color Axis color at the solid corner.
   */
  private appendRay(
    buffers: GuideRayBuffers,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    color: THREE.Color,
  ): void {
    // Corner first, tip second for position (color solid → fade).
    buffers.positions.push(ax, ay, az, bx, by, bz);
    // Identical start/end on both vertices — required for constant screen ends.
    buffers.lineStarts.push(ax, ay, az, ax, ay, az);
    buffers.lineEnds.push(bx, by, bz, bx, by, bz);
    this.pushSolidColor(buffers.colors, color);
    this.pushFadedColor(buffers.colors, color);
  }

  /**
   * Pushes a full-intensity RGB triple.
   *
   * @param colors Color component accumulator.
   * @param color Source color.
   */
  private pushSolidColor(colors: number[], color: THREE.Color): void {
    colors.push(color.r, color.g, color.b);
  }

  /**
   * Pushes a dimmed RGB triple that reads as a transparent tip on dark UI.
   *
   * @param colors Color component accumulator.
   * @param color Source color.
   */
  private pushFadedColor(colors: number[], color: THREE.Color): void {
    const fade = 0.35;
    colors.push(color.r * fade, color.g * fade, color.b * fade);
  }

  /**
   * Writes guide ray attribute arrays into the shared line geometry.
   *
   * @param buffers Flat attribute component arrays.
   */
  private applyBuffers(buffers: GuideRayBuffers): void {
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    this.geometry.setAttribute('lineStart', new THREE.Float32BufferAttribute(buffers.lineStarts, 3));
    this.geometry.setAttribute('lineEnd', new THREE.Float32BufferAttribute(buffers.lineEnds, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
    this.geometry.computeBoundingSphere();
  }

  /**
   * Returns the number of line segments currently stored.
   *
   * @returns Segment count (two vertices per segment).
   */
  getSegmentCount(): number {
    const position = this.geometry.getAttribute('position');
    if (!position) return 0;
    return Math.floor(position.count / 2);
  }

  /** Disposes GPU resources held by the guide lines. */
  dispose(): void {
    this.geometry.dispose();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }
}
