import * as THREE from 'three';
import { Theme } from '../theme.js';
import { BaseViewport, type BaseViewportOptions } from './base_viewport.js';
import { Grids } from './grid/grids.js';
import { InputManager } from '../managers/input/input_manager.js';
import { FlyingCamera } from '../managers/camera/flying_camera.js';
import { OrbitCameraController } from '../managers/camera/orbit_camera_controller.js';
import { CameraWidget } from '../ui/camera_widget.js';
import { SelectionManager } from '../selection/object/selection_manager.js';
import { SelectionHighlight } from '../selection/object/selection_highlight.js';
import { SceneRaycaster } from '../selection/object/scene_raycaster.js';
import { SelectionClickThrough } from '../selection/object/selection_click_through.js';
import { ViewportShadingController } from './viewport_shading_controller.js';
import { ShadingMode } from '../types/shading_mode.js';
import { CameraHeadlight } from './camera_headlight.js';
import { blurActiveFormField } from '../utils/dom_focus.js';
import { isEditorHelperObject } from '../utils/mesh_edge_sync.js';
import { getDefaultPerspectiveCameraPosition, getDefaultSceneFocus } from '../navigation/default_camera_placement.js';
import { SolidBrushEdgeFader } from '../solid/model/solid_brush_edge_fader.js';
import { measurePaneLogicalRectAgainst } from './pane_content_rect.js';
import { hideGizmoAfterRenderPass, showGizmoForRenderPass } from '../transform/gizmo/gizmo_viewport_visibility.js';
import type { MouseSettings } from '../settings/settings_types.js';
import { createDefaultMouseSettings } from '../settings/settings_defaults.js';

/** Ambient fill intensity for the 3D viewport. */
export const VIEWPORT_3D_AMBIENT_INTENSITY = 0.7;

/** Camera headlight intensity for the 3D viewport key light. */
export const VIEWPORT_3D_HEADLIGHT_INTENSITY = 1.15;

/**
 * Callback type for transform gizmo pointer events.
 *
 * @param event The pointer event.
 * @returns True if the event was consumed by the transform handler.
 */
export type TransformCallback = (event: MouseEvent) => boolean;

/**
 * Resolves a raycast hit mesh to the authoritative world mesh.
 *
 * @param mesh The mesh hit by the raycaster.
 * @returns The world mesh that should be selected.
 */
export type MeshResolveCallback = (mesh: THREE.Mesh) => THREE.Mesh;

/** Options for constructing a shared-scene perspective pane. */
export interface Viewport3DOptions extends BaseViewportOptions {
  inputManager: InputManager;
}

export class Viewport3D extends BaseViewport {
  private camera!: THREE.PerspectiveCamera;
  private grids: Grids;
  private flyingCamera!: FlyingCamera;
  private orbitCamera!: OrbitCameraController;
  private navigationFocus: THREE.Vector3;
  private cameraWidget: CameraWidget;
  private ambientLight!: THREE.AmbientLight;
  private cameraHeadlight!: CameraHeadlight;
  private selectableObjects!: THREE.Mesh[];
  private selectionManager!: SelectionManager | null;
  private raycaster!: SceneRaycaster;
  private worldGroup!: THREE.Group | null;
  private gizmoGroup!: THREE.Group | null;
  private transformCallback!: TransformCallback | null;
  private faceSelectionCallback!: ((event: MouseEvent) => boolean) | null;
  private clipPlaneCallback!: ((event: MouseEvent) => boolean) | null;
  private meshResolveCallback!: MeshResolveCallback | null;
  private shadingController: ViewportShadingController;
  private gridRoot: THREE.Object3D;

  /**
   * Creates a new 3D perspective viewport pane on the shared scene/surface.
   *
   * @param options Shared surface options plus input manager.
   */
  constructor(options: Viewport3DOptions) {
    super({ ...options, name: options.name || 'Perspective' });
    this.grids = new Grids(50, 50, 'xz', 'perspective');
    this.gridRoot = this.grids.getScene();
    this.navigationFocus = getDefaultSceneFocus();
    this.gridRoot.visible = false;
    this.initializeCamera();
    this.initializeState();
    this.setupLights();
    this.setupOrbitCamera();
    this.setupClickSelection();
    this.setupFlyingCamera(options.inputManager);
    this.scene.add(this.gridRoot);
    this.cameraWidget = new CameraWidget();
    this.shadingController = new ViewportShadingController(this);
  }

  /**
   * Creates and configures the perspective camera near the default cube. Raises
   * the camera by the cube center height so the view aims at the cube.
   */
  private initializeCamera(): void {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.copy(getDefaultPerspectiveCameraPosition());
    const focus = getDefaultSceneFocus();
    this.camera.lookAt(focus.x, focus.y, focus.z);
  }

  /** Initializes the mutable state properties of this viewport. */
  private initializeState(): void {
    this.selectableObjects = [];
    this.selectionManager = null;
    this.worldGroup = null;
    this.gizmoGroup = null;
    this.transformCallback = null;
    this.raycaster = new SceneRaycaster();
    this.faceSelectionCallback = null;
    this.clipPlaneCallback = null;
    this.meshResolveCallback = null;
  }

  /**
   * Creates the flying camera controller for orbit navigation.
   *
   * @param inputManager The shared input manager for keyboard and mouse state.
   */
  private setupFlyingCamera(inputManager: InputManager): void {
    this.flyingCamera = new FlyingCamera(
      this.contentElement,
      this.camera,
      inputManager,
      (-3 * Math.PI) / 4,
      -Math.asin(1 / Math.sqrt(3)),
      this.navigationFocus,
    );
  }

  /** Creates the Blender-style turntable orbit controller. */
  private setupOrbitCamera(): void {
    const settings = createDefaultMouseSettings();
    this.orbitCamera = new OrbitCameraController(this.contentElement, this.camera, this.navigationFocus, {
      sensitivity: settings.orbitSensitivity,
      invertYAxis: settings.orbitInvertYAxis,
      binding: settings.orbitBinding,
    });
  }

  /**
   * Sets the base movement speed for the 3D flying camera.
   *
   * @param speed World units moved per second before Shift boost.
   */
  setFlyingCameraMoveSpeed(speed: number): void {
    this.flyingCamera.setMoveSpeed(speed);
  }

  /**
   * Applies live orbit preferences from Mouse settings.
   *
   * @param settings Current persisted mouse settings.
   */
  setOrbitCameraSettings(settings: MouseSettings): void {
    this.orbitCamera.setPreferences({
      sensitivity: settings.orbitSensitivity,
      invertYAxis: settings.orbitInvertYAxis,
      binding: settings.orbitBinding,
    });
  }

  /**
   * Sets the stable world-space focus used by orbit navigation.
   *
   * @param focus New camera navigation focus.
   */
  setNavigationFocus(focus: THREE.Vector3): void {
    this.orbitCamera.setFocus(focus);
  }

  /**
   * Sets the world group reference for object collection.
   *
   * @param group The world group containing scene objects.
   */
  setWorldGroup(group: THREE.Group): void {
    this.worldGroup = group;
  }

  /**
   * Collects all selectable meshes from the world group.
   *
   * @returns An array of selectable mesh objects.
   */
  collectSelectableObjects(): THREE.Mesh[] {
    if (!this.worldGroup) return [];
    const meshes: THREE.Mesh[] = [];
    this.worldGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isEditorHelperObject(child)) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Sets the selection manager for this viewport.
   *
   * @param manager The selection manager instance.
   */
  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
    this.selectableObjects = [];
  }

  /**
   * Sets the selection highlight for this viewport.
   *
   * @param highlight The selection highlight instance.
   */
  setSelectionHighlight(_highlight: SelectionHighlight): void {}

  /**
   * Sets the selectable objects for raycasting.
   *
   * @param objects The meshes to make selectable.
   */
  setSelectableObjects(objects: THREE.Mesh[]): void {
    this.selectableObjects = objects;
  }

  /**
   * Returns the current selectable objects array.
   *
   * @returns The array of selectable meshes.
   */
  getSelectableObjects(): THREE.Mesh[] {
    return this.selectableObjects;
  }

  /**
   * Sets the gizmo group to be rendered in this viewport. Removes any
   * previously set gizmo group to avoid duplicates.
   *
   * @param group The Three.js group containing gizmo handles.
   */
  setGizmoGroup(group: THREE.Group): void {
    if (this.gizmoGroup) {
      this.scene.remove(this.gizmoGroup);
    }
    this.gizmoGroup = group;
    this.gizmoGroup.visible = false;
    this.scene.add(group);
  }

  /**
   * Returns the gizmo group for this viewport.
   *
   * @returns The gizmo group, or null if not set.
   */
  getGizmoGroup(): THREE.Group | null {
    return this.gizmoGroup;
  }

  /**
   * Sets the callback to handle transform gizmo pointer events.
   *
   * @param callback The transform event handler function.
   */
  setTransformCallback(callback: TransformCallback): void {
    this.transformCallback = callback;
  }

  /**
   * Sets the callback to handle face selection pointer events.
   *
   * @param callback The face selection event handler function.
   */
  setFaceSelectionCallback(callback: (event: MouseEvent) => boolean): void {
    this.faceSelectionCallback = callback;
  }

  /**
   * Sets the callback to handle clip plane tool pointer events.
   *
   * @param callback The clip plane event handler function.
   */
  setClipPlaneCallback(callback: (event: MouseEvent) => boolean): void {
    this.clipPlaneCallback = callback;
  }

  /**
   * Sets the callback that remaps raycast hits to world meshes.
   *
   * @param callback The mesh resolve function, or null to disable remapping.
   */
  setMeshResolveCallback(callback: MeshResolveCallback | null): void {
    this.meshResolveCallback = callback;
  }

  /** Configures pointer event listeners for selection and transform. */
  private setupClickSelection(): void {
    this.contentElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      blurActiveFormField();
      if (this.transformCallback && this.transformCallback(event)) return;
      if (this.faceSelectionCallback && this.faceSelectionCallback(event)) return;
      if (this.clipPlaneCallback && this.clipPlaneCallback(event)) return;
      if (!this.selectionManager) return;
      this.handleObjectSelection(event);
    });
    this.contentElement.addEventListener('pointermove', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
    this.contentElement.addEventListener('pointerup', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
  }

  /**
   * Handles a mouse click to select or deselect objects. Plain clicks cycle
   * through overlapping meshes; Shift adds; Ctrl/Meta toggles.
   *
   * @param event The pointer event from the click.
   */
  private handleObjectSelection(event: MouseEvent): void {
    const stack = this.getObjectPickStack(event);
    const additive = event.shiftKey;
    const toggle = event.ctrlKey || event.metaKey;
    if (stack.length === 0) {
      if (!additive && !toggle) this.selectionManager?.clearSelection();
      return;
    }
    if (!this.selectionManager) return;
    const picked = this.resolvePickFromStack(stack, additive, toggle);
    if (picked) {
      this.selectionManager.selectFromClick(picked, additive, toggle);
    }
  }

  /**
   * Builds the near-to-far world-mesh pick stack under the pointer. Used for
   * click-through selection and for bounds/gizmo skip decisions.
   *
   * @param event The pointer event providing screen coordinates.
   * @returns Unique world meshes ordered closest to farthest.
   */
  getObjectPickStack(event: MouseEvent): THREE.Mesh[] {
    const objects = this.getEffectiveSelectableObjects();
    if (objects.length === 0) return [];
    const intersections = this.raycaster.castIntersections(this.camera, this.contentElement, event, objects);
    return SelectionClickThrough.uniqueMeshesFromHits(intersections, (mesh) => this.resolveClickedMesh(mesh));
  }

  /**
   * Chooses the mesh for a click: frontmost for multi-select, cycle for plain.
   *
   * @param stack Unique world meshes ordered near-to-far.
   * @param additive True when Shift is held.
   * @param toggle True when Ctrl/Meta is held.
   * @returns Mesh to apply selection to, or null.
   */
  private resolvePickFromStack(stack: THREE.Mesh[], additive: boolean, toggle: boolean): THREE.Mesh | null {
    if (stack.length === 0 || !this.selectionManager) return null;
    if (additive || toggle) return stack[0] ?? null;
    return SelectionClickThrough.pickFromStack(stack, this.selectionManager);
  }

  /**
   * Returns whether the flying camera is currently navigating.
   *
   * @returns True during right-mouse fly or middle-mouse pan.
   */
  isCameraNavigating(): boolean {
    return this.flyingCamera.isNavigating() || this.orbitCamera.isNavigating();
  }

  /**
   * Returns selectable meshes, falling back to world group traversal when
   * empty.
   *
   * @returns Meshes available for raycasting.
   */
  private getEffectiveSelectableObjects(): THREE.Mesh[] {
    if (this.selectableObjects.length > 0) return this.selectableObjects;
    return this.collectSelectableObjects();
  }

  /**
   * Remaps a raycast hit to the authoritative world mesh when possible.
   *
   * @param clicked The mesh returned by the raycaster.
   * @returns The mesh that should enter the selection set.
   */
  private resolveClickedMesh(clicked: THREE.Mesh): THREE.Mesh {
    if (this.meshResolveCallback) {
      return this.meshResolveCallback(clicked);
    }
    return clicked;
  }

  /** Creates a camera-locked headlight. Ambient fill lives on the shared scene. */
  private setupLights(): void {
    this.ambientLight = new THREE.AmbientLight(Theme.lightAmbient, VIEWPORT_3D_AMBIENT_INTENSITY);
    this.ambientLight.visible = false;
    this.scene.add(this.ambientLight);
    this.cameraHeadlight = new CameraHeadlight(Theme.lightDirectional, VIEWPORT_3D_HEADLIGHT_INTENSITY);
    this.cameraHeadlight.attachToCamera(this.scene, this.camera);
    this.cameraHeadlight.getLight().visible = false;
  }

  /**
   * Updates the perspective camera aspect ratio for the pane content size.
   *
   * @param width Content width in CSS pixels.
   * @param height Content height in CSS pixels.
   */
  resize(width: number, height: number): void {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Shows this pane's grid, headlight, and gizmo clone; prepares brush edges
   * for the shared multi-view pass.
   */
  prepareRender(): void {
    this.shadingController.applyForRenderPass();
    this.gridRoot.visible = true;
    this.cameraHeadlight.getLight().visible = true;
    showGizmoForRenderPass(this.gizmoGroup);
    this.grids.update(this.camera);
    this.updateBrushEdgeDistanceFade();
    this.cameraWidget.syncOrientation(this.camera);
  }

  /**
   * Draws the shared-renderer orientation gizmo, then hides this pane's grid,
   * headlight, and gizmo after its multi-view pass.
   */
  endRenderPass(): void {
    this.renderCameraWidgetOverlay();
    this.gridRoot.visible = false;
    this.cameraHeadlight.getLight().visible = false;
    hideGizmoAfterRenderPass(this.gizmoGroup);
  }

  /**
   * Renders the camera orientation arrows into the top-right of this pane via
   * the shared WebGL surface (no private widget renderer).
   */
  private renderCameraWidgetOverlay(): void {
    const logicalSize = this.surface.getLogicalSize();
    const paneLogicalRect = measurePaneLogicalRectAgainst(
      this.contentElement,
      this.surface.getCanvas(),
      logicalSize.width,
      logicalSize.height,
    );
    this.cameraWidget.renderOverlay(this.surface.getRenderer(), paneLogicalRect);
  }

  /**
   * Restores dual-pass depth occlusion then distance-fades brush edges for the
   * perspective multi-view pass.
   */
  private updateBrushEdgeDistanceFade(): void {
    if (!this.worldGroup) return;
    SolidBrushEdgeFader.prepareForPerspectivePass(this.worldGroup);
    SolidBrushEdgeFader.updateForCamera(this.worldGroup, this.camera);
  }

  /**
   * Returns the perspective camera for this viewport.
   *
   * @returns The perspective camera instance.
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Returns a copy of the current camera position.
   *
   * @returns The camera position vector.
   */
  getCameraPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  /**
   * Returns a point one unit along the camera's current look direction.
   *
   * @returns A look-direction sample point in world space.
   */
  getCameraLookAt(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    return this.camera.position.clone().add(forward);
  }

  /**
   * Advances fly-camera and grid updates for one frame.
   *
   * @param deltaTime Elapsed seconds since the previous frame.
   */
  update(deltaTime: number): void {
    this.flyingCamera.update(deltaTime);
  }

  /**
   * Returns the ambient light used by this viewport.
   *
   * @returns The ambient light instance.
   */
  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Returns the directional headlight attached to the camera.
   *
   * @returns The directional light instance.
   */
  getDirectionalLight(): THREE.DirectionalLight {
    return this.cameraHeadlight.getLight();
  }

  /**
   * Returns the camera-attached headlight helper.
   *
   * @returns The CameraHeadlight instance.
   */
  getCameraHeadlight(): CameraHeadlight {
    return this.cameraHeadlight;
  }

  /**
   * Returns the on-screen camera orientation widget.
   *
   * @returns The camera widget instance.
   */
  getCameraWidget(): CameraWidget {
    return this.cameraWidget;
  }

  /**
   * Returns the shading controller for this viewport.
   *
   * @returns The ViewportShadingController instance.
   */
  getShadingController(): ViewportShadingController {
    return this.shadingController;
  }

  /**
   * Sets the shading mode for this viewport and updates the toolbar highlight.
   *
   * @param mode The shading mode to apply.
   */
  setShadingMode(mode: ShadingMode): void {
    this.shadingController.setShadingMode(mode);
    this.getViewportToolbar().setActiveShadingMode(mode);
  }

  /**
   * Returns the current shading mode of this viewport.
   *
   * @returns The current ShadingMode value.
   */
  getShadingMode(): ShadingMode {
    return this.shadingController.getShadingMode();
  }

  /**
   * Updates the shading controller overlay with current meshes.
   *
   * @param meshes The meshes to generate wireframe overlays for.
   */
  updateShadingMeshes(meshes: THREE.Mesh[]): void {
    this.shadingController.updateMeshes(meshes);
  }

  /**
   * Returns the grid system for this viewport.
   *
   * @returns The Grids instance.
   */
  getGrid(): Grids {
    return this.grids;
  }

  /**
   * Legacy accessor used by older grid update call sites.
   *
   * @returns The grid system (supports setSnapInterval).
   */
  getGridHelper(): Grids {
    return this.grids;
  }

  /**
   * Releases flying camera, widget, grids, shading, and base pickElement
   * resources.
   */
  override dispose(): void {
    if (this.getIsDisposed()) return;
    this.flyingCamera.dispose();
    this.orbitCamera.dispose();
    this.cameraWidget.dispose();
    this.scene.remove(this.gridRoot);
    this.scene.remove(this.ambientLight);
    this.grids.dispose();
    this.shadingController.dispose();
    this.transformCallback = null;
    this.faceSelectionCallback = null;
    this.clipPlaneCallback = null;
    this.meshResolveCallback = null;
    this.selectionManager = null;
    super.dispose();
  }
}
