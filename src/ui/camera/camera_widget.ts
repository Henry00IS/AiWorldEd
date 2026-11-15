import * as THREE from 'three';
import { getActiveThemeViewportPalette, type ThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { isDrawableRect, type PaneLogicalRect } from '@/viewports/pane/pane_content_rect.js';
import { computeCameraWidgetLogicalRect } from './camera_widget_layout.js';
import type { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import type { EditorOrientationWorldBasis } from '@/navigation/orientation/editor_orientation_edge_align.js';

/** Opacity for the hardcoded world-axis ghost triad. */
export const CAMERA_WIDGET_WORLD_AXIS_OPACITY = 0.25;

/**
 * Camera orientation gizmo (X=red, Y=green, Z=blue) drawn through the shared
 * multi-view WebGL renderer. Solid arrows follow the grid working frame, or the
 * camera frame when the grid is world-default and the camera is reoriented.
 * When camera and grid orientations differ, translucent world-axis ghosts
 * (1,0,0 / 0,1,0 / 0,0,1) appear at 25% opacity for true game up.
 */
export class CameraWidget {
  private widgetCamera: THREE.OrthographicCamera;
  private widgetScene: THREE.Scene;
  private arrowGroup: THREE.Group;
  private arrowX: THREE.ArrowHelper;
  private arrowY: THREE.ArrowHelper;
  private arrowZ: THREE.ArrowHelper;
  private worldGhostGroup: THREE.Group;
  private worldGhostX: THREE.ArrowHelper;
  private worldGhostY: THREE.ArrowHelper;
  private worldGhostZ: THREE.ArrowHelper;
  private readonly scratchQuaternion: THREE.Quaternion;
  private readonly scratchGridX: THREE.Vector3;
  private readonly scratchGridY: THREE.Vector3;
  private readonly scratchGridZ: THREE.Vector3;
  private readonly arrowLength: number;
  private readonly headLength: number;
  private readonly headWidth: number;
  private appliedPalette: ThemeViewportPalette;

  /** Creates the orientation arrows and private orthographic camera. */
  constructor() {
    this.arrowLength = 1.2;
    this.headLength = 0.35;
    this.headWidth = 0.2;
    this.scratchQuaternion = new THREE.Quaternion();
    this.scratchGridX = new THREE.Vector3(1, 0, 0);
    this.scratchGridY = new THREE.Vector3(0, 1, 0);
    this.scratchGridZ = new THREE.Vector3(0, 0, 1);
    this.widgetScene = new THREE.Scene();
    this.widgetCamera = this.createWidgetCamera();
    this.arrowGroup = new THREE.Group();
    this.worldGhostGroup = new THREE.Group();
    this.worldGhostGroup.visible = false;
    this.widgetScene.add(this.arrowGroup);
    this.widgetScene.add(this.worldGhostGroup);
    const initialPalette = getActiveThemeViewportPalette();
    this.appliedPalette = initialPalette;
    this.arrowX = this.buildArrow(new THREE.Vector3(1, 0, 0), initialPalette.widgetXAxisColor, 1);
    this.arrowY = this.buildArrow(new THREE.Vector3(0, 1, 0), initialPalette.widgetYAxisColor, 1);
    this.arrowZ = this.buildArrow(new THREE.Vector3(0, 0, 1), initialPalette.widgetZAxisColor, 1);
    this.arrowGroup.add(this.arrowX, this.arrowY, this.arrowZ);
    this.worldGhostX = this.buildArrow(
      new THREE.Vector3(1, 0, 0),
      initialPalette.widgetXAxisColor,
      CAMERA_WIDGET_WORLD_AXIS_OPACITY,
    );
    this.worldGhostY = this.buildArrow(
      new THREE.Vector3(0, 1, 0),
      initialPalette.widgetYAxisColor,
      CAMERA_WIDGET_WORLD_AXIS_OPACITY,
    );
    this.worldGhostZ = this.buildArrow(
      new THREE.Vector3(0, 0, 1),
      initialPalette.widgetZAxisColor,
      CAMERA_WIDGET_WORLD_AXIS_OPACITY,
    );
    this.worldGhostGroup.add(this.worldGhostX, this.worldGhostY, this.worldGhostZ);
  }

  /**
   * Builds the fixed orthographic camera that frames the axis arrows.
   *
   * @returns Configured orthographic camera.
   */
  private createWidgetCamera(): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  /**
   * Builds an ArrowHelper with consistent sizing and opacity for one axis.
   *
   * @param direction The axis direction for the arrow.
   * @param color The hex color for the arrow shaft and head.
   * @param opacity Material opacity from 0 to 1.
   * @returns A configured ArrowHelper instance.
   */
  private buildArrow(direction: THREE.Vector3, color: number, opacity: number): THREE.ArrowHelper {
    const arrow = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      this.arrowLength,
      color,
      this.headLength,
      this.headWidth,
    );
    this.applyArrowOpacity(arrow, opacity);
    return arrow;
  }

  /**
   * Mirrors the main camera orientation onto the arrow groups and updates solid
   * / world-ghost arrow directions from the grid and camera orientation
   * stores.
   *
   * @param camera The main viewport camera to mirror.
   * @param gridOrientation Grid working orientation, or null for world
   *   identity.
   * @param cameraOrientation Camera working orientation, or null treated as
   *   matching grid.
   */
  syncOrientation(
    camera: THREE.Camera,
    gridOrientation: EditorOrientation | null = null,
    cameraOrientation: EditorOrientation | null = null,
  ): void {
    this.themeColorsSync();
    camera.getWorldQuaternion(this.scratchQuaternion);
    const inverted = this.scratchQuaternion.invert();
    this.arrowGroup.quaternion.copy(inverted);
    this.worldGhostGroup.quaternion.copy(inverted);
    this.applySolidAxisDirections(gridOrientation, cameraOrientation);
    this.worldGhostGroup.visible = this.shouldShowWorldAxisGhosts(gridOrientation, cameraOrientation);
  }

  /** Recolors the arrows when the active theme's axis colors change. */
  private themeColorsSync(): void {
    const palette = getActiveThemeViewportPalette();
    if (palette === this.appliedPalette) {
      return;
    }
    this.appliedPalette = palette;
    this.arrowX.setColor(palette.widgetXAxisColor);
    this.arrowY.setColor(palette.widgetYAxisColor);
    this.arrowZ.setColor(palette.widgetZAxisColor);
    this.worldGhostX.setColor(palette.widgetXAxisColor);
    this.worldGhostY.setColor(palette.widgetYAxisColor);
    this.worldGhostZ.setColor(palette.widgetZAxisColor);
  }

  /**
   * Points solid arrows along the grid frame, or the camera frame when the grid
   * is world-default and the camera is reoriented (so world ghosts can show
   * true up beside the camera frame).
   *
   * @param gridOrientation Grid orientation store, or null for world axes.
   * @param cameraOrientation Camera orientation store, or null.
   */
  private applySolidAxisDirections(
    gridOrientation: EditorOrientation | null,
    cameraOrientation: EditorOrientation | null,
  ): void {
    const solidSource = this.resolveSolidOrientationSource(gridOrientation, cameraOrientation);
    if (!solidSource) {
      this.setSolidArrowDirections(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
      return;
    }
    this.copyBasisToScratch(solidSource.getWorldBasis());
    this.setSolidArrowDirections(this.scratchGridX, this.scratchGridY, this.scratchGridZ);
  }

  /**
   * Chooses which orientation drives the solid triad.
   *
   * @param gridOrientation Grid store.
   * @param cameraOrientation Camera store.
   * @returns Orientation for solid arrows, or null for hardcoded world axes.
   */
  private resolveSolidOrientationSource(
    gridOrientation: EditorOrientation | null,
    cameraOrientation: EditorOrientation | null,
  ): EditorOrientation | null {
    if (!gridOrientation) {
      return cameraOrientation;
    }
    if (!cameraOrientation || cameraOrientation.matchesOrientation(gridOrientation)) {
      return gridOrientation;
    }
    if (gridOrientation.isDefault()) {
      return cameraOrientation;
    }
    return gridOrientation;
  }

  /**
   * Copies a world basis into scratch axis vectors.
   *
   * @param basis Grid world basis.
   */
  private copyBasisToScratch(basis: EditorOrientationWorldBasis): void {
    this.scratchGridX.copy(basis.xAxis).normalize();
    this.scratchGridY.copy(basis.yAxis).normalize();
    this.scratchGridZ.copy(basis.zAxis).normalize();
  }

  /**
   * Updates solid arrow directions without reallocating helpers.
   *
   * @param xAxis World X direction for the solid red arrow.
   * @param yAxis World Y direction for the solid green arrow.
   * @param zAxis World Z direction for the solid blue arrow.
   */
  private setSolidArrowDirections(xAxis: THREE.Vector3, yAxis: THREE.Vector3, zAxis: THREE.Vector3): void {
    this.arrowX.setDirection(xAxis);
    this.arrowY.setDirection(yAxis);
    this.arrowZ.setDirection(zAxis);
  }

  /**
   * Returns whether translucent world-axis ghosts should draw. Any mismatch
   * between camera and grid shows true world up (including grid-reset +
   * camera-to-face).
   *
   * @param gridOrientation Grid store.
   * @param cameraOrientation Camera store.
   * @returns True when world ghosts should be visible.
   */
  private shouldShowWorldAxisGhosts(
    gridOrientation: EditorOrientation | null,
    cameraOrientation: EditorOrientation | null,
  ): boolean {
    if (!gridOrientation || !cameraOrientation) {
      return false;
    }
    return !cameraOrientation.matchesOrientation(gridOrientation);
  }

  /**
   * Draws the orientation arrows into the top-right corner of a pane using the
   * shared multi-view WebGL renderer. Clears only depth so the 3D scene remains
   * visible underneath the transparent gizmo.
   *
   * @param renderer Shared workspace (or detached) WebGL renderer.
   * @param paneLogicalRect Logical scissor rect of the perspective pane
   *   content.
   */
  renderOverlay(renderer: THREE.WebGLRenderer, paneLogicalRect: PaneLogicalRect): void {
    const widgetRect = computeCameraWidgetLogicalRect(paneLogicalRect);
    if (!widgetRect || !isDrawableRect(widgetRect)) return;
    renderer.setViewport(widgetRect.x, widgetRect.y, widgetRect.width, widgetRect.height);
    renderer.setScissor(widgetRect.x, widgetRect.y, widgetRect.width, widgetRect.height);
    renderer.clearDepth();
    renderer.render(this.widgetScene, this.widgetCamera);
  }

  /**
   * Returns the private Three.js scene that holds the axis arrows.
   *
   * @returns The widget scene.
   */
  getScene(): THREE.Scene {
    return this.widgetScene;
  }

  /**
   * Returns the private orthographic camera used to frame the arrows.
   *
   * @returns The widget orthographic camera.
   */
  getCamera(): THREE.OrthographicCamera {
    return this.widgetCamera;
  }

  /**
   * Returns the group whose quaternion mirrors the viewport camera.
   *
   * @returns The solid arrow root group.
   */
  getArrowGroup(): THREE.Group {
    return this.arrowGroup;
  }

  /**
   * Returns the translucent world-axis ghost group.
   *
   * @returns World ghost root group.
   */
  getWorldGhostGroup(): THREE.Group {
    return this.worldGhostGroup;
  }

  /**
   * Returns the X axis arrow helper.
   *
   * @returns The red (X) ArrowHelper.
   */
  getArrowX(): THREE.ArrowHelper {
    return this.arrowX;
  }

  /**
   * Returns the Y axis arrow helper.
   *
   * @returns The green (Y) ArrowHelper.
   */
  getArrowY(): THREE.ArrowHelper {
    return this.arrowY;
  }

  /**
   * Returns the Z axis arrow helper.
   *
   * @returns The blue (Z) ArrowHelper.
   */
  getArrowZ(): THREE.ArrowHelper {
    return this.arrowZ;
  }

  /**
   * Returns the translucent world X arrow.
   *
   * @returns Ghost X ArrowHelper.
   */
  getWorldGhostX(): THREE.ArrowHelper {
    return this.worldGhostX;
  }

  /**
   * Releases per-arrow materials. Geometry is intentionally kept: Three.js
   * shares ArrowHelper line/cone buffers across all instances.
   */
  dispose(): void {
    this.arrowGroup.remove(this.arrowX, this.arrowY, this.arrowZ);
    this.worldGhostGroup.remove(this.worldGhostX, this.worldGhostY, this.worldGhostZ);
    this.disposeArrowMaterials(this.arrowX);
    this.disposeArrowMaterials(this.arrowY);
    this.disposeArrowMaterials(this.arrowZ);
    this.disposeArrowMaterials(this.worldGhostX);
    this.disposeArrowMaterials(this.worldGhostY);
    this.disposeArrowMaterials(this.worldGhostZ);
  }

  /**
   * Applies opacity to line and cone materials on one arrow.
   *
   * @param arrow Target arrow.
   * @param opacity Opacity 0..1.
   */
  private applyArrowOpacity(arrow: THREE.ArrowHelper, opacity: number): void {
    this.setMaterialOpacity(arrow.line.material, opacity);
    this.setMaterialOpacity(arrow.cone.material, opacity);
  }

  /**
   * Sets opacity on a material when supported.
   *
   * @param material Line or mesh material.
   * @param opacity Opacity 0..1.
   */
  private setMaterialOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => this.setMaterialOpacity(entry, opacity));
      return;
    }
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthTest = true;
    material.depthWrite = false;
  }

  /**
   * Disposes materials owned by one axis arrow (not shared geometries).
   *
   * @param arrow Axis arrow whose materials should be freed.
   */
  private disposeArrowMaterials(arrow: THREE.ArrowHelper): void {
    const lineMaterial = arrow.line.material;
    const coneMaterial = arrow.cone.material;
    if (!Array.isArray(lineMaterial)) lineMaterial.dispose();
    if (!Array.isArray(coneMaterial)) coneMaterial.dispose();
  }
}
