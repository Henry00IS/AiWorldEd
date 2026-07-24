import * as THREE from 'three';
import { Theme } from '../theme.js';
import { BaseViewport } from './base_viewport.js';
import { Grids } from './grids.js';
import { InputManager } from '../managers/input_manager.js';
import { FlyingCamera } from '../managers/flying_camera.js';
import { CameraWidget } from '../ui/camera_widget.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { SelectionHighlight } from '../selection/selection_highlight.js';
import { SceneRaycaster } from '../selection/scene_raycaster.js';
import { ViewportShadingController } from './viewport_shading_controller.js';
import { ShadingMode } from '../types/shading_mode.js';
import { CameraHeadlight } from './camera_headlight.js';
import { blurActiveFormField } from '../utils/dom_focus.js';
import { isEditorHelperObject } from '../utils/mesh_edge_sync.js';
import {
  getDefaultPerspectiveCameraPosition,
  getDefaultSceneFocus
} from '../navigation/default_camera_placement.js';

/**
 * Ambient fill intensity for the 3D viewport (white content stays readable).
 */
export const VIEWPORT_3D_AMBIENT_INTENSITY = 0.7;

/**
 * Camera headlight intensity for the 3D viewport key light.
 */
export const VIEWPORT_3D_HEADLIGHT_INTENSITY = 1.15;

/**
 * Callback type for transform gizmo pointer events.
 * @param event The pointer event.
 * @returns True if the event was consumed by the transform handler.
 */
export type TransformCallback = (event: MouseEvent) => boolean;

/**
 * Resolves a raycast hit mesh to the authoritative world mesh.
 * @param mesh The mesh hit by the raycaster.
 * @returns The world mesh that should be selected.
 */
export type MeshResolveCallback = (mesh: THREE.Mesh) => THREE.Mesh;

export class Viewport3D extends BaseViewport {
  private camera: THREE.PerspectiveCamera;
  private grids: Grids;
  private flyingCamera: FlyingCamera;
  private cameraWidget: CameraWidget;
  private ambientLight: THREE.AmbientLight;
  private cameraHeadlight: CameraHeadlight;
  private selectableObjects: THREE.Mesh[];
  private selectionManager: SelectionManager | null;
  private selectionHighlight: SelectionHighlight | null;
  private raycaster: SceneRaycaster;
  private worldGroup: THREE.Group | null;
  private gizmoGroup: THREE.Group | null;
  private transformCallback: TransformCallback | null;
  private faceSelectionCallback: ((event: MouseEvent) => boolean) | null;
  private clipPlaneCallback: ((event: MouseEvent) => boolean) | null;
  private meshResolveCallback: MeshResolveCallback | null;
  private shadingController: ViewportShadingController;

  private readonly inputManager: InputManager;

  /**
   * Creates a new 3D perspective viewport.
   * @param container The DOM element that will contain this viewport.
   * @param inputManager The shared input manager for camera controls.
   */
  constructor(container: HTMLElement, inputManager: InputManager) {
    super(container, 'Perspective');
    this.inputManager = inputManager;
    this.grids = new Grids(50, 50, 'xz', 'perspective');
    this.initializeCamera();
    this.initializeState();
    this.setupLights();
    this.setupClickSelection();
    this.setupFlyingCamera(inputManager);
    this.scene.add(this.grids.getScene());
    this.renderer.domElement.style.zIndex = '1';
    this.cameraWidget = new CameraWidget(this.container);
    this.shadingController = new ViewportShadingController(this);
  }

  /**
   * Creates and configures the perspective camera near the default cube.
   * Raises the camera by the cube center height so the view aims at the cube.
   */
  private initializeCamera(): void {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.copy(getDefaultPerspectiveCameraPosition());
    const focus = getDefaultSceneFocus();
    this.camera.lookAt(focus.x, focus.y, focus.z);
  }

  /**
   * Initializes the mutable state properties of this viewport.
   */
  private initializeState(): void {
    this.selectableObjects = [];
    this.selectionManager = null;
    this.selectionHighlight = null;
    this.worldGroup = null;
    this.raycaster = new SceneRaycaster();
    this.faceSelectionCallback = null;
    this.clipPlaneCallback = null;
    this.meshResolveCallback = null;
  }

  /**
   * Creates the flying camera controller for orbit navigation.
   * @param inputManager The shared input manager for keyboard and mouse state.
   */
  private setupFlyingCamera(inputManager: InputManager): void {
    this.flyingCamera = new FlyingCamera(
      this.renderer.domElement,
      this.camera,
      inputManager,
      -3 * Math.PI / 4,
      -Math.asin(1 / Math.sqrt(3))
    );
  }

  /**
   * Sets the base movement speed for the 3D flying camera.
   * @param speed World units moved per second before Shift boost.
   */
  setFlyingCameraMoveSpeed(speed: number): void {
    this.flyingCamera.setMoveSpeed(speed);
  }

  /**
   * Sets the world group reference for object collection.
   * @param group The world group containing scene objects.
   */
  setWorldGroup(group: THREE.Group): void {
    this.worldGroup = group;
  }

  /**
   * Collects all selectable meshes from the world group.
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
   * @param manager The selection manager instance.
   */
  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
    this.selectableObjects = [];
  }

  /**
   * Sets the selection highlight for this viewport.
   * @param highlight The selection highlight instance.
   */
  setSelectionHighlight(highlight: SelectionHighlight): void {
    this.selectionHighlight = highlight;
  }

  /**
   * Sets the selectable objects for raycasting.
   * @param objects The meshes to make selectable.
   */
  setSelectableObjects(objects: THREE.Mesh[]): void {
    this.selectableObjects = objects;
  }

  /**
   * Returns the current selectable objects array.
   * @returns The array of selectable meshes.
   */
  getSelectableObjects(): THREE.Mesh[] {
    return this.selectableObjects;
  }

  /**
   * Sets the gizmo group to be rendered in this viewport.
   * Removes any previously set gizmo group to avoid duplicates.
   * @param group The Three.js group containing gizmo handles.
   */
  setGizmoGroup(group: THREE.Group): void {
    if (this.gizmoGroup) {
      this.scene.remove(this.gizmoGroup);
    }
    this.gizmoGroup = group;
    this.scene.add(group);
  }

  /**
   * Returns the gizmo group for this viewport.
   * @returns The gizmo group, or null if not set.
   */
  getGizmoGroup(): THREE.Group | null {
    return this.gizmoGroup;
  }

  /**
    * Sets the callback to handle transform gizmo pointer events.
    * @param callback The transform event handler function.
    */
  setTransformCallback(callback: TransformCallback): void {
    this.transformCallback = callback;
  }

  /**
    * Sets the callback to handle face selection pointer events.
    * @param callback The face selection event handler function.
    */
  setFaceSelectionCallback(callback: (event: MouseEvent) => boolean): void {
    this.faceSelectionCallback = callback;
  }

  /**
   * Sets the callback to handle clip plane tool pointer events.
   * @param callback The clip plane event handler function.
   */
  setClipPlaneCallback(callback: (event: MouseEvent) => boolean): void {
    this.clipPlaneCallback = callback;
  }

  /**
   * Sets the callback that remaps raycast hits to world meshes.
   * @param callback The mesh resolve function, or null to disable remapping.
   */
  setMeshResolveCallback(callback: MeshResolveCallback | null): void {
    this.meshResolveCallback = callback;
  }

  /**
   * Configures pointer event listeners for selection and transform.
   */
  private setupClickSelection(): void {
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      blurActiveFormField();
      if (this.transformCallback && this.transformCallback(event)) return;
      if (this.faceSelectionCallback && this.faceSelectionCallback(event)) return;
      if (this.clipPlaneCallback && this.clipPlaneCallback(event)) return;
      if (!this.selectionManager) return;
      this.handleObjectSelection(event);
    });
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
  }

  /**
   * Handles a mouse click to select or deselect objects.
   * Shift adds to selection; Ctrl/Meta toggles; empty click clears unless multi-mod.
   * @param event The pointer event from the click.
   */
  private handleObjectSelection(event: MouseEvent): void {
    const objects = this.getEffectiveSelectableObjects();
    if (objects.length === 0) return;
    const clicked = this.raycaster.cast(
      this.camera,
      this.renderer,
      event,
      objects
    );
    if (clicked) {
      const resolved = this.resolveClickedMesh(clicked);
      const additive = event.shiftKey;
      const toggle = event.ctrlKey || event.metaKey;
      this.selectionManager?.selectFromClick(resolved, additive, toggle);
    } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      this.selectionManager?.clearSelection();
    }
  }

  /**
   * Returns whether the flying camera is currently navigating.
   * @returns True during right-mouse fly or middle-mouse pan.
   */
  isCameraNavigating(): boolean {
    return this.flyingCamera.isNavigating();
  }

  /**
   * Returns selectable meshes, falling back to world group traversal when empty.
   * @returns Meshes available for raycasting.
   */
  private getEffectiveSelectableObjects(): THREE.Mesh[] {
    if (this.selectableObjects.length > 0) return this.selectableObjects;
    return this.collectSelectableObjects();
  }

  /**
   * Remaps a raycast hit to the authoritative world mesh when possible.
   * @param clicked The mesh returned by the raycaster.
   * @returns The mesh that should enter the selection set.
   */
  private resolveClickedMesh(clicked: THREE.Mesh): THREE.Mesh {
    if (this.meshResolveCallback) {
      return this.meshResolveCallback(clicked);
    }
    return clicked;
  }

  /**
   * Adds ambient fill and a directional headlight locked to the camera.
   * Intensities are tuned so white content materials stay readable when
   * facing the camera (PBR MeshStandardMaterial needs more fill than Basic).
   */
  private setupLights(): void {
    this.ambientLight = new THREE.AmbientLight(
      Theme.lightAmbient,
      VIEWPORT_3D_AMBIENT_INTENSITY
    );
    this.scene.add(this.ambientLight);
    this.cameraHeadlight = new CameraHeadlight(
      Theme.lightDirectional,
      VIEWPORT_3D_HEADLIGHT_INTENSITY
    );
    this.cameraHeadlight.attachToCamera(this.scene, this.camera);
  }

  /**
   * Resizes the renderer and updates the perspective camera aspect ratio.
   * @param width Viewport width in CSS pixels.
   * @param height Viewport height in CSS pixels.
   */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Updates grids, renders the scene, and refreshes the camera widget.
   */
  render(): void {
    this.grids.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.cameraWidget.update(this.camera);
  }

  /**
   * Returns the perspective camera for this viewport.
   * @returns The perspective camera instance.
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Returns a copy of the current camera position.
   * @returns The camera position vector.
   */
  getCameraPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  /**
   * Returns a point one unit along the camera's current look direction.
   * @returns A look-direction sample point in world space.
   */
  getCameraLookAt(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    return this.camera.position.clone().add(forward);
  }

  /**
   * Advances fly-camera and grid updates for one frame.
   * @param deltaTime Elapsed seconds since the previous frame.
   */
  update(deltaTime: number): void {
    this.flyingCamera.update(deltaTime);
    this.grids.update(this.camera);
  }

  /**
   * Returns the ambient light used by this viewport.
   * @returns The ambient light instance.
   */
  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Returns the directional headlight attached to the camera.
   * @returns The directional light instance.
   */
  getDirectionalLight(): THREE.DirectionalLight {
    return this.cameraHeadlight.getLight();
  }

  /**
   * Returns the camera-attached headlight helper.
   * @returns The CameraHeadlight instance.
   */
  getCameraHeadlight(): CameraHeadlight {
    return this.cameraHeadlight;
  }

  /**
   * Returns the on-screen camera orientation widget.
   * @returns The camera widget instance.
   */
  getCameraWidget(): CameraWidget {
    return this.cameraWidget;
  }

  /**
   * Returns the shading controller for this viewport.
   * @returns The ViewportShadingController instance.
   */
  getShadingController(): ViewportShadingController {
    return this.shadingController;
  }

  /**
   * Sets the shading mode for this viewport and updates the toolbar highlight.
   * @param mode The shading mode to apply.
   */
  setShadingMode(mode: ShadingMode): void {
    this.shadingController.setShadingMode(mode);
    this.getViewportToolbar().setActiveShadingMode(mode);
  }

  /**
   * Returns the current shading mode of this viewport.
   * @returns The current ShadingMode value.
   */
  getShadingMode(): ShadingMode {
    return this.shadingController.getShadingMode();
  }

  /**
   * Updates the shading controller overlay with current meshes.
   * @param meshes The meshes to generate wireframe overlays for.
   */
  updateShadingMeshes(meshes: THREE.Mesh[]): void {
    this.shadingController.updateMeshes(meshes);
  }

  /**
   * Returns the grid system for this viewport.
   * @returns The Grids instance.
   */
  getGrid(): Grids {
    return this.grids;
  }

  /**
   * Legacy accessor used by older grid update call sites.
   * @returns The grid system (supports setSnapInterval).
   */
  getGridHelper(): Grids {
    return this.grids;
  }
}
