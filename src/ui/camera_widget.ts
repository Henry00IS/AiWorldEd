import * as THREE from 'three';
import { isDrawableRect, type PaneLogicalRect } from '../viewports/pane_content_rect.js';
import { computeCameraWidgetLogicalRect } from './camera_widget_layout.js';
import type { CoordinateAxis } from '../coordinates/coordinate_space_adapter.js';
import { createDefaultCoordinateSpace } from '../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../settings/coordinate_space_types.js';
import { CameraWidgetAxisLabel } from './camera_widget_axis_label.js';
import {
  resolveCameraWidgetAxisPresentations,
  type CameraWidgetAxisPresentation,
  type CameraWidgetAxisRole,
} from './camera_widget_axis_presentation.js';

/** Live render objects for one semantic orientation-widget axis. */
interface CameraWidgetAxisBinding {
  presentation: CameraWidgetAxisPresentation;
  arrow: THREE.ArrowHelper;
  label: CameraWidgetAxisLabel;
}

/**
 * Profile-aware camera orientation gizmo drawn through the shared multi-view
 * WebGL renderer. Owns only a tiny private scene and orthographic camera —
 * never allocates its own renderer or WebGL context.
 */
export class CameraWidget {
  private widgetCamera: THREE.OrthographicCamera;
  private widgetScene: THREE.Scene;
  private arrowGroup: THREE.Group;
  private readonly axisBindings: CameraWidgetAxisBinding[];
  private readonly scratchQuaternion: THREE.Quaternion;
  private readonly arrowLength: number;
  private readonly headLength: number;
  private readonly headWidth: number;

  /** Creates semantic orientation arrows, labels, and a private camera. */
  constructor() {
    this.arrowLength = 1.2;
    this.headLength = 0.35;
    this.headWidth = 0.2;
    this.scratchQuaternion = new THREE.Quaternion();
    this.widgetScene = new THREE.Scene();
    this.widgetCamera = this.createWidgetCamera();
    this.arrowGroup = new THREE.Group();
    this.widgetScene.add(this.arrowGroup);
    this.axisBindings = resolveCameraWidgetAxisPresentations(createDefaultCoordinateSpace()).map((presentation) =>
      this.createAxisBinding(presentation),
    );
    this.axisBindings.forEach((binding) => this.arrowGroup.add(binding.arrow, binding.label.getSprite()));
  }

  /**
   * Applies signed profile roles to existing orientation arrows and labels.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    resolveCameraWidgetAxisPresentations(space).forEach((presentation) => {
      this.updateAxisBinding(this.bindingForRole(presentation.role), presentation);
    });
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
   * Builds an ArrowHelper with consistent sizing for one axis.
   *
   * @param direction The axis direction for the arrow.
   * @param color The hex color for the arrow shaft and head.
   * @returns A configured ArrowHelper instance.
   */
  private buildArrow(direction: THREE.Vector3, color: number): THREE.ArrowHelper {
    return new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      this.arrowLength,
      color,
      this.headLength,
      this.headWidth,
    );
  }

  /**
   * Creates one reusable semantic arrow and camera-facing label.
   *
   * @param presentation Initial profile presentation.
   * @returns Live axis binding.
   */
  private createAxisBinding(presentation: CameraWidgetAxisPresentation): CameraWidgetAxisBinding {
    const arrow = this.buildArrow(presentation.editorDirection, presentation.color);
    const label = new CameraWidgetAxisLabel();
    const binding = { presentation, arrow, label };
    this.updateAxisBinding(binding, presentation);
    return binding;
  }

  /**
   * Updates one binding without replacing its render resources.
   *
   * @param binding Existing semantic binding.
   * @param presentation New profile presentation.
   */
  private updateAxisBinding(binding: CameraWidgetAxisBinding, presentation: CameraWidgetAxisPresentation): void {
    binding.presentation = presentation;
    binding.arrow.setDirection(presentation.editorDirection);
    binding.arrow.setColor(new THREE.Color(presentation.color));
    binding.label.update(presentation.signedAxis, presentation.color);
    binding.label.setPosition(presentation.editorDirection, this.arrowLength + 0.28);
  }

  /**
   * Finds the binding assigned to a semantic profile role.
   *
   * @param role Right, Up, or Forward.
   * @returns Matching live binding.
   */
  private bindingForRole(role: CameraWidgetAxisRole): CameraWidgetAxisBinding {
    const binding = this.axisBindings.find((candidate) => candidate.presentation.role === role);
    if (!binding) throw new Error(`Camera widget is missing its ${role} axis`);
    return binding;
  }

  /**
   * Finds the binding currently displaying a coordinate letter.
   *
   * @param axis X, Y, or Z.
   * @returns Matching live binding.
   */
  private bindingForCoordinateAxis(axis: CoordinateAxis): CameraWidgetAxisBinding {
    const binding = this.axisBindings.find((candidate) => candidate.presentation.axis === axis);
    if (!binding) throw new Error(`Camera widget is missing its ${axis.toUpperCase()} axis`);
    return binding;
  }

  /**
   * Mirrors the main camera orientation onto the arrow group so the gizmo
   * matches the viewport view.
   *
   * @param camera The main viewport camera to mirror.
   */
  syncOrientation(camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.scratchQuaternion);
    this.arrowGroup.quaternion.copy(this.scratchQuaternion).invert();
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
   * @returns The arrow root group.
   */
  getArrowGroup(): THREE.Group {
    return this.arrowGroup;
  }

  /**
   * Returns the arrow currently displaying the signed X axis.
   *
   * @returns Red X-axis ArrowHelper.
   */
  getArrowX(): THREE.ArrowHelper {
    return this.bindingForCoordinateAxis('x').arrow;
  }

  /**
   * Returns the arrow currently displaying the signed Y axis.
   *
   * @returns Green Y-axis ArrowHelper.
   */
  getArrowY(): THREE.ArrowHelper {
    return this.bindingForCoordinateAxis('y').arrow;
  }

  /**
   * Returns the arrow currently displaying the signed Z axis.
   *
   * @returns Blue Z-axis ArrowHelper.
   */
  getArrowZ(): THREE.ArrowHelper {
    return this.bindingForCoordinateAxis('z').arrow;
  }

  /**
   * Returns the label currently displaying a coordinate letter.
   *
   * @param axis X, Y, or Z.
   * @returns Matching signed-axis label.
   */
  getAxisLabel(axis: CoordinateAxis): CameraWidgetAxisLabel {
    return this.bindingForCoordinateAxis(axis).label;
  }

  /**
   * Returns the arrow assigned to a semantic profile role.
   *
   * @param role Right, Up, or Forward.
   * @returns Matching ArrowHelper.
   */
  getArrowForRole(role: CameraWidgetAxisRole): THREE.ArrowHelper {
    return this.bindingForRole(role).arrow;
  }

  /**
   * Returns the label assigned to a semantic profile role.
   *
   * @param role Right, Up, or Forward.
   * @returns Matching signed-axis label.
   */
  getLabelForRole(role: CameraWidgetAxisRole): CameraWidgetAxisLabel {
    return this.bindingForRole(role).label;
  }

  /**
   * Releases per-arrow and per-label resources. ArrowHelper geometries are
   * retained because Three.js shares those buffers across instances.
   */
  dispose(): void {
    this.axisBindings.forEach((binding) => {
      this.disposeArrowMaterials(binding.arrow);
      binding.label.dispose();
    });
    this.arrowGroup.clear();
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
