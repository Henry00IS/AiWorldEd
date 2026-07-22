import * as THREE from 'three';
import { Theme } from '../theme.js';
import { GridLineBuffer } from './grid_line_buffer.js';

/** Fixed half-extent of the 3D grid patch in world units. */
const PATCH_HALF_EXTENT = 50;

/**
 * Safety cap on lines per axis. Kept high so the 3D minor cell can match
 * the editor snap interval (and 2D grids) without coarsening.
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
 * Patch size stays large; line colors fade into the viewport clear color.
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

  /**
   * Creates a 3D infinite floor grid.
   * @param cellSize World size of one grid cell (typically the snap interval).
   */
  constructor(cellSize: number = 0.25) {
    this.group = new THREE.Group();
    this.group.name = 'infinite_grid_3d';
    this.buffer = new GridLineBuffer();
    this.group.add(this.buffer.getObject());
    this.cellSize = cellSize;
    this.minorColor = new THREE.Color(Theme.gridColor);
    this.sectionColor = new THREE.Color(Theme.gridOriginColor);
    this.backgroundColor = new THREE.Color(Theme.viewportBackground);
    this.centerColor = new THREE.Color();
    this.edgeColor = new THREE.Color(Theme.viewportBackground);
    this.axisXColor = new THREE.Color(Theme.gridXAxisColor);
    this.axisZColor = new THREE.Color(Theme.gridZAxisColor);
    this.scratchCamPos = new THREE.Vector3();
  }

  /**
   * Returns the root object to parent in a viewport scene.
   * @returns The grid group.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * Sets the preferred metric cell size (typically the snap interval).
   * @param cellSize World units per cell.
   */
  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(cellSize, 0.001);
  }

  /**
   * Rebuilds the grid centered under the camera on the XZ plane.
   * @param camera The perspective camera driving the view.
   */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.scratchCamPos);
    const display = this.resolveDisplayCell();
    const cell = display.cell;
    const lineCount = display.lineCount;
    const offsetX = this.snapTowardCamera(this.scratchCamPos.x, cell);
    const offsetZ = this.snapTowardCamera(this.scratchCamPos.z, cell);
    const halfWorld = PATCH_HALF_EXTENT;
    const camDist = Math.hypot(this.scratchCamPos.x, this.scratchCamPos.z);
    this.buffer.beginFrame();
    this.appendMetricLines(offsetX, offsetZ, halfWorld, cell, lineCount);
    this.appendWorldAxes(halfWorld + camDist);
    this.buffer.endFrame();
  }

  /**
   * Resolves the display cell to the editor snap size so 3D matches 2D.
   * Patch coverage stays large; only an extreme safety cap may shrink span.
   * @returns Display cell size and number of lines per axis.
   */
  private resolveDisplayCell(): { cell: number; lineCount: number } {
    const cell = this.cellSize;
    let lineCount = Math.ceil((PATCH_HALF_EXTENT * 2) / cell) + 1;
    if (lineCount > MAX_LINES_PER_AXIS) {
      lineCount = MAX_LINES_PER_AXIS;
    }
    return { cell, lineCount };
  }

  /**
   * Snaps a camera coordinate to the nearest display-cell boundary.
   * @param value Camera X or Z.
   * @param cell Display cell size.
   * @returns Snapped origin for the patch.
   */
  private snapTowardCamera(value: number, cell: number): number {
    return value - this.moduloTowardZero(value, cell);
  }

  /**
   * Draws minor, section, and major grid lines with edge fade.
   * Section/major ranks use world coordinates so bright lines stay world-locked.
   * @param offsetX Snapped camera X.
   * @param offsetZ Snapped camera Z.
   * @param halfWorld Half patch extent in world units.
   * @param cell Display cell size.
   * @param lineCount Number of lines along each axis.
   */
  private appendMetricLines(
    offsetX: number,
    offsetZ: number,
    halfWorld: number,
    cell: number,
    lineCount: number
  ): void {
    const start = -Math.floor(lineCount / 2);
    const sectionStep = cell * 4;
    const majorStep = cell * 8;
    for (let i = 0; i < lineCount; i++) {
      const index = start + i;
      const radial = this.computeRadialFalloff(index, lineCount);
      const x = offsetX + index * cell;
      const z = offsetZ + index * cell;
      this.assignLineColors(this.classifyWorldRank(x, sectionStep, majorStep), radial);
      this.appendSplitLineX(x, offsetZ, halfWorld);
      this.assignLineColors(this.classifyWorldRank(z, sectionStep, majorStep), radial);
      this.appendSplitLineZ(z, offsetX, halfWorld);
    }
  }

  /**
   * Radial falloff from patch center to edge (1 at center, 0 at edge).
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
   * @param rank World-locked line rank.
   * @param radial Edge falloff 0..1.
   */
  private assignLineColors(
    rank: 'minor' | 'section' | 'major',
    radial: number
  ): void {
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
    this.centerColor
      .copy(this.backgroundColor)
      .lerp(source, radial * strength);
    this.edgeColor.copy(this.backgroundColor);
  }

  /**
   * Classifies a world-space line coordinate as minor, section, or major.
   * Uses world multiples so bright lines do not follow the camera.
   * @param worldCoordinate World X or Z of the line.
   * @param sectionStep World spacing for section lines.
   * @param majorStep World spacing for major lines.
   * @returns Line hierarchy rank.
   */
  private classifyWorldRank(
    worldCoordinate: number,
    sectionStep: number,
    majorStep: number
  ): 'minor' | 'section' | 'major' {
    if (this.isMultipleOf(worldCoordinate, majorStep)) return 'major';
    if (this.isMultipleOf(worldCoordinate, sectionStep)) return 'section';
    return 'minor';
  }

  /**
   * Returns true when value is an integer multiple of step (float-safe).
   * @param value World coordinate.
   * @param step Step size.
   * @returns Whether the coordinate sits on that step.
   */
  private isMultipleOf(value: number, step: number): boolean {
    if (step <= 0) return false;
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
  }

  /**
   * Draws one X-constant line as two halves meeting at the patch center.
   * @param x World X of the line.
   * @param centerZ Patch center Z.
   * @param halfWorld Half patch extent.
   */
  private appendSplitLineX(
    x: number,
    centerZ: number,
    halfWorld: number
  ): void {
    this.buffer.addLine(
      x, 0, centerZ,
      x, 0, centerZ + halfWorld,
      this.centerColor, this.edgeColor
    );
    this.buffer.addLine(
      x, 0, centerZ,
      x, 0, centerZ - halfWorld,
      this.centerColor, this.edgeColor
    );
  }

  /**
   * Draws one Z-constant line as two halves meeting at the patch center.
   * @param z World Z of the line.
   * @param centerX Patch center X.
   * @param halfWorld Half patch extent.
   */
  private appendSplitLineZ(
    z: number,
    centerX: number,
    halfWorld: number
  ): void {
    this.buffer.addLine(
      centerX, 0, z,
      centerX + halfWorld, 0, z,
      this.centerColor, this.edgeColor
    );
    this.buffer.addLine(
      centerX, 0, z,
      centerX - halfWorld, 0, z,
      this.centerColor, this.edgeColor
    );
  }

  /**
   * Draws the global world X and Z axes through the origin.
   * @param axisLength Half-length of each axis line.
   */
  private appendWorldAxes(axisLength: number): void {
    this.buffer.addLine(0, 0, 0, axisLength, 0, 0, this.axisXColor, this.edgeColor);
    this.buffer.addLine(0, 0, 0, -axisLength, 0, 0, this.axisXColor, this.edgeColor);
    this.buffer.addLine(0, 0, 0, 0, 0, axisLength, this.axisZColor, this.edgeColor);
    this.buffer.addLine(0, 0, 0, 0, 0, -axisLength, this.axisZColor, this.edgeColor);
  }

  /**
   * Floating-point modulo that truncates toward zero.
   * @param value Dividend.
   * @param modulus Divisor.
   * @returns Remainder with the sign of value.
   */
  private moduloTowardZero(value: number, modulus: number): number {
    return value - Math.trunc(value / modulus) * modulus;
  }

  /**
   * Returns the number of line segments drawn in the last update.
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return this.buffer.getSegmentCount();
  }

  /**
   * Returns the world half-extent of the grid patch.
   * @returns Half-extent in world units.
   */
  getPatchHalfExtent(): number {
    return PATCH_HALF_EXTENT;
  }

  /**
   * Disposes grid resources.
   */
  dispose(): void {
    this.buffer.dispose();
  }
}
