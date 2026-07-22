import * as THREE from 'three';
import { Theme } from '../theme.js';
import { GridPlane } from './grid_plane.js';
import { GridLineBuffer } from './grid_line_buffer.js';

/**
 * Adaptive infinite orthographic grid for 2D viewports.
 * Uses an adaptive base cell (grows when zoomed out) with minor lines,
 * brighter section lines every 4 cells, and strongest lines every 8 cells.
 * Minor lines fade smoothly between LOD steps so major quads never pop.
 */
export class InfiniteGrid2D {
  private group: THREE.Group;
  private buffer: GridLineBuffer;
  private plane: GridPlane;
  private snapInterval: number;
  private minorColor: THREE.Color;
  private sectionColor: THREE.Color;
  private backgroundColor: THREE.Color;
  private axisUColor: THREE.Color;
  private axisVColor: THREE.Color;
  private workMinor: THREE.Color;
  private workSection: THREE.Color;
  private workMajor: THREE.Color;
  private workBlended: THREE.Color;
  private scratchOrigin: THREE.Vector3;

  /**
   * Creates a 2D infinite grid for the given plane.
   * @param plane World plane the grid lies on.
   * @param snapInterval Base snap cell size in world units.
   */
  constructor(plane: GridPlane, snapInterval: number = 0.25) {
    this.group = new THREE.Group();
    this.group.name = 'infinite_grid_2d';
    this.buffer = new GridLineBuffer();
    this.group.add(this.buffer.getObject());
    this.plane = plane;
    this.snapInterval = Math.max(snapInterval, 0.001);
    this.minorColor = new THREE.Color(Theme.gridColor);
    this.sectionColor = new THREE.Color(Theme.gridOriginColor);
    this.backgroundColor = new THREE.Color(Theme.viewportBackground);
    this.axisUColor = new THREE.Color(this.resolveAxisUColor(plane));
    this.axisVColor = new THREE.Color(this.resolveAxisVColor(plane));
    this.workMinor = new THREE.Color();
    this.workSection = new THREE.Color();
    this.workMajor = new THREE.Color();
    this.workBlended = new THREE.Color();
    this.scratchOrigin = new THREE.Vector3();
  }

  /**
   * Returns the root object to parent in a viewport scene.
   * @returns The grid group.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * Updates the base snap cell size used for LOD selection.
   * @param snapInterval Snap interval in world units.
   */
  setSnapInterval(snapInterval: number): void {
    this.snapInterval = Math.max(snapInterval, 0.001);
  }

  /**
   * Rebuilds grid lines for the current orthographic view.
   * @param camera The orthographic camera for this viewport.
   */
  update(camera: THREE.OrthographicCamera): void {
    const view = this.computeViewBounds(camera);
    const lod = this.computeAdaptiveLod(camera);
    this.buffer.beginFrame();
    this.appendGridLines(view, lod.cell, lod.minorFade);
    this.appendCenterAxes(view);
    this.buffer.endFrame();
  }

  /**
   * Computes world-space U/V bounds of the orthographic view on this plane.
   * @param camera Orthographic camera.
   * @returns Min/max along plane U and V axes.
   */
  private computeViewBounds(camera: THREE.OrthographicCamera): {
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
  } {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.scratchOrigin);
    const corners = this.buildFrustumCorners(camera);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    corners.forEach((corner) => {
      const uv = this.worldToPlaneUV(corner);
      minU = Math.min(minU, uv.u);
      maxU = Math.max(maxU, uv.u);
      minV = Math.min(minV, uv.v);
      maxV = Math.max(maxV, uv.v);
    });
    const pad = Math.max(this.snapInterval, (maxU - minU) * 0.02);
    return {
      minU: minU - pad,
      maxU: maxU + pad,
      minV: minV - pad,
      maxV: maxV + pad
    };
  }

  /**
   * Builds the four near-plane frustum corners in world space.
   * @param camera Orthographic camera.
   * @returns Corner positions.
   */
  private buildFrustumCorners(camera: THREE.OrthographicCamera): THREE.Vector3[] {
    const corners: THREE.Vector3[] = [];
    const ndc = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ];
    ndc.forEach(([x, y]) => {
      corners.push(new THREE.Vector3(x, y, 0).unproject(camera));
    });
    return corners;
  }

  /**
   * Projects a world point onto plane UV coordinates.
   * @param point World position.
   * @returns Plane U/V components.
   */
  private worldToPlaneUV(point: THREE.Vector3): { u: number; v: number } {
    if (this.plane === 'xz') return { u: point.x, v: point.z };
    if (this.plane === 'xy') return { u: point.x, v: point.y };
    return { u: point.z, v: point.y };
  }

  /**
   * Converts plane UV coordinates back to a world point on the grid plane.
   * @param u Plane U.
   * @param v Plane V.
   * @returns World position on the plane.
   */
  private planeUVToWorld(u: number, v: number): THREE.Vector3 {
    if (this.plane === 'xz') return new THREE.Vector3(u, 0, v);
    if (this.plane === 'xy') return new THREE.Vector3(u, v, 0);
    return new THREE.Vector3(0, v, u);
  }

  /**
   * Picks an adaptive cell size and minor-line fade for the current zoom.
   * Cell grows by 4x when too dense; minorFade smoothly eases within a LOD band.
   * @param camera Orthographic camera.
   * @returns Display cell size and minor-line visibility 0..1.
   */
  private computeAdaptiveLod(camera: THREE.OrthographicCamera): {
    cell: number;
    minorFade: number;
  } {
    let cell = this.snapInterval;
    let factor = this.measureCellScreenFactor(camera, cell);
    let steps = 0;
    const maxLodSteps = 32;
    while (factor <= 0.25 && steps < maxLodSteps) {
      cell *= 4;
      factor = this.measureCellScreenFactor(camera, cell);
      steps += 1;
    }
    const minorFade = THREE.MathUtils.clamp(
      THREE.MathUtils.inverseLerp(0.35, 1.0, factor),
      0,
      1
    );
    return { cell, minorFade };
  }

  /**
   * Estimates relative on-screen size of one cell (ShapeEditor-style factor).
   * @param camera Orthographic camera.
   * @param cell Cell size in world units.
   * @returns Clamped factor 0..1.
   */
  private measureCellScreenFactor(
    camera: THREE.OrthographicCamera,
    cell: number
  ): number {
    const viewHeight = Math.abs(camera.top - camera.bottom);
    if (viewHeight <= 0) return 1;
    const referencePixels = 800;
    const cellPixels = (cell / viewHeight) * referencePixels;
    return THREE.MathUtils.clamp(Math.round(cellPixels) / 8, 0, 1);
  }

  /**
   * Draws minor, section (x4), and major (x8) lines for the current LOD.
   * @param view Visible plane bounds.
   * @param cell Adaptive cell size.
   * @param minorFade Minor-line opacity 0..1.
   */
  private appendGridLines(
    view: { minU: number; maxU: number; minV: number; maxV: number },
    cell: number,
    minorFade: number
  ): void {
    const cell4 = cell * 4;
    const cell8 = cell * 8;
    this.prepareLineColors(minorFade);
    let u = this.snapDown(view.minU, cell);
    while (u <= view.maxU + cell * 0.5) {
      const color = this.colorForCoordinate(u, cell, cell4, cell8, minorFade);
      this.appendConstantULine(u, view.minV, view.maxV, color);
      u += cell;
    }
    let v = this.snapDown(view.minV, cell);
    while (v <= view.maxV + cell * 0.5) {
      const color = this.colorForCoordinate(v, cell, cell4, cell8, minorFade);
      this.appendConstantVLine(v, view.minU, view.maxU, color);
      v += cell;
    }
  }

  /**
   * Prepares minor/section/major colors for the current minor fade.
   * @param minorFade Minor-line visibility 0..1.
   */
  private prepareLineColors(minorFade: number): void {
    this.workMinor.copy(this.backgroundColor).lerp(this.minorColor, minorFade);
    this.workSection
      .copy(this.backgroundColor)
      .lerp(this.sectionColor, THREE.MathUtils.lerp(0.55, 1, minorFade));
    this.workMajor.copy(this.backgroundColor).lerp(this.sectionColor, 1);
  }

  /**
   * Picks the line color for a grid coordinate from the minor/section/major hierarchy.
   * @param coordinate Line coordinate on the plane axis.
   * @param cell Base cell size.
   * @param cell4 Section spacing.
   * @param cell8 Major spacing.
   * @param minorFade Minor visibility (skips pure-minor lines when fully faded).
   * @returns Color for that line.
   */
  private colorForCoordinate(
    coordinate: number,
    cell: number,
    cell4: number,
    cell8: number,
    minorFade: number
  ): THREE.Color {
    if (this.isMultipleOf(coordinate, cell8)) {
      return this.workMajor;
    }
    if (this.isMultipleOf(coordinate, cell4)) {
      this.workBlended.lerpColors(this.workSection, this.workMajor, 0.35);
      return this.workBlended;
    }
    if (minorFade <= 0.001) {
      return this.backgroundColor;
    }
    return this.workMinor;
  }

  /**
   * Draws a line of constant U across the V range.
   * @param u Constant U.
   * @param minV Range start V.
   * @param maxV Range end V.
   * @param color Line color.
   */
  private appendConstantULine(
    u: number,
    minV: number,
    maxV: number,
    color: THREE.Color
  ): void {
    const a = this.planeUVToWorld(u, minV);
    const b = this.planeUVToWorld(u, maxV);
    this.buffer.addLine(a.x, a.y, a.z, b.x, b.y, b.z, color, color);
  }

  /**
   * Draws a line of constant V across the U range.
   * @param v Constant V.
   * @param minU Range start U.
   * @param maxU Range end U.
   * @param color Line color.
   */
  private appendConstantVLine(
    v: number,
    minU: number,
    maxU: number,
    color: THREE.Color
  ): void {
    const a = this.planeUVToWorld(minU, v);
    const b = this.planeUVToWorld(maxU, v);
    this.buffer.addLine(a.x, a.y, a.z, b.x, b.y, b.z, color, color);
  }

  /**
   * Draws the highlighted center axes through the origin.
   * @param view Visible plane bounds.
   */
  private appendCenterAxes(view: {
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
  }): void {
    this.appendConstantVLine(0, view.minU, view.maxU, this.axisUColor);
    this.appendConstantULine(0, view.minV, view.maxV, this.axisVColor);
  }

  /**
   * Snaps a value down to the previous multiple of step.
   * @param value Input value.
   * @param step Step size.
   * @returns Snapped value.
   */
  private snapDown(value: number, step: number): number {
    return Math.floor(value / step) * step;
  }

  /**
   * Returns true when value is an integer multiple of step (float-safe).
   * @param value Coordinate.
   * @param step Step size.
   * @returns Whether value is on a major step.
   */
  private isMultipleOf(value: number, step: number): boolean {
    if (step <= 0) return false;
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
  }

  /**
   * Resolves the U-axis accent color for the plane.
   * @param plane Grid plane.
   * @returns Hex color.
   */
  private resolveAxisUColor(plane: GridPlane): number {
    if (plane === 'yz') return Theme.gridZAxisColor;
    return Theme.gridXAxisColor;
  }

  /**
   * Resolves the V-axis accent color for the plane.
   * @param plane Grid plane.
   * @returns Hex color.
   */
  private resolveAxisVColor(plane: GridPlane): number {
    if (plane === 'xz') return Theme.gridZAxisColor;
    return Theme.gridYAxisColor;
  }

  /**
   * Returns segment count from the last update.
   * @returns Number of line segments.
   */
  getSegmentCount(): number {
    return this.buffer.getSegmentCount();
  }

  /**
   * Disposes grid resources.
   */
  dispose(): void {
    this.buffer.dispose();
  }
}
