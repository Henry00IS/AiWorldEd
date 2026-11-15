import * as THREE from 'three';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { GridPlane } from './grid_plane.js';
import { GridLineBuffer } from './grid_line_buffer.js';
import { GridBackgroundShading } from './grid_background_shading.js';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

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
  private snapInterval: number;
  private readonly gridPlane: GridPlane;
  private minorColor: THREE.Color;
  private sectionColor: THREE.Color;
  private backgroundColor: THREE.Color;
  private axisUColor: THREE.Color;
  private axisVColor: THREE.Color;
  private workMinor: THREE.Color;
  private workSection: THREE.Color;
  private workMajor: THREE.Color;
  private workBlended: THREE.Color;
  private minorBackgroundShare: number;
  private sectionBackgroundShare: number;
  private readonly backgroundShading: GridBackgroundShading;
  private readonly scratchEndpointA: THREE.Vector3;
  private readonly scratchColorA: THREE.Color;
  private readonly scratchColorB: THREE.Color;
  private scratchOrigin: THREE.Vector3;
  private scratchViewDirection: THREE.Vector3;
  private scratchWorldPoint: THREE.Vector3;
  private scratchCorners: THREE.Vector3[];
  private scratchViewBounds: GridViewBounds;
  private scratchLod: GridLodResult;
  private scratchUv: GridPlaneUv;
  private readonly planeFrameOrigin: THREE.Vector3;
  private readonly planeFrameUAxis: THREE.Vector3;
  private readonly planeFrameVAxis: THREE.Vector3;
  private readonly planeFrameNormal: THREE.Vector3;
  private readonly scratchOffset: THREE.Vector3;

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
    this.snapInterval = Math.max(snapInterval, 0.001);
    this.gridPlane = plane;
    this.minorColor = new THREE.Color();
    this.sectionColor = new THREE.Color();
    this.backgroundColor = new THREE.Color();
    this.axisUColor = new THREE.Color();
    this.axisVColor = new THREE.Color();
    this.themeColorsSync();
    this.workMinor = new THREE.Color();
    this.workSection = new THREE.Color();
    this.workMajor = new THREE.Color();
    this.workBlended = new THREE.Color();
    this.minorBackgroundShare = 1;
    this.sectionBackgroundShare = 1;
    this.backgroundShading = new GridBackgroundShading();
    this.scratchEndpointA = new THREE.Vector3();
    this.scratchColorA = new THREE.Color();
    this.scratchColorB = new THREE.Color();
    this.scratchOrigin = new THREE.Vector3();
    this.scratchViewDirection = new THREE.Vector3();
    this.scratchWorldPoint = new THREE.Vector3();
    this.scratchCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.scratchViewBounds = { minU: 0, maxU: 0, minV: 0, maxV: 0 };
    this.scratchLod = { cell: 0, minorFade: 0 };
    this.scratchUv = { u: 0, v: 0 };
    this.planeFrameOrigin = new THREE.Vector3();
    this.planeFrameUAxis = new THREE.Vector3(1, 0, 0);
    this.planeFrameVAxis = new THREE.Vector3(0, 0, 1);
    this.planeFrameNormal = new THREE.Vector3(0, 1, 0);
    this.scratchOffset = new THREE.Vector3();
    this.applyDefaultPlaneFrame(plane);
  }

  /**
   * Sets the working plane frame used for UV lattice placement.
   *
   * @param frame Plane origin plus U/V axes and normal.
   */
  setPlaneFrame(frame: EditorPlaneFrame): void {
    this.planeFrameOrigin.copy(frame.origin);
    this.planeFrameUAxis.copy(frame.uAxis).normalize();
    this.planeFrameVAxis.copy(frame.vAxis).normalize();
    this.planeFrameNormal.copy(frame.normal).normalize();
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
   * Rebuilds grid lines for the current orthographic view. Lines are placed at
   * mid frustum depth so content-driven near/far ranging never clips them.
   *
   * @param camera The orthographic camera for this viewport.
   */
  update(camera: THREE.OrthographicCamera): void {
    this.themeColorsSync();
    this.backgroundShading.sync(getActiveThemeViewportPalette(), camera);
    const view = this.computeViewBounds(camera);
    const planeDepth = this.computePlaneDepth(camera);
    const lod = this.computeAdaptiveLod(camera);
    this.buffer.beginFrame();
    this.appendGridLines(view, lod.cell, lod.minorFade, planeDepth);
    this.appendCenterAxes(view, planeDepth);
    this.buffer.endFrame();
  }

  /** Copies the active theme's grid, axis, and fade colors into the grid. */
  private themeColorsSync(): void {
    const palette = getActiveThemeViewportPalette();
    this.minorColor.setHex(palette.gridColor);
    this.sectionColor.setHex(palette.gridOriginColor);
    this.backgroundColor.setHex(palette.viewportBackground);
    this.axisUColor.setHex(this.resolveAxisUColor(this.gridPlane));
    this.axisVColor.setHex(this.resolveAxisVColor(this.gridPlane));
  }

  /**
   * Resolves lattice depth along the plane normal so geometry sits inside the
   * camera near/far volume (midway between near and far).
   *
   * @param camera Orthographic camera after depth ranging.
   * @returns Signed distance along the plane normal from the plane origin.
   */
  private computePlaneDepth(camera: THREE.OrthographicCamera): number {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this.scratchViewDirection);
    const midDistance = (camera.near + camera.far) * 0.5;
    this.scratchOrigin.copy(camera.position).addScaledVector(this.scratchViewDirection, midDistance);
    return this.scratchOrigin.sub(this.planeFrameOrigin).dot(this.planeFrameNormal);
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
   * Projects a world point onto plane UV coordinates relative to the frame.
   *
   * @param point World position.
   * @returns Scratch UV object reused across calls.
   */
  private worldToPlaneUV(point: THREE.Vector3): GridPlaneUv {
    this.scratchOffset.copy(point).sub(this.planeFrameOrigin);
    this.scratchUv.u = this.scratchOffset.dot(this.planeFrameUAxis);
    this.scratchUv.v = this.scratchOffset.dot(this.planeFrameVAxis);
    return this.scratchUv;
  }

  /**
   * Converts plane UV coordinates back to a world point on the grid plane at
   * the given normal-axis depth from the plane origin.
   *
   * @param u Plane U.
   * @param v Plane V.
   * @param depth Signed distance along the plane normal from the origin.
   * @returns World position on the grid plane (reuses scratch vector).
   */
  private planeUVToWorld(u: number, v: number, depth: number): THREE.Vector3 {
    this.scratchWorldPoint.copy(this.planeFrameOrigin);
    this.scratchWorldPoint.addScaledVector(this.planeFrameUAxis, u);
    this.scratchWorldPoint.addScaledVector(this.planeFrameVAxis, v);
    this.scratchWorldPoint.addScaledVector(this.planeFrameNormal, depth);
    return this.scratchWorldPoint;
  }

  /**
   * Applies the default world-aligned frame for a classic top/front/side plane.
   *
   * @param plane Orthographic plane id.
   */
  private applyDefaultPlaneFrame(plane: GridPlane): void {
    this.planeFrameOrigin.set(0, 0, 0);
    if (plane === 'xz') {
      this.planeFrameUAxis.set(1, 0, 0);
      this.planeFrameVAxis.set(0, 0, 1);
      this.planeFrameNormal.set(0, 1, 0);
      return;
    }
    if (plane === 'xy') {
      this.planeFrameUAxis.set(1, 0, 0);
      this.planeFrameVAxis.set(0, 1, 0);
      this.planeFrameNormal.set(0, 0, 1);
      return;
    }
    this.planeFrameUAxis.set(0, 0, 1);
    this.planeFrameVAxis.set(0, 1, 0);
    this.planeFrameNormal.set(1, 0, 0);
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
    const fullStrengthPixels = getActiveThemeViewportPalette().gridMinorFullStrengthPixels;
    const fadeFactor = this.measureCellScreenFactor(camera, cell, fullStrengthPixels);
    this.scratchLod.cell = cell;
    this.scratchLod.minorFade = THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(0.35, 1.0, fadeFactor), 0, 1);
    return this.scratchLod;
  }

  /**
   * Estimates relative on-screen size of one cell for adaptive grid density.
   *
   * @param camera Orthographic camera.
   * @param cell Cell size in world units.
   * @param fullStrengthPixels Spacing in pixels that maps to factor 1.
   * @returns Clamped factor 0..1.
   */
  private measureCellScreenFactor(camera: THREE.OrthographicCamera, cell: number, fullStrengthPixels = 8): number {
    const viewHeight = Math.abs(camera.top - camera.bottom);
    if (viewHeight <= 0) return 1;
    const referencePixels = 800;
    const cellPixels = (cell / viewHeight) * referencePixels;
    return THREE.MathUtils.clamp(Math.round(cellPixels) / fullStrengthPixels, 0, 1);
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
    this.minorBackgroundShare = 1 - minorFade;
    this.sectionBackgroundShare = 1 - THREE.MathUtils.lerp(0.55, 1, minorFade);
  }

  /**
   * Returns how much of the flat background a prepared line color contains.
   *
   * @param color Color returned by colorForCoordinate or an axis color.
   * @returns Flat background weight 0..1.
   */
  private backgroundShareFor(color: THREE.Color): number {
    if (color === this.backgroundColor) return 1;
    if (color === this.workMinor) return this.minorBackgroundShare;
    if (color === this.workBlended) return this.sectionBackgroundShare * 0.65;
    return 0;
  }

  /**
   * Adds one grid segment, re-basing faded colors onto a gradient background.
   *
   * @param a Start world point (copied before b is computed).
   * @param b End world point.
   * @param color Prepared line color.
   */
  private appendShadedLine(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): void {
    if (!this.backgroundShading.isActive()) {
      this.buffer.addLine(a.x, a.y, a.z, b.x, b.y, b.z, color, color);
      return;
    }
    const share = this.backgroundShareFor(color);
    const colorA = this.backgroundShading.endpointColor(a, color, share, this.scratchColorA);
    const colorB = this.backgroundShading.endpointColor(b, color, share, this.scratchColorB);
    this.buffer.addLine(a.x, a.y, a.z, b.x, b.y, b.z, colorA, colorB);
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
    const a = this.scratchEndpointA.copy(this.planeUVToWorld(u, minV, planeDepth));
    this.appendShadedLine(a, this.planeUVToWorld(u, maxV, planeDepth), color);
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
    const a = this.scratchEndpointA.copy(this.planeUVToWorld(minU, v, planeDepth));
    this.appendShadedLine(a, this.planeUVToWorld(maxU, v, planeDepth), color);
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
    const palette = getActiveThemeViewportPalette();
    if (plane === 'yz') return palette.gridZAxisColor;
    return palette.gridXAxisColor;
  }

  /**
   * Resolves the V-axis accent color for the plane.
   *
   * @param plane Grid plane.
   * @returns Three.js numeric hex color (e.g. 0xff0000), not a CSS string.
   */
  private resolveAxisVColor(plane: GridPlane): number {
    const palette = getActiveThemeViewportPalette();
    if (plane === 'xz') return palette.gridZAxisColor;
    return palette.gridYAxisColor;
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
