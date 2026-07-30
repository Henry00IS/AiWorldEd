import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { GridPlane } from './grid_plane.js';
import { GridLineBuffer } from './grid_line_buffer.js';

/** Reusable orthographic view bounds on a grid plane. */
interface GridViewBounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

/** Reusable adaptive LOD result for the current zoom. */
interface GridLodResult {
  cell: number;
  minorFade: number;
}

/** Reusable plane UV pair. */
interface GridPlaneUv {
  u: number;
  v: number;
}

/**
 * Adaptive infinite orthographic grid for 2D viewports. Uses an adaptive base
 * cell (grows when zoomed out) with minor lines, brighter section lines every 4
 * cells, and strongest lines every 8 cells. Minor lines fade smoothly between
 * LOD steps so major quads never pop.
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
  private scratchViewDirection: THREE.Vector3;
  private scratchWorldPoint: THREE.Vector3;
  private scratchCorners: THREE.Vector3[];
  private scratchViewBounds: GridViewBounds;
  private scratchLod: GridLodResult;
  private scratchUv: GridPlaneUv;

  /**
   * Creates a 2D infinite grid for the given plane.
   *
   * @param plane World plane the grid lies on.
   * @param snapInterval Base snap cell size in world units.
   */
  constructor(plane: GridPlane, snapInterval: number = 0.25) {
    this.group = new THREE.Group();
    this.group.name = 'infinite_grid_2d';
    this.buffer = new GridLineBuffer();
    this.buffer.setDepthTest(false);
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
    this.scratchViewDirection = new THREE.Vector3();
    this.scratchWorldPoint = new THREE.Vector3();
    this.scratchCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.scratchViewBounds = { minU: 0, maxU: 0, minV: 0, maxV: 0 };
    this.scratchLod = { cell: 0, minorFade: 0 };
    this.scratchUv = { u: 0, v: 0 };
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
   * Updates the base snap cell size used for LOD selection.
   *
   * @param snapInterval Snap interval in world units.
   */
  setSnapInterval(snapInterval: number): void {
    this.snapInterval = Math.max(snapInterval, 0.001);
  }

  /**
   * Changes the highlighted colors for the grid's physical U and V axes.
   *
   * @param uColor Color for the U axis.
   * @param vColor Color for the V axis.
   */
  setAxisColors(uColor: number, vColor: number): void {
    this.axisUColor.setHex(uColor);
    this.axisVColor.setHex(vColor);
  }

  /**
   * Rebuilds grid lines for the current orthographic view. Lines are placed at
   * mid frustum depth so content-driven near/far ranging never clips them.
   *
   * @param camera The orthographic camera for this viewport.
   */
  update(camera: THREE.OrthographicCamera): void {
    const view = this.computeViewBounds(camera);
    const planeDepth = this.computePlaneDepth(camera);
    const lod = this.computeAdaptiveLod(camera);
    this.buffer.beginFrame();
    this.appendGridLines(view, lod.cell, lod.minorFade, planeDepth);
    this.appendCenterAxes(view, planeDepth);
    this.buffer.endFrame();
  }

  /**
   * Resolves the constant-axis world value for the grid plane so geometry sits
   * inside the camera near/far volume (midway between near and far).
   *
   * @param camera Orthographic camera after depth ranging.
   * @returns World X (yz), Y (xz), or Z (xy) for the grid plane.
   */
  private computePlaneDepth(camera: THREE.OrthographicCamera): number {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this.scratchViewDirection);
    const midDistance = (camera.near + camera.far) * 0.5;
    this.scratchOrigin.copy(camera.position).addScaledVector(this.scratchViewDirection, midDistance);
    return this.extractPlaneDepthComponent(this.scratchOrigin);
  }

  /**
   * Reads the depth-axis component of a world point for this grid plane.
   *
   * @param point World position.
   * @returns Plane constant (Y for top, Z for front, X for side).
   */
  private extractPlaneDepthComponent(point: THREE.Vector3): number {
    if (this.plane === 'xz') return point.y;
    if (this.plane === 'xy') return point.z;
    return point.x;
  }

  /**
   * Computes world-space U/V bounds of the orthographic view on this plane.
   *
   * @param camera Orthographic camera.
   * @returns Scratch bounds object reused across frames.
   */
  private computeViewBounds(camera: THREE.OrthographicCamera): GridViewBounds {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(this.scratchOrigin);
    this.fillFrustumCorners(camera);
    this.fillViewBoundsFromCorners();
    return this.scratchViewBounds;
  }

  /** Writes frustum-corner UVs into the scratch view bounds with padding. */
  private fillViewBoundsFromCorners(): void {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < this.scratchCorners.length; i++) {
      const corner = this.scratchCorners[i];
      if (!corner) continue;
      const uv = this.worldToPlaneUV(corner);
      minU = Math.min(minU, uv.u);
      maxU = Math.max(maxU, uv.u);
      minV = Math.min(minV, uv.v);
      maxV = Math.max(maxV, uv.v);
    }
    const pad = Math.max(this.snapInterval, (maxU - minU) * 0.02);
    this.scratchViewBounds.minU = minU - pad;
    this.scratchViewBounds.maxU = maxU + pad;
    this.scratchViewBounds.minV = minV - pad;
    this.scratchViewBounds.maxV = maxV + pad;
  }

  /**
   * Unprojects the four near-plane frustum corners into reused world vectors.
   *
   * @param camera Orthographic camera.
   */
  private fillFrustumCorners(camera: THREE.OrthographicCamera): void {
    this.scratchCorners[0]!.set(-1, -1, 0).unproject(camera);
    this.scratchCorners[1]!.set(1, -1, 0).unproject(camera);
    this.scratchCorners[2]!.set(-1, 1, 0).unproject(camera);
    this.scratchCorners[3]!.set(1, 1, 0).unproject(camera);
  }

  /**
   * Projects a world point onto plane UV coordinates.
   *
   * @param point World position.
   * @returns Scratch UV object reused across calls.
   */
  private worldToPlaneUV(point: THREE.Vector3): GridPlaneUv {
    if (this.plane === 'xz') {
      this.scratchUv.u = point.x;
      this.scratchUv.v = point.z;
      return this.scratchUv;
    }
    if (this.plane === 'xy') {
      this.scratchUv.u = point.x;
      this.scratchUv.v = point.y;
      return this.scratchUv;
    }
    this.scratchUv.u = point.z;
    this.scratchUv.v = point.y;
    return this.scratchUv;
  }

  /**
   * Converts plane UV coordinates back to a world point on the grid plane at
   * the given view-depth constant.
   *
   * @param u Plane U.
   * @param v Plane V.
   * @param depth World constant for the plane normal axis.
   * @returns World position on the grid plane (reuses scratch vector).
   */
  private planeUVToWorld(u: number, v: number, depth: number): THREE.Vector3 {
    if (this.plane === 'xz') return this.scratchWorldPoint.set(u, depth, v);
    if (this.plane === 'xy') return this.scratchWorldPoint.set(u, v, depth);
    return this.scratchWorldPoint.set(depth, v, u);
  }

  /**
   * Picks an adaptive cell size and minor-line fade for the current zoom. Cell
   * grows by 4x when too dense; minorFade smoothly eases within a LOD band.
   *
   * @param camera Orthographic camera.
   * @returns Scratch LOD object reused across frames.
   */
  private computeAdaptiveLod(camera: THREE.OrthographicCamera): GridLodResult {
    let cell = this.snapInterval;
    let factor = this.measureCellScreenFactor(camera, cell);
    let steps = 0;
    const maxLodSteps = 32;
    while (factor <= 0.25 && steps < maxLodSteps) {
      cell *= 4;
      factor = this.measureCellScreenFactor(camera, cell);
      steps += 1;
    }
    this.scratchLod.cell = cell;
    this.scratchLod.minorFade = THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(0.35, 1.0, factor), 0, 1);
    return this.scratchLod;
  }

  /**
   * Estimates relative on-screen size of one cell for adaptive grid density.
   *
   * @param camera Orthographic camera.
   * @param cell Cell size in world units.
   * @returns Clamped factor 0..1.
   */
  private measureCellScreenFactor(camera: THREE.OrthographicCamera, cell: number): number {
    const viewHeight = Math.abs(camera.top - camera.bottom);
    if (viewHeight <= 0) return 1;
    const referencePixels = 800;
    const cellPixels = (cell / viewHeight) * referencePixels;
    return THREE.MathUtils.clamp(Math.round(cellPixels) / 8, 0, 1);
  }

  /**
   * Draws minor, section (x4), and major (x8) lines for the current LOD.
   *
   * @param view Visible plane bounds.
   * @param cell Adaptive cell size.
   * @param minorFade Minor-line opacity 0..1.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendGridLines(view: GridViewBounds, cell: number, minorFade: number, planeDepth: number): void {
    const cell4 = cell * 4;
    const cell8 = cell * 8;
    this.prepareLineColors(minorFade);
    this.appendConstantUGridLines(view, cell, cell4, cell8, minorFade, planeDepth);
    this.appendConstantVGridLines(view, cell, cell4, cell8, minorFade, planeDepth);
  }

  /**
   * Appends all constant-U grid lines across the visible V range.
   *
   * @param view Visible plane bounds.
   * @param cell Adaptive cell size.
   * @param cell4 Section spacing.
   * @param cell8 Major spacing.
   * @param minorFade Minor-line opacity 0..1.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendConstantUGridLines(
    view: GridViewBounds,
    cell: number,
    cell4: number,
    cell8: number,
    minorFade: number,
    planeDepth: number,
  ): void {
    let u = this.snapDown(view.minU, cell);
    while (u <= view.maxU + cell * 0.5) {
      const color = this.colorForCoordinate(u, cell, cell4, cell8, minorFade);
      this.appendConstantULine(u, view.minV, view.maxV, color, planeDepth);
      u += cell;
    }
  }

  /**
   * Appends all constant-V grid lines across the visible U range.
   *
   * @param view Visible plane bounds.
   * @param cell Adaptive cell size.
   * @param cell4 Section spacing.
   * @param cell8 Major spacing.
   * @param minorFade Minor-line opacity 0..1.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendConstantVGridLines(
    view: GridViewBounds,
    cell: number,
    cell4: number,
    cell8: number,
    minorFade: number,
    planeDepth: number,
  ): void {
    let v = this.snapDown(view.minV, cell);
    while (v <= view.maxV + cell * 0.5) {
      const color = this.colorForCoordinate(v, cell, cell4, cell8, minorFade);
      this.appendConstantVLine(v, view.minU, view.maxU, color, planeDepth);
      v += cell;
    }
  }

  /**
   * Prepares minor/section/major colors for the current minor fade.
   *
   * @param minorFade Minor-line visibility 0..1.
   */
  private prepareLineColors(minorFade: number): void {
    this.workMinor.copy(this.backgroundColor).lerp(this.minorColor, minorFade);
    this.workSection.copy(this.backgroundColor).lerp(this.sectionColor, THREE.MathUtils.lerp(0.55, 1, minorFade));
    this.workMajor.copy(this.backgroundColor).lerp(this.sectionColor, 1);
  }

  /**
   * Picks the line color for a grid coordinate from the minor/section/major
   * hierarchy.
   *
   * @param coordinate Line coordinate on the plane axis.
   * @param cell Base cell size.
   * @param cell4 Section spacing.
   * @param cell8 Major spacing.
   * @param minorFade Minor visibility (skips pure-minor lines when fully
   *   faded).
   * @returns Color for that line.
   */
  private colorForCoordinate(
    coordinate: number,
    _cell: number,
    cell4: number,
    cell8: number,
    minorFade: number,
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
   *
   * @param u Constant U.
   * @param minV Range start V.
   * @param maxV Range end V.
   * @param color Line color.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendConstantULine(u: number, minV: number, maxV: number, color: THREE.Color, planeDepth: number): void {
    const a = this.planeUVToWorld(u, minV, planeDepth);
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const b = this.planeUVToWorld(u, maxV, planeDepth);
    this.buffer.addLine(ax, ay, az, b.x, b.y, b.z, color, color);
  }

  /**
   * Draws a line of constant V across the U range.
   *
   * @param v Constant V.
   * @param minU Range start U.
   * @param maxU Range end U.
   * @param color Line color.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendConstantVLine(v: number, minU: number, maxU: number, color: THREE.Color, planeDepth: number): void {
    const a = this.planeUVToWorld(minU, v, planeDepth);
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const b = this.planeUVToWorld(maxU, v, planeDepth);
    this.buffer.addLine(ax, ay, az, b.x, b.y, b.z, color, color);
  }

  /**
   * Draws the highlighted center axes through the origin UV.
   *
   * @param view Visible plane bounds.
   * @param planeDepth World constant for the plane normal axis.
   */
  private appendCenterAxes(view: GridViewBounds, planeDepth: number): void {
    this.appendConstantVLine(0, view.minU, view.maxU, this.axisUColor, planeDepth);
    this.appendConstantULine(0, view.minV, view.maxV, this.axisVColor, planeDepth);
  }

  /**
   * Snaps a value down to the previous multiple of step.
   *
   * @param value Input value.
   * @param step Step size.
   * @returns Snapped value.
   */
  private snapDown(value: number, step: number): number {
    return Math.floor(value / step) * step;
  }

  /**
   * Returns true when value is an integer multiple of step (float-safe). Used
   * for minor, section, and major grid steps alike.
   *
   * @param value Coordinate.
   * @param step Step size.
   * @returns True when value is a float-safe integer multiple of step.
   */
  private isMultipleOf(value: number, step: number): boolean {
    if (step <= 0) return false;
    const ratio = value / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-6;
  }

  /**
   * Resolves the U-axis accent color for the plane.
   *
   * @param plane Grid plane.
   * @returns Three.js numeric hex color (e.g. 0xff0000), not a CSS string.
   */
  private resolveAxisUColor(plane: GridPlane): number {
    if (plane === 'yz') return Theme.gridZAxisColor;
    return Theme.gridXAxisColor;
  }

  /**
   * Resolves the V-axis accent color for the plane.
   *
   * @param plane Grid plane.
   * @returns Three.js numeric hex color (e.g. 0xff0000), not a CSS string.
   */
  private resolveAxisVColor(plane: GridPlane): number {
    if (plane === 'xz') return Theme.gridZAxisColor;
    return Theme.gridYAxisColor;
  }

  /**
   * Returns segment count from the last update.
   *
   * @returns Number of line segments.
   */
  getSegmentCount(): number {
    return this.buffer.getSegmentCount();
  }

  /** Disposes grid resources. */
  dispose(): void {
    this.buffer.dispose();
  }
}
