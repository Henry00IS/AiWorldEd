import * as THREE from 'three';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { GridLineBuffer } from './grid_line_buffer.js';
import { buildDefaultPlaneFrame, type EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

/** Fixed half-extent of the 3D grid patch in world units. */
const PATCH_HALF_EXTENT = 50;

/**
 * Draw before content meshes (renderOrder 0). Three.js opaque sort uses
 * material.id when renderOrder ties; a detached-pane grid is created late so
 * its LineBasicMaterial would otherwise draw after solids and win coplanar
 * depth ties (grid “in front” until a brush rebuild bumps solid material ids).
 */
export const GRID_3D_RENDER_ORDER = -1;

/**
 * Safety cap on lines per axis. Kept high so the 3D minor cell can match the
 * editor snap interval (and 2D grids) without coarsening.
 */
const MAX_LINES_PER_AXIS = 2000;

/** Peak minor-line strength at the patch center (0..1 over clear color). */
const MINOR_CENTER_STRENGTH = 0.75;

/** Peak section-line strength (every 4 cells) at the patch center. */
const SECTION_CENTER_STRENGTH = 0.95;

/** Peak major-line strength (every 8 cells) at the patch center. */
const MAJOR_CENTER_STRENGTH = 1.0;

/**
 * Camera-following infinite metric floor grid for the perspective viewport.
 * Minor lines, brighter section lines (x4), and strongest major lines (x8).
 * Patch size stays large; line colors fade into the viewport clear color. The
 * floor plane can be reoriented via {@link setPlaneFrame}.
 */
export class InfiniteGrid3D {
  private group: THREE.Group;
  private buffer: GridLineBuffer;
  private cellSize: number;
  private minorColor: THREE.Color;
  private sectionColor: THREE.Color;
  private backgroundColor: THREE.Color;
  private centerColor: THREE.Color;
  private edgeColor: THREE.Color;
  private axisXColor: THREE.Color;
  private axisZColor: THREE.Color;
  private scratchCamPos: THREE.Vector3;
  private planeOrigin: THREE.Vector3;
  private planeUAxis: THREE.Vector3;
  private planeVAxis: THREE.Vector3;
  private planeNormal: THREE.Vector3;
  private scratchOffset: THREE.Vector3;
  private scratchPointA: THREE.Vector3;
  private scratchPointB: THREE.Vector3;
  private displayCell: number;
  private displayLineCount: number;

  /**
   * Creates a 3D infinite floor grid.
   *
   * @param cellSize World size of one grid cell (typically the snap interval).
   */
  constructor(cellSize: number = 0.25) {
    this.group = new THREE.Group();
    this.group.name = 'infinite_grid_3d';
    this.buffer = new GridLineBuffer();
    this.buffer.setDepthTest(true);
    this.buffer.setRenderOrder(GRID_3D_RENDER_ORDER);
    this.group.renderOrder = GRID_3D_RENDER_ORDER;
    this.group.add(this.buffer.getObject());
    this.cellSize = cellSize;
    this.minorColor = new THREE.Color();
    this.sectionColor = new THREE.Color();
    this.backgroundColor = new THREE.Color();
    this.centerColor = new THREE.Color();
    this.edgeColor = new THREE.Color();
    this.axisXColor = new THREE.Color();
    this.axisZColor = new THREE.Color();
    this.themeColorsSync();
    this.scratchCamPos = new THREE.Vector3();
    this.planeOrigin = new THREE.Vector3();
    this.planeUAxis = new THREE.Vector3(1, 0, 0);
    this.planeVAxis = new THREE.Vector3(0, 0, 1);
    this.planeNormal = new THREE.Vector3(0, 1, 0);
    this.scratchOffset = new THREE.Vector3();
    this.scratchPointA = new THREE.Vector3();
    this.scratchPointB = new THREE.Vector3();
    this.displayCell = cellSize;
    this.displayLineCount = 0;
    this.resetPlaneFrame();
  }

  /**
   * Returns the root object to parent in a viewport scene.
   *
   * @returns The grid group.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * Sets the preferred metric cell size (typically the snap interval).
   *
   * @param cellSize World units per cell.
   */
  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(cellSize, 0.001);
  }

  /**
   * Sets the working plane used to generate grid lines.
   *
   * @param frame Plane origin, U/V axes, and normal.
   */
  setPlaneFrame(frame: EditorPlaneFrame): void {
    this.planeOrigin.copy(frame.origin);
    this.planeUAxis.copy(frame.uAxis).normalize();
    this.planeVAxis.copy(frame.vAxis).normalize();
    this.planeNormal.copy(frame.normal).normalize();
  }

  /** Restores the default world XZ floor frame at the origin. */
  resetPlaneFrame(): void {
    this.setPlaneFrame(buildDefaultPlaneFrame());
  }

  /**
   * Returns a copy of the active plane frame.
   *
   * @returns Current plane frame.
   */
  getPlaneFrame(): EditorPlaneFrame {
    return {
      origin: this.planeOrigin.clone(),
      uAxis: this.planeUAxis.clone(),
      vAxis: this.planeVAxis.clone(),
      normal: this.planeNormal.clone(),
    };
  }

  /**
   * Rebuilds the grid centered under the camera on the active plane.
   *
   * @param camera The perspective camera driving the view.
   */
  update(camera: THREE.Camera): void {
    this.themeColorsSync();
    camera.getWorldPosition(this.scratchCamPos);
    this.resolveDisplayCell();
    const cell = this.displayCell;
    const lineCount = this.displayLineCount;
    const camU = this.projectCameraOntoU();
    const camV = this.projectCameraOntoV();
    const offsetU = this.snapTowardCamera(camU, cell);
    const offsetV = this.snapTowardCamera(camV, cell);
    const halfWorld = PATCH_HALF_EXTENT;
    const camDist = Math.hypot(camU, camV);
    this.buffer.beginFrame();
    this.appendMetricLines(offsetU, offsetV, halfWorld, cell, lineCount);
    this.appendPlaneAxes(halfWorld + camDist);
    this.buffer.endFrame();
  }

  /** Copies the active theme's grid, axis, and fade colors into the grid. */
  private themeColorsSync(): void {
    const palette = getActiveThemeViewportPalette();
    this.minorColor.setHex(palette.gridColor);
    this.sectionColor.setHex(palette.gridOriginColor);
    this.backgroundColor.setHex(palette.viewportBackground);
    this.edgeColor.setHex(palette.viewportBackground);
    this.axisXColor.setHex(palette.gridXAxisColor);
    this.axisZColor.setHex(palette.gridZAxisColor);
  }

  /**
   * Resolves the display cell to the editor snap size so 3D matches 2D. Patch
   * coverage stays large; only an extreme safety cap may shrink span. Writes
   * into displayCell / displayLineCount without allocating.
   */
  private resolveDisplayCell(): void {
    const cell = this.cellSize;
    let lineCount = Math.ceil((PATCH_HALF_EXTENT * 2) / cell) + 1;
    if (lineCount > MAX_LINES_PER_AXIS) {
      lineCount = MAX_LINES_PER_AXIS;
    }
    this.displayCell = cell;
    this.displayLineCount = lineCount;
  }

  /**
   * Projects the camera onto the plane U axis relative to the plane origin.
   *
   * @returns Scalar U coordinate of the camera projection.
   */
  private projectCameraOntoU(): number {
    this.scratchOffset.copy(this.scratchCamPos).sub(this.planeOrigin);
    return this.scratchOffset.dot(this.planeUAxis);
  }

  /**
   * Projects the camera onto the plane V axis relative to the plane origin.
   *
   * @returns Scalar V coordinate of the camera projection.
   */
  private projectCameraOntoV(): number {
    this.scratchOffset.copy(this.scratchCamPos).sub(this.planeOrigin);
    return this.scratchOffset.dot(this.planeVAxis);
  }

  /**
   * Snaps a plane-space coordinate to the nearest display-cell boundary.
   *
   * @param value Plane U or V scalar.
   * @param cell Display cell size.
   * @returns Snapped origin for the patch.
   */
  private snapTowardCamera(value: number, cell: number): number {
    return value - this.moduloTowardZero(value, cell);
  }

  /**
   * Draws minor, section, and major grid lines with edge fade. Section/major
   * ranks use plane U/V coordinates so bright lines stay plane-locked.
   *
   * @param offsetU Snapped camera U.
   * @param offsetV Snapped camera V.
   * @param halfWorld Half patch extent in world units.
   * @param cell Display cell size.
   * @param lineCount Number of lines along each axis.
   */
  private appendMetricLines(
    offsetU: number,
    offsetV: number,
    halfWorld: number,
    cell: number,
    lineCount: number,
  ): void {
    const start = -Math.floor(lineCount / 2);
    const sectionStep = cell * 4;
    const majorStep = cell * 8;
    for (let i = 0; i < lineCount; i++) {
      const index = start + i;
      const radial = this.computeRadialFalloff(index, lineCount);
      const u = offsetU + index * cell;
      const v = offsetV + index * cell;
      this.assignLineColors(this.classifyWorldRank(u, sectionStep, majorStep), radial);
      this.appendSplitLineConstantU(u, offsetV, halfWorld);
      this.assignLineColors(this.classifyWorldRank(v, sectionStep, majorStep), radial);
      this.appendSplitLineConstantV(v, offsetU, halfWorld);
    }
  }

  /**
   * Radial falloff from patch center to edge (1 at center, 0 at edge).
   *
   * @param index Signed line index relative to the patch center.
   * @param lineCount Total lines on this axis.
   * @returns Falloff 0..1.
   */
  private computeRadialFalloff(index: number, lineCount: number): number {
    const half = Math.max(lineCount * 0.5, 1);
    const radial = THREE.MathUtils.clamp(1 - Math.abs(index) / half, 0, 1);
    return radial * radial;
  }

  /**
   * Sets center/edge colors for a line based on minor/section/major hierarchy.
   *
   * @param rank Plane-locked line rank.
   * @param radial Edge falloff 0..1.
   */
  private assignLineColors(rank: 'minor' | 'section' | 'major', radial: number): void {
    let strength = MINOR_CENTER_STRENGTH;
    let source = this.minorColor;
    if (rank === 'section') {
      strength = SECTION_CENTER_STRENGTH;
      source = this.sectionColor;
    }
    if (rank === 'major') {
      strength = MAJOR_CENTER_STRENGTH;
      source = this.sectionColor;
    }
    this.centerColor.copy(this.backgroundColor).lerp(source, radial * strength);
    this.edgeColor.copy(this.backgroundColor);
  }

  /**
   * Classifies a plane-space line coordinate as minor, section, or major.
   *
   * @param planeCoordinate Plane U or V of the line.
   * @param sectionStep Spacing for section lines.
   * @param majorStep Spacing for major lines.
   * @returns Line hierarchy rank.
   */
  private classifyWorldRank(
    planeCoordinate: number,
    sectionStep: number,
    majorStep: number,
  ): 'minor' | 'section' | 'major' {
    if (this.isMultipleOf(planeCoordinate, majorStep)) return 'major';
    if (this.isMultipleOf(planeCoordinate, sectionStep)) return 'section';
    return 'minor';
  }

  /**
   * Returns true when value is an integer multiple of step (float-safe).
   *
   * @param value Plane coordinate.
   * @param step Step size.
   * @returns Whether the coordinate sits on that step.
   */
  private isMultipleOf(value: number, step: number): boolean {
    if (step <= 0) return false;
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
  }

  /**
   * Draws one constant-U line as two halves meeting at the patch center.
   *
   * @param u Plane U of the line.
   * @param centerV Patch center V.
   * @param halfWorld Half patch extent.
   */
  private appendSplitLineConstantU(u: number, centerV: number, halfWorld: number): void {
    this.planePointToWorld(u, centerV, this.scratchPointA);
    this.planePointToWorld(u, centerV + halfWorld, this.scratchPointB);
    this.addWorldLine(this.scratchPointA, this.scratchPointB);
    this.planePointToWorld(u, centerV - halfWorld, this.scratchPointB);
    this.addWorldLine(this.scratchPointA, this.scratchPointB);
  }

  /**
   * Draws one constant-V line as two halves meeting at the patch center.
   *
   * @param v Plane V of the line.
   * @param centerU Patch center U.
   * @param halfWorld Half patch extent.
   */
  private appendSplitLineConstantV(v: number, centerU: number, halfWorld: number): void {
    this.planePointToWorld(centerU, v, this.scratchPointA);
    this.planePointToWorld(centerU + halfWorld, v, this.scratchPointB);
    this.addWorldLine(this.scratchPointA, this.scratchPointB);
    this.planePointToWorld(centerU - halfWorld, v, this.scratchPointB);
    this.addWorldLine(this.scratchPointA, this.scratchPointB);
  }

  /**
   * Maps plane U/V coordinates to world space.
   *
   * @param u Plane U scalar.
   * @param v Plane V scalar.
   * @param target Output world point.
   */
  private planePointToWorld(u: number, v: number, target: THREE.Vector3): void {
    target.copy(this.planeOrigin).addScaledVector(this.planeUAxis, u).addScaledVector(this.planeVAxis, v);
  }

  /**
   * Appends a world-space line segment using the current line colors.
   *
   * @param a Segment start.
   * @param b Segment end.
   */
  private addWorldLine(a: THREE.Vector3, b: THREE.Vector3): void {
    this.buffer.addLine(a.x, a.y, a.z, b.x, b.y, b.z, this.centerColor, this.edgeColor);
  }

  /**
   * Draws plane U and V axes through the plane origin.
   *
   * @param axisLength Half-length of each axis line.
   */
  private appendPlaneAxes(axisLength: number): void {
    this.planePointToWorld(0, 0, this.scratchPointA);
    this.appendAxisSegment(axisLength, 0, this.axisXColor);
    this.appendAxisSegment(-axisLength, 0, this.axisXColor);
    this.appendAxisSegment(0, axisLength, this.axisZColor);
    this.appendAxisSegment(0, -axisLength, this.axisZColor);
  }

  /**
   * Draws one axis segment from the plane origin to a plane U/V point.
   *
   * @param u Plane U of the segment end.
   * @param v Plane V of the segment end.
   * @param color Axis color.
   */
  private appendAxisSegment(u: number, v: number, color: THREE.Color): void {
    this.planePointToWorld(u, v, this.scratchPointB);
    this.buffer.addLine(
      this.scratchPointA.x,
      this.scratchPointA.y,
      this.scratchPointA.z,
      this.scratchPointB.x,
      this.scratchPointB.y,
      this.scratchPointB.z,
      color,
      this.edgeColor,
    );
  }

  /**
   * Floating-point modulo that truncates toward zero.
   *
   * @param value Dividend.
   * @param modulus Divisor.
   * @returns Remainder with the sign of value.
   */
  private moduloTowardZero(value: number, modulus: number): number {
    return value - Math.trunc(value / modulus) * modulus;
  }

  /**
   * Returns the number of line segments drawn in the last update.
   *
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return this.buffer.getSegmentCount();
  }

  /**
   * Returns the world half-extent of the grid patch.
   *
   * @returns Half-extent in world units.
   */
  getPatchHalfExtent(): number {
    return PATCH_HALF_EXTENT;
  }

  /** Disposes grid resources. */
  dispose(): void {
    this.buffer.dispose();
  }
}
