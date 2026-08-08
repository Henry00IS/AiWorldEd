import * as THREE from 'three';
import { ViewportBase, type ViewportBaseOptions } from './viewport_base.js';
import { Grids, GridPlane } from '@/viewports/grid/grids.js';
import { HandlerOrthoPan } from '@/navigation/camera/handler_ortho_pan.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SelectionHighlight } from '@/selection/object/selection_highlight.js';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import { MeshResolveCallback } from './viewport_3d.js';
import { FrustumPlanes } from '@/types/frustum_planes.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { resizeOrthoFrustumPreservingZoom, zoomOrthoFrustumTowardPointer } from './ortho_zoom_limits.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { DEFAULT_ORTHO_HALF_EXTENT } from '@/types/editor_config.js';
import { getDefaultSceneFocus } from '@/navigation/placement/default_camera_placement.js';
import { OrthoDepthRanger } from './ortho_depth_ranger.js';
import { SolidBrushEdgeFader } from '@/solid/model/solid_brush_edge_fader.js';
import { hideGizmoAfterRenderPass, showGizmoForRenderPass } from '@/transform/gizmo/gizmo_viewport_visibility.js';
import type { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import {
  buildOrthoGridPlaneFrame,
  reorientOrthographicCamera,
} from '@/navigation/orientation/ortho_viewport_orientation.js';
import { applyEditModeLineStyleForOrthographicPass } from '@/edit/session/edit_mode_viewport_line_style.js';

/** Options for constructing a shared-scene orthographic pane. */
export interface Viewport2DOptions extends ViewportBaseOptions {
  plane: GridPlane;
  cameraPosition: THREE.Vector3;
}

export class Viewport2D extends ViewportBase {
  private camera: THREE.OrthographicCamera;
  private grids: Grids;
  private selectableObjects!: THREE.Mesh[];
  private raycaster!: SceneRaycaster;
  private worldGroup!: THREE.Group | null;
  private gizmoGroup!: THREE.Group | null;
  private meshResolveCallback!: MeshResolveCallback | null;
  private shadingController: ControllerViewportShading;
  private panHandler: HandlerOrthoPan | null;
  private gridRoot: THREE.Object3D;

  /**
   * Creates a new 2D orthographic viewport pane on the shared scene/surface.
   *
   * @param options Shared surface options plus plane and camera placement.
   */
  constructor(options: Viewport2DOptions) {
    super({ ...options, initialShadingMode: options.initialShadingMode ?? ShadingMode.WIREFRAME });
    this.grids = new Grids(50, 50, options.plane, 'orthographic');
    this.gridRoot = this.grids.getScene();
    this.gridRoot.visible = false;
    this.camera = this.createCamera(options.cameraPosition, options.plane);
    this.panHandler = null;
    this.initializeState();
    this.setupPanHandler();
    this.scene.add(this.gridRoot);
    this.shadingController = new ControllerViewportShading(this);
    // Preference only: applying WIREFRAME here would mutate the shared scene
    // during pane construction (workspace switch Quad↔Single) and leave solid
    // meshes wearing black outline materials until the next full multi-view pass.
    this.shadingController.setShadingMode(ShadingMode.WIREFRAME, false);
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
   * Accepts a selection manager without storing or using it.
   *
   * @param _manager The selection manager instance.
   */
  setSelectionManager(_manager: ManagerSelection): void {}

  /**
   * Accepts a selection highlight without storing or using it.
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

  /**
   * Builds the orthographic camera with the default startup zoom level. Sets a
   * stable up vector per plane so top-down lookAt is not degenerate.
   *
   * @param position World-space camera position for this orthographic plane.
   * @param plane Grid plane for this viewport.
   * @returns A configured orthographic camera looking at the default focus.
   */
  private createCamera(position: THREE.Vector3, plane: GridPlane): THREE.OrthographicCamera {
    const extent = DEFAULT_ORTHO_HALF_EXTENT;
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 1000);
    camera.position.copy(position);
    this.applyPlaneCameraUp(camera, plane);
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    return camera;
  }

  /**
   * Chooses a camera up vector that is never parallel to the look direction.
   * Top (XZ) looks down -Y, so world +Y cannot be used as up.
   *
   * @param camera Orthographic camera to configure.
   * @param plane Viewport grid plane.
   */
  private applyPlaneCameraUp(camera: THREE.OrthographicCamera, plane: GridPlane): void {
    if (plane === 'xz') {
      camera.up.set(0, 0, -1);
      return;
    }
    camera.up.set(0, 1, 0);
  }

  /** Attaches orthographic pan and wheel-zoom handling to the content element. */
  private setupPanHandler(): void {
    this.panHandler = new HandlerOrthoPan(this.contentElement, this.camera, (factor, pointerU, pointerV) =>
      this.zoomTowardPointer(factor, pointerU, pointerV),
    );
  }

  /**
   * Zooms the orthographic frustum toward the pointer so the projection-space
   * point under the cursor stays fixed (zoom-to-cursor).
   *
   * @param factor Multiplier for frustum size (greater than 1 zooms out).
   * @param pointerU Horizontal pointer in [0, 1] across the pane.
   * @param pointerV Vertical pointer in [0, 1] down the pane.
   */
  private zoomTowardPointer(factor: number, pointerU: number, pointerV: number): void {
    const next = zoomOrthoFrustumTowardPointer(
      {
        left: this.camera.left,
        right: this.camera.right,
        top: this.camera.top,
        bottom: this.camera.bottom,
      },
      factor,
      pointerU,
      pointerV,
    );
    this.camera.left = next.left;
    this.camera.right = next.right;
    this.camera.top = next.top;
    this.camera.bottom = next.bottom;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Updates the orthographic frustum aspect for the given pane size without
   * resetting wheel zoom.
   *
   * @param width Viewport width in CSS pixels.
   * @param height Viewport height in CSS pixels.
   */
  resize(width: number, height: number): void {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    const next = resizeOrthoFrustumPreservingZoom(
      {
        left: this.camera.left,
        right: this.camera.right,
        top: this.camera.top,
        bottom: this.camera.bottom,
      },
      safeWidth / safeHeight,
      DEFAULT_ORTHO_HALF_EXTENT,
    );
    this.camera.left = next.left;
    this.camera.right = next.right;
    this.camera.top = next.top;
    this.camera.bottom = next.bottom;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Shows this pane's grid, prepares solid brush edges and selection outlines
   * without depth darkening, and updates orthographic depth range.
   */
  prepareRender(): void {
    this.shadingController.applyForRenderPass();
    this.gridRoot.visible = true;
    showGizmoForRenderPass(this.gizmoGroup);
    if (this.worldGroup) {
      SolidBrushEdgeFader.prepareForOrthographicPass(this.worldGroup);
    }
    SelectionHighlight.setDepthOcclusionEnabled(false);
    OrthoDepthRanger.update(this.camera, this.scene);
    this.grids.update(this.camera);
    this.shadingController.applyDisplayOverlaysForRenderPass(this.worldGroup);
    applyEditModeLineStyleForOrthographicPass(this.worldGroup);
  }

  /** Hides this pane's grid and gizmo. */
  endRenderPass(): void {
    this.gridRoot.visible = false;
    hideGizmoAfterRenderPass(this.gizmoGroup);
  }

  /**
   * Returns whether the orthographic camera is currently panning.
   *
   * @returns True during right-mouse pan.
   */
  isCameraNavigating(): boolean {
    return this.panHandler?.isNavigating() ?? false;
  }

  /**
   * Reorients this Top / Front / Side camera and grid lattice to the working
   * grid frame while preserving the world point under the view center.
   *
   * @param orientation Shared grid orientation store.
   */
  applyGridOrientation(orientation: EditorOrientation): void {
    const basis = orientation.getWorldBasis();
    const planeFrame = orientation.getPlaneFrame();
    reorientOrthographicCamera(this.camera, this.getViewportKind(), basis, planeFrame.origin);
    const orthoFrame = buildOrthoGridPlaneFrame(this.getViewportKind(), basis, planeFrame.origin);
    this.grids.setPlaneFrame(orthoFrame);
  }

  /**
   * Returns the orthographic camera for this viewport.
   *
   * @returns The orthographic camera instance.
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Returns the current orthographic frustum plane values.
   *
   * @returns An object with left, right, top, and bottom frustum values.
   */
  getCameraFrustum(): FrustumPlanes {
    return {
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom,
    };
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
   * @returns The Grids instance.
   */
  getGridHelper(): Grids {
    return this.grids;
  }

  /** Releases grids, pan handler, shading, and base renderer resources. */
  override dispose(): void {
    if (this.getIsDisposed()) return;
    this.panHandler?.dispose();
    this.panHandler = null;
    this.scene.remove(this.gridRoot);
    this.grids.dispose();
    this.shadingController.dispose();
    this.meshResolveCallback = null;
    super.dispose();
  }
}
