import * as THREE from 'three';
import { Theme } from '../theme.js';
import {
  GizmoVisualStyle,
  createGizmoFrontLineMaterial,
  createGizmoOccludedLineMaterial
} from './gizmo_visual_style.js';

/**
 * Draws RGB axis guide rays from each corner of an oriented bounds box.
 * Solid color at the corner fades toward a transparent tip, matching
 * classic brush editor construction guides.
 * Uses the same front/occluded dual-pass as move and rotate gizmos so
 * segments that enter existing geometry draw semi-transparent.
 */
export class BoundsGuideLines {
  private rootGroup: THREE.Group;
  private geometry: THREE.BufferGeometry;
  private frontMaterial: THREE.LineBasicMaterial;
  private occludedMaterial: THREE.LineBasicMaterial;
  private frontLines: THREE.LineSegments;
  private occludedLines: THREE.LineSegments;
  private fixedGuideLength: number;
  private colorX: THREE.Color;
  private colorY: THREE.Color;
  private colorZ: THREE.Color;
  private readonly cornerSigns: ReadonlyArray<number>;

  /**
   * Creates guide-line geometry using theme axis colors.
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
    this.frontMaterial = createGizmoFrontLineMaterial();
    this.occludedMaterial = createGizmoOccludedLineMaterial();
    this.frontLines = this.createFrontLineSegments();
    this.occludedLines = this.createOccludedLineSegments();
    this.rootGroup = this.createRootGroup();
    this.allocateEmptyGeometry();
  }

  /**
   * Builds the front LineSegments with standard gizmo depth testing.
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
   * @returns Configured occluded line object.
   */
  private createOccludedLineSegments(): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, this.occludedMaterial);
    lines.name = 'bounds_guide_lines_occluded';
    lines.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    lines.frustumCulled = false;
    lines.userData.isGizmoOccludedGhost = true;
    return lines;
  }

  /**
   * Builds the parent group containing front and occluded line passes.
   * @returns Root group for parenting under the bounds gizmo.
   */
  private createRootGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'bounds_guide_lines';
    group.userData.isBoundsGuideLines = true;
    group.visible = false;
    group.add(this.occludedLines);
    group.add(this.frontLines);
    return group;
  }

  /**
   * Allocates zero-length buffers until the first bounds update.
   */
  private allocateEmptyGeometry(): void {
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([], 3)
    );
    this.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([], 3)
    );
  }

  /**
   * Returns the root group to parent under the bounds gizmo root.
   * @returns The guide lines group containing front and occluded passes.
   */
  getObject(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Returns the shared guide-line geometry for inspection and tests.
   * @returns The buffer geometry used by both line passes.
   */
  getGeometry(): THREE.BufferGeometry {
    return this.geometry;
  }

  /**
   * Shows or hides the guide lines.
   * @param visible Whether the lines should be drawn.
   */
  setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
  }

  /**
   * Returns whether the guide lines are currently visible.
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.rootGroup.visible;
  }

  /**
   * Rebuilds guide rays for the given local half extents.
   * Ray length is fixed and does not scale with object size.
   * Lines are authored in local bounds space (origin at box center).
   * @param halfExtents Local half extents of the oriented bounds.
   */
  updateFromHalfExtents(halfExtents: THREE.Vector3): void {
    const positions: number[] = [];
    const colors: number[] = [];
    this.appendAllCornerGuides(positions, colors, halfExtents);
    this.applyBuffers(positions, colors);
  }

  /**
   * Appends outward X/Y/Z rays for every box corner.
   * @param positions Position component accumulator.
   * @param colors Color component accumulator.
   * @param halfExtents Local half extents.
   */
  private appendAllCornerGuides(
    positions: number[],
    colors: number[],
    halfExtents: THREE.Vector3
  ): void {
    this.cornerSigns.forEach((signX) => {
      this.cornerSigns.forEach((signY) => {
        this.cornerSigns.forEach((signZ) => {
          this.appendCornerAxisRays(
            positions,
            colors,
            halfExtents,
            this.fixedGuideLength,
            signX,
            signY,
            signZ
          );
        });
      });
    });
  }

  /**
   * Appends three outward axis rays for one corner.
   * @param positions Position component accumulator.
   * @param colors Color component accumulator.
   * @param halfExtents Local half extents.
   * @param length Outward ray length.
   * @param signX Corner sign on X (-1 or 1).
   * @param signY Corner sign on Y (-1 or 1).
   * @param signZ Corner sign on Z (-1 or 1).
   */
  private appendCornerAxisRays(
    positions: number[],
    colors: number[],
    halfExtents: THREE.Vector3,
    length: number,
    signX: number,
    signY: number,
    signZ: number
  ): void {
    const cornerX = signX * halfExtents.x;
    const cornerY = signY * halfExtents.y;
    const cornerZ = signZ * halfExtents.z;
    this.appendRay(
      positions, colors,
      cornerX, cornerY, cornerZ,
      cornerX + signX * length, cornerY, cornerZ,
      this.colorX
    );
    this.appendRay(
      positions, colors,
      cornerX, cornerY, cornerZ,
      cornerX, cornerY + signY * length, cornerZ,
      this.colorY
    );
    this.appendRay(
      positions, colors,
      cornerX, cornerY, cornerZ,
      cornerX, cornerY, cornerZ + signZ * length,
      this.colorZ
    );
  }

  /**
   * Appends one colored ray with a solid start and faded tip.
   * @param positions Position component accumulator.
   * @param colors Color component accumulator.
   * @param ax Start X.
   * @param ay Start Y.
   * @param az Start Z.
   * @param bx End X.
   * @param by End Y.
   * @param bz End Z.
   * @param color Axis color at the solid end.
   */
  private appendRay(
    positions: number[],
    colors: number[],
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    color: THREE.Color
  ): void {
    positions.push(ax, ay, az, bx, by, bz);
    this.pushSolidColor(colors, color);
    this.pushFadedColor(colors, color);
  }

  /**
   * Pushes a full-intensity RGB triple.
   * @param colors Color component accumulator.
   * @param color Source color.
   */
  private pushSolidColor(colors: number[], color: THREE.Color): void {
    colors.push(color.r, color.g, color.b);
  }

  /**
   * Pushes a dimmed RGB triple that reads as a transparent tip on dark UI.
   * @param colors Color component accumulator.
   * @param color Source color.
   */
  private pushFadedColor(colors: number[], color: THREE.Color): void {
    const fade = 0.35;
    colors.push(color.r * fade, color.g * fade, color.b * fade);
  }

  /**
   * Writes position and color arrays into the line geometry.
   * @param positions Flat position components.
   * @param colors Flat color components.
   */
  private applyBuffers(positions: number[], colors: number[]): void {
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );
    this.geometry.computeBoundingSphere();
  }

  /**
   * Returns the number of line segments currently stored.
   * @returns Segment count (two vertices per segment).
   */
  getSegmentCount(): number {
    const position = this.geometry.getAttribute('position');
    if (!position) return 0;
    return Math.floor(position.count / 2);
  }

  /**
   * Disposes GPU resources held by the guide lines.
   */
  dispose(): void {
    this.geometry.dispose();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }
}
