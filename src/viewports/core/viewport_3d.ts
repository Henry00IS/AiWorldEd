import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ViewportBase, type ViewportBaseOptions } from './viewport_base.js';
import { Grids } from '@/viewports/grid/grids.js';
import { ManagerInput } from '@/input/manager_input.js';
import { CameraFlying } from '@/navigation/camera/camera_flying.js';
import type { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { CameraWidget } from '@/ui/camera/camera_widget.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SelectionHighlight } from '@/selection/object/selection_highlight.js';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { CameraHeadlight } from './camera_headlight.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import {
  getDefaultPerspectiveCameraPosition,
  getDefaultSceneFocus,
} from '@/navigation/placement/default_camera_placement.js';
import { SolidBrushEdgeFader } from '@/solid/model/solid_brush_edge_fader.js';
import { measurePaneLogicalRectAgainst } from '@/viewports/pane/pane_content_rect.js';
import { hideGizmoAfterRenderPass, showGizmoForRenderPass } from '@/transform/gizmo/gizmo_viewport_visibility.js';
import { applyEditModeLineStyleForPerspectivePass } from '@/edit/session/edit_mode_viewport_line_style.js';

/** Ambient fill intensity for the 3D viewport. */
export const VIEWPORT_3D_AMBIENT_INTENSITY = 0.7;

/** Camera headlight intensity for the 3D viewport key light. */
export const VIEWPORT_3D_HEADLIGHT_INTENSITY = 1.15;

/**
 * Resolves a raycast hit mesh to the authoritative world mesh.
 *
 * @param mesh The mesh hit by the raycaster.
 * @returns The world mesh that should be selected.
 */
export type MeshResolveCallback = (mesh: THREE.Mesh) => THREE.Mesh;

/** Options for constructing a shared-scene perspective pane. */
export interface Viewport3DOptions extends ViewportBaseOptions {
  inputManager: ManagerInput;
}

export class Viewport3D extends ViewportBase {
  private camera!: THREE.PerspectiveCamera;
  private grids: Grids;
  private flyingCamera!: CameraFlying;
  private cameraWidget: CameraWidget;
  private ambientLight!: THREE.AmbientLight;
  private cameraHeadlight!: CameraHeadlight;
  private selectableObjects!: THREE.Mesh[];
  private raycaster!: SceneRaycaster;
  private worldGroup!: THREE.Group | null;
  private gizmoGroup!: THREE.Group | null;
  private meshResolveCallback!: MeshResolveCallback | null;
  private shadingController: ControllerViewportShading;
  private gridRoot: THREE.Object3D;
  private gridOrientationStore: EditorOrientation | null;
  private cameraOrientationStore: EditorOrientation | null;

  /**
   * Creates a new 3D perspective viewport pane on the shared scene/surface.
   *
   * @param options Shared surface options plus input manager.
   */
  constructor(options: Viewport3DOptions) {
    super({ ...options, name: options.name || 'Perspective' });
    this.grids = new Grids(50, 50, 'xz', 'perspective');
    this.gridRoot = this.grids.getScene();
    this.gridRoot.visible = false;
    this.initializeCamera();
    this.initializeState();
    this.setupLights();
    this.setupFlyingCamera(options.inputManager);
    this.scene.add(this.gridRoot);
    this.cameraWidget = new CameraWidget();
    this.shadingController = new ControllerViewportShading(this);
    this.gridOrientationStore = null;
    this.cameraOrientationStore = null;
  }

  /**
   * Creates the perspective camera at the default position and aims it at the
   * default scene focus point.
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
    this.worldGroup = null;
    this.gizmoGroup = null;
    this.raycaster = new SceneRaycaster();
    this.meshResolveCallback = null;
  }

  /**
   * Creates the flying camera controller for orbit navigation.
   *
   * @param inputManager The shared input manager for keyboard and mouse state.
   */
  private setupFlyingCamera(inputManager: ManagerInput): void {
    this.flyingCamera = new CameraFlying(
      this.contentElement,
      this.camera,
      inputManager,
      (-3 * Math.PI) / 4,
      -Math.asin(1 / Math.sqrt(3)),
    );
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
   * Sets the world group reference for object collection.
   *
   * @param group The world group containing scene objects.
   */
  setWorldGroup(group: THREE.Group): void {
    this.worldGroup = group;
  }

  /**
   * Returns the world group bound to this viewport, when present.
   *
   * @returns World group or null.
   */
  getWorldGroup(): THREE.Group | null {
    return this.worldGroup;
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
   * Clears the local selectable-objects cache. The selection manager argument
   * is ignored.
   *
   * @param _manager The selection manager instance.
   */
  setSelectionManager(_manager: ManagerSelection): void {
    this.selectableObjects = [];
  }

  /**
   * Accepts a selection highlight argument that is ignored.
   *
   * @param _highlight The selection highlight instance.
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
   * Sets the callback that remaps raycast hits to world meshes.
   *
   * @param callback The mesh resolve function, or null to disable remapping.
   */
  setMeshResolveCallback(callback: MeshResolveCallback | null): void {
    this.meshResolveCallback = callback;
  }

  /**
   * Builds the near-to-far world-mesh pick stack under the pointer.
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
   * Returns whether the flying camera is currently navigating.
   *
   * @returns True during right-mouse fly or middle-mouse pan.
   */
  isCameraNavigating(): boolean {
    return this.flyingCamera.isNavigating();
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
    this.shadingController.applyDisplayOverlaysForRenderPass(this.worldGroup);
    applyEditModeLineStyleForPerspectivePass(this.worldGroup);
    this.cameraWidget.syncOrientation(this.camera, this.gridOrientationStore, this.cameraOrientationStore);
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
   * Restores depth-tested brush edges and selection outlines, then
   * distance-fades brush edges for the perspective multi-view pass.
   */
  private updateBrushEdgeDistanceFade(): void {
    SelectionHighlight.setDepthOcclusionEnabled(true);
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

  /** Syncs flying-camera yaw and pitch from the current camera orientation. */
  syncFlyingCameraOrientation(): void {
    this.flyingCamera.syncOrientationFromCamera();
  }

  /**
   * Binds the shared editor working orientation to the flying camera.
   *
   * @param editorOrientation Shared orientation store.
   */
  setEditorOrientation(editorOrientation: EditorOrientation): void {
    this.flyingCamera.setEditorOrientation(editorOrientation);
    this.cameraOrientationStore = editorOrientation;
  }

  /**
   * Binds the shared grid orientation for the corner camera widget triad.
   *
   * @param gridOrientation Shared grid orientation store.
   */
  setGridOrientationStore(gridOrientation: EditorOrientation): void {
    this.gridOrientationStore = gridOrientation;
  }

  /**
   * Applies a visual grid plane frame for the perspective floor grid.
   *
   * @param frame Plane origin, U/V axes, and normal.
   */
  setGridPlaneFrame(frame: EditorPlaneFrame): void {
    this.grids.setPlaneFrame(frame);
  }

  /** Restores the default world XZ floor frame for the perspective grid. */
  resetGridPlaneFrame(): void {
    this.grids.resetPlaneFrame();
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
   * Returns the ambient light for this viewport.
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
  getShadingController(): ControllerViewportShading {
    return this.shadingController;
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
   * Returns the grid system for this viewport.
   *
   * @returns The grid system.
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
    this.cameraWidget.dispose();
    this.scene.remove(this.gridRoot);
    this.scene.remove(this.ambientLight);
    this.grids.dispose();
    this.shadingController.dispose();
    this.meshResolveCallback = null;
    super.dispose();
  }
}
