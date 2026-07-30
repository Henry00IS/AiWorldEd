import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { TransformMode } from '../../types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { TranslateGizmo } from './translate_gizmo.js';
import { RotateGizmo } from './rotate_gizmo.js';
import { ScaleGizmo } from './scale_gizmo.js';
import { BoundsGizmo } from '../bounds/bounds_gizmo.js';
import { OrientedBoundsBuilder, OrientedBoundsData } from '../bounds/oriented_bounds.js';
import type { BoundsFace } from '../../types/bounds_face.js';
import type { CadViewPlane } from '../../rulers/cad_view_plane.js';
import { setGizmoWantedVisible } from './gizmo_viewport_visibility.js';
import type { BoundsFaceHighlightMode } from '../bounds/bounds_face_highlight.js';
import {
  computeBoundsCubeVisualWorldSize,
  computeBoundsCubeWorldSize,
  computeBoundsEarWorldSize,
} from '../bounds/bounds_handle_screen_size.js';
import { computeGizmoCameraScale } from './gizmo_camera_scale.js';
import { isGizmoAxisHiddenInViewPlane } from './gizmo_view_plane_axes.js';
import { applyGizmoCloneDepthStyle } from './gizmo_depth_style.js';
import { CoordinateSpaceAdapter } from '../../coordinates/coordinate_space_adapter.js';
import { createDefaultCoordinateSpace } from '../../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../../settings/coordinate_space_types.js';
import type { GizmoAxis } from '../../types/transform_mode.js';
import { TransformProjectionMath } from '../transform_projection_math.js';

/**
 * Main orchestrator for the transform gizmo. Manages mode switching, handle
 * creation, and active state. Builds handles once on the master group, then
 * clones into each viewport group so handleIds stay consistent across all
 * viewports.
 */
export class TransformGizmo {
  private currentMode: TransformMode;
  private handleGroup: THREE.Group;
  private viewportGroups: THREE.Group[];
  private viewportPlanes: CadViewPlane[];
  private currentHandles: GizmoHandle[];
  private activeHandle: GizmoHandle | null;
  private translateGizmo: TranslateGizmo;
  private rotateGizmo: RotateGizmo;
  private scaleGizmo: ScaleGizmo;
  private boundsGizmo: BoundsGizmo;
  private boundsBuilder: OrientedBoundsBuilder;
  private gizmoVisible: boolean;
  /**
   * When true (Global space), orthographic clones hide the view depth axis on
   * translate/scale handles. Local space keeps every axis visible.
   */
  private hideOrthoDepthAxes: boolean;
  /**
   * Stable signature of the last applied bounds pose used to skip redundant
   * rebuilds.
   */
  private lastBoundsPoseSignature: string;
  private coordinateAdapter: CoordinateSpaceAdapter;

  /**
   * Creates a new transform gizmo.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.currentMode = TransformMode.BOUNDS;
    this.handleGroup = new THREE.Group();
    this.handleGroup.name = 'transform_gizmo';
    this.viewportGroups = [];
    this.viewportPlanes = [];
    this.currentHandles = [];
    this.activeHandle = null;
    this.translateGizmo = new TranslateGizmo(theme);
    this.rotateGizmo = new RotateGizmo(theme);
    this.scaleGizmo = new ScaleGizmo(theme);
    this.boundsGizmo = new BoundsGizmo(theme);
    this.boundsBuilder = new OrientedBoundsBuilder();
    this.gizmoVisible = false;
    this.handleGroup.visible = false;
    this.hideOrthoDepthAxes = true;
    this.lastBoundsPoseSignature = '';
    this.coordinateAdapter = new CoordinateSpaceAdapter(createDefaultCoordinateSpace());
    this.buildHandlesForMode(this.currentMode);
  }

  /**
   * Applies profile coordinate axes to current and future transform handles.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    this.coordinateAdapter = new CoordinateSpaceAdapter(space);
    this.translateGizmo.setCoordinateSpace(space);
    this.rotateGizmo.setCoordinateSpace(space);
    this.scaleGizmo.setCoordinateSpace(space);
    if (this.currentMode !== TransformMode.BOUNDS) this.buildHandlesForMode(this.currentMode);
  }

  /**
   * Resolves a profile gizmo axis into its current world direction.
   *
   * @param axis Profile gizmo axis.
   * @returns Normalized editor-world direction.
   */
  axisToWorldVector(axis: GizmoAxis): THREE.Vector3 {
    const profileDirection = TransformProjectionMath.axisToVector3(axis);
    const editorDirection = this.coordinateAdapter.toEditorDirection(profileDirection);
    return editorDirection.applyQuaternion(this.handleGroup.quaternion).normalize();
  }

  /**
   * Sets the transform mode and rebuilds handles.
   *
   * @param mode The new transform mode.
   */
  setMode(mode: TransformMode): void {
    this.currentMode = mode;
    this.activeHandle = null;
    this.lastBoundsPoseSignature = '';
    this.resetHandleGroupTransform();
    this.buildHandlesForMode(mode);
  }

  /**
   * Resets master and viewport gizmo group transforms to identity. Prevents
   * leftover pivot scale from other modes from skewing Bounds.
   */
  private resetHandleGroupTransform(): void {
    this.handleGroup.position.set(0, 0, 0);
    this.handleGroup.quaternion.identity();
    this.handleGroup.scale.set(1, 1, 1);
    this.viewportGroups.forEach((group) => {
      group.position.set(0, 0, 0);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
    });
  }

  /**
   * Returns the current transform mode.
   *
   * @returns The active TransformMode enum value.
   */
  getMode(): TransformMode {
    return this.currentMode;
  }

  /**
   * Returns the Three.js group containing all gizmo handles.
   *
   * @returns The handle group to add to a viewport scene.
   */
  getHandleGroup(): THREE.Group {
    return this.handleGroup;
  }

  /**
   * Creates a fresh clone of the handle group for a specific viewport. Each
   * viewport must have its own group to avoid Three.js parent conflicts.
   *
   * @param viewPlane Orthographic plane or full 3D; depth-axis bounds handles
   *   are hidden in 2D views.
   * @returns A new Three.js group with cloned gizmo children.
   */
  getHandleGroupClone(viewPlane: CadViewPlane = 'xyz'): THREE.Group {
    const clone = this.cloneHandleGroupContents();
    this.viewportGroups.push(clone);
    this.viewportPlanes.push(viewPlane);
    setGizmoWantedVisible(clone, this.gizmoVisible);
    this.applyViewPlaneFilters(clone, viewPlane);
    return clone;
  }

  /**
   * Controls whether orthographic panes hide the Global-space depth axis on
   * translate/scale tools (TOP hides Y, FRONT hides Z, SIDE hides X).
   *
   * @param hide True for Global space; false for Local space.
   */
  setHideOrthoDepthAxes(hide: boolean): void {
    if (this.hideOrthoDepthAxes === hide) return;
    this.hideOrthoDepthAxes = hide;
    this.refreshViewPlaneAxisFilters();
  }

  /**
   * Returns the current array of gizmo handles.
   *
   * @returns All active GizmoHandle instances.
   */
  getHandles(): GizmoHandle[] {
    return this.currentHandles;
  }

  /**
   * Sets which handle is currently active (being dragged).
   *
   * @param handle The handle to activate, or null to clear.
   */
  setActiveHandle(handle: GizmoHandle | null): void {
    this.clearActiveHighlight();
    this.activeHandle = handle;
    if (handle) {
      this.applyActiveHighlight(handle);
    }
  }

  /**
   * Checks if a specific handle is currently active.
   *
   * @param handle The handle to check.
   * @returns True if the handle is active.
   */
  isHandleActive(handle: GizmoHandle): boolean {
    return this.activeHandle === handle;
  }

  /**
   * Returns the currently active handle.
   *
   * @returns The active handle, or null.
   */
  getActiveHandle(): GizmoHandle | null {
    return this.activeHandle;
  }

  /**
   * Updates the gizmo pivot position on the master group and all clones.
   *
   * @param pivot The new pivot point in world space.
   */
  setPivot(pivot: THREE.Vector3): void {
    if (this.currentMode === TransformMode.BOUNDS) return;
    this.handleGroup.position.copy(pivot);
    this.viewportGroups.forEach((group) => {
      group.position.copy(pivot);
    });
  }

  /**
   * Orients translate/rotate/scale handles in world space. Bounds mode owns its
   * own orientation from the OBB.
   *
   * @param orientation World-space rotation for the handle group.
   */
  setOrientation(orientation: THREE.Quaternion): void {
    if (this.currentMode === TransformMode.BOUNDS) return;
    this.handleGroup.quaternion.copy(orientation);
    this.viewportGroups.forEach((group) => {
      group.quaternion.copy(orientation);
    });
  }

  /**
   * Returns the current handle-group orientation (local axes in world space).
   *
   * @returns Quaternion of the master handle group.
   */
  getOrientation(): THREE.Quaternion {
    return this.handleGroup.quaternion.clone();
  }

  /**
   * Rebuilds Bounds gizmo pose from the current selection.
   *
   * @param meshes Selected meshes defining the OBB.
   * @param camera Optional camera used to size resize handles.
   */
  updateBoundsFromMeshes(meshes: THREE.Mesh[], camera: THREE.Camera | null = null): void {
    if (this.currentMode !== TransformMode.BOUNDS) return;
    const bounds = this.boundsBuilder.buildFromMeshes(meshes);
    const poseSignature = this.buildBoundsPoseSignature(bounds);
    if (poseSignature === this.lastBoundsPoseSignature) {
      return;
    }
    this.lastBoundsPoseSignature = poseSignature;
    const cubePickSize = computeBoundsCubeWorldSize(bounds, camera);
    const cubeVisualSize = computeBoundsCubeVisualWorldSize(bounds, camera);
    const earSize = computeBoundsEarWorldSize(bounds);
    this.resetHandleGroupTransform();
    this.boundsGizmo.updateFromBounds(bounds, cubePickSize, earSize, cubeVisualSize);
    this.syncMasterTransformToClones();
  }

  /**
   * Applies per-viewport screen-space bounds styling for the active camera
   * (constant-size 2D ears; 3D pick versus visual arrow sizes). Call each frame
   * before drawing a multi-view pane.
   *
   * @param group Viewport gizmo clone.
   * @param camera Pane camera.
   * @param viewPlane Pane view plane.
   * @param viewportHeightPx Drawable content height in CSS pixels.
   */
  prepareBoundsCloneForCamera(
    group: THREE.Group,
    camera: THREE.Camera,
    viewPlane: CadViewPlane,
    viewportHeightPx: number,
  ): void {
    if (this.currentMode !== TransformMode.BOUNDS) return;
    if (!this.gizmoVisible) return;
    this.boundsGizmo.applyScreenSpaceStyleToClone(group, viewPlane, camera, viewportHeightPx);
    this.applyCloneDepthStyleForCamera(group, camera);
  }

  /**
   * Scales one viewport gizmo clone for that pane's camera only. 2D
   * orthographic panes use frustum height; perspective uses distance. Call per
   * pane so flying the 3D camera cannot inflate Top/Front/Side handles.
   *
   * @param group Viewport gizmo clone.
   * @param camera Pane camera.
   * @param targetScale Optional extra multiplier.
   */
  prepareTransformCloneForCamera(group: THREE.Group, camera: THREE.Camera, targetScale: number = 1): void {
    if (this.currentMode === TransformMode.BOUNDS) return;
    if (!this.gizmoVisible) return;
    const scale = computeGizmoCameraScale(camera, group.position) * targetScale;
    group.scale.setScalar(scale);
    this.applyCloneDepthStyleForCamera(group, camera);
  }

  /**
   * 2D panes draw gizmos fully on top; 3D keeps transparent occlusion behind
   * geometry. Applied per multi-view pass for the pane about to render.
   *
   * @param group Viewport gizmo clone.
   * @param camera Pane camera.
   */
  private applyCloneDepthStyleForCamera(group: THREE.Group, camera: THREE.Camera): void {
    applyGizmoCloneDepthStyle(group, camera instanceof THREE.OrthographicCamera);
  }

  /**
   * Returns the current oriented bounds shown by the Bounds gizmo.
   *
   * @returns Bounds data, or null.
   */
  getCurrentBounds(): OrientedBoundsData | null {
    return this.boundsGizmo.getCurrentBounds();
  }

  /**
   * Shows or hides bounds corner guide lines in all viewports.
   *
   * @param visible Whether the guide lines should be drawn.
   */
  setBoundsGuideLinesVisible(visible: boolean): void {
    this.boundsGizmo.setGuideLinesVisible(visible);
    this.lastBoundsPoseSignature = '';
    this.syncMasterTransformToClones();
  }

  /**
   * Shows or hides bounds mid-face resize grips (2D CAD ears and 3D arrows) in
   * all viewports. Used while a bounds body-move (position) drag is active;
   * resize drags leave grips visible.
   *
   * @param visible Whether resize grips should be drawn.
   */
  setBoundsResizeHandlesVisible(visible: boolean): void {
    this.boundsGizmo.setResizeHandlesVisible(visible);
    this.lastBoundsPoseSignature = '';
    this.syncMasterTransformToClones();
  }

  /**
   * Highlights a bounds face for resize (orange) or body-move (white, 3D only)
   * hover on master and all viewport clones.
   *
   * @param face Face to highlight, or null to clear.
   * @param mode Resize vs body-move styling.
   */
  setHighlightedBoundsFace(face: BoundsFace | null, mode: BoundsFaceHighlightMode = 'resize'): void {
    if (this.currentMode !== TransformMode.BOUNDS) return;
    if (this.boundsGizmo.getHighlightedFace() === face && this.boundsGizmo.getHighlightMode() === mode) {
      return;
    }
    this.boundsGizmo.setHighlightedFace(face, mode);
    this.applyBoundsFaceHighlightToAllGroups();
  }

  /**
   * Returns the face currently highlighted for hover.
   *
   * @returns Highlighted face, or null.
   */
  getHighlightedBoundsFace(): BoundsFace | null {
    return this.boundsGizmo.getHighlightedFace();
  }

  /**
   * Returns whether the active bounds face highlight is resize or body-move.
   *
   * @returns Highlight mode (defaults to resize when nothing is highlighted).
   */
  getHighlightedBoundsFaceMode(): BoundsFaceHighlightMode {
    return this.boundsGizmo.getHighlightMode();
  }

  /** Re-applies face highlight materials on master and every viewport clone. */
  private applyBoundsFaceHighlightToAllGroups(): void {
    this.boundsGizmo.applyHighlightToRoot(this.handleGroup, true);
    this.viewportGroups.forEach((group, index) => {
      const allowMoveHighlight = (this.viewportPlanes[index] ?? 'xyz') === 'xyz';
      this.boundsGizmo.applyHighlightToRoot(group, allowMoveHighlight);
    });
  }

  /**
   * Shows or hides the gizmo in all viewports.
   *
   * @param visible Whether the gizmo should be visible.
   */
  setVisible(visible: boolean): void {
    this.gizmoVisible = visible;
    this.handleGroup.visible = visible;
    this.viewportGroups.forEach((group) => {
      setGizmoWantedVisible(group, visible);
    });
  }

  /**
   * Returns whether the transform gizmo is enabled for the active tool.
   *
   * @returns True when clones should show during their viewport pass.
   */
  isVisible(): boolean {
    return this.gizmoVisible;
  }

  /**
   * Scales the master handle group only. Viewport clones must use
   * {@link prepareTransformCloneForCamera} with their own camera so multi-view
   * 2D panes do not inherit the 3D camera's distance scale.
   *
   * @param camera Camera used for the master group estimate.
   * @param targetScale Multiplier applied after distance/frustum compensation.
   */
  updateScaleForCamera(camera: THREE.Camera, targetScale: number = 1): void {
    if (this.currentMode === TransformMode.BOUNDS) return;
    const scale = computeGizmoCameraScale(camera, this.handleGroup.position) * targetScale;
    this.handleGroup.scale.setScalar(scale);
  }

  /** Disposes all gizmo resources including viewport group clones. */
  dispose(): void {
    this.translateGizmo.dispose();
    this.rotateGizmo.dispose();
    this.scaleGizmo.dispose();
    this.boundsGizmo.dispose();
    this.disposeGroup(this.handleGroup);
    this.viewportGroups.forEach((group) => this.disposeGroup(group));
    this.viewportGroups = [];
    this.viewportPlanes = [];
    this.currentHandles = [];
    this.activeHandle = null;
  }

  /**
   * Disposes the geometry and materials of all meshes in a group.
   *
   * @param group The group whose meshes should be disposed.
   */
  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.disposeMeshResources(child);
      }
    });
  }

  /**
   * Disposes the geometry and material of a single mesh.
   *
   * @param mesh The mesh to dispose.
   */
  private disposeMeshResources(mesh: THREE.Mesh): void {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  }

  /**
   * Clears the master group and rebuilds handles once, then mirrors into
   * clones.
   *
   * @param mode The mode to build handles for.
   */
  private buildHandlesForMode(mode: TransformMode): void {
    this.clearGroup();
    this.populateMasterGroup(mode);
    this.syncMasterTransformToClones();
  }

  /** Removes all children from the handle group. */
  private clearGroup(): void {
    while (this.handleGroup.children.length > 0) {
      const child = this.handleGroup.children[0]!;
      this.handleGroup.remove(child);
    }
    this.currentHandles = [];
  }

  /**
   * Removes all children from a viewport-specific group clone.
   *
   * @param group The viewport group to clear.
   */
  private clearViewportGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0]!;
      group.remove(child);
    }
  }

  /**
   * Creates handles once and populates the master group.
   *
   * @param mode The transform mode to populate for.
   */
  private populateMasterGroup(mode: TransformMode): void {
    if (mode === TransformMode.TRANSLATE) {
      this.attachModeGizmo(this.translateGizmo);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.attachModeGizmo(this.rotateGizmo);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.attachModeGizmo(this.scaleGizmo);
      return;
    }
    if (mode === TransformMode.BOUNDS) {
      this.attachModeGizmo(this.boundsGizmo);
    }
  }

  /**
   * Creates handles for a mode builder and adds its scene objects to the master
   * group.
   *
   * @param modeGizmo Mode-specific gizmo that can create handles and list
   *   objects.
   */
  private attachModeGizmo(modeGizmo: { createHandles(): GizmoHandle[]; getAllSceneObjects(): THREE.Object3D[] }): void {
    this.currentHandles = modeGizmo.createHandles();
    modeGizmo.getAllSceneObjects().forEach((obj) => {
      this.handleGroup.add(obj);
    });
  }

  /**
   * Clones master group children into a viewport group, preserving handleIds.
   *
   * @param group The viewport group to populate.
   */
  private copyMasterIntoGroup(group: THREE.Group): void {
    this.handleGroup.children.forEach((child) => {
      const cloned = child.clone(true);
      group.add(cloned);
    });
    group.position.copy(this.handleGroup.position);
    group.quaternion.copy(this.handleGroup.quaternion);
    group.scale.copy(this.handleGroup.scale);
    setGizmoWantedVisible(group, this.gizmoVisible);
  }

  /**
   * Builds a new viewport group by cloning the current master contents.
   *
   * @returns A new group ready for a viewport scene.
   */
  private cloneHandleGroupContents(): THREE.Group {
    const clone = new THREE.Group();
    clone.name = 'transform_gizmo_viewport';
    this.copyMasterIntoGroup(clone);
    return clone;
  }

  /** Copies master world pose into all viewport clones after bounds update. */
  private syncMasterTransformToClones(): void {
    this.viewportGroups.forEach((group, index) => {
      this.clearViewportGroup(group);
      this.copyMasterIntoGroup(group);
      const viewPlane = this.viewportPlanes[index] ?? 'xyz';
      this.applyViewPlaneFilters(group, viewPlane);
      this.boundsGizmo.applyHighlightToRoot(group, viewPlane === 'xyz');
    });
  }

  /** Re-applies depth-axis visibility on every viewport clone. */
  private refreshViewPlaneAxisFilters(): void {
    this.viewportGroups.forEach((group, index) => {
      this.applyAxisVisibilityForViewPlane(group, this.viewportPlanes[index] ?? 'xyz');
    });
  }

  /**
   * Builds a quantized signature for bounds pose so unchanged selection pose
   * does not rebuild (and deep-clone) the bounds gizmo. Camera-dependent handle
   * sizes are intentionally excluded: screen-space sizing is applied each frame
   * by {@link prepareBoundsCloneForCamera} without rebuilding the hierarchy.
   *
   * @param bounds Oriented bounds, or null when empty.
   * @returns Stable string key for the current pose.
   */
  private buildBoundsPoseSignature(bounds: OrientedBoundsData | null): string {
    const guides = this.boundsGizmo.areGuideLinesVisible() ? '1' : '0';
    const grips = this.boundsGizmo.areResizeHandlesVisible() ? '1' : '0';
    if (!bounds) return `empty|${guides}|${grips}`;
    const quantizePose = (value: number): string => (Math.round(value * 10000) / 10000).toFixed(4);
    const c = bounds.center;
    const e = bounds.halfExtents;
    const r = bounds.quaternion;
    return [
      guides,
      grips,
      quantizePose(c.x),
      quantizePose(c.y),
      quantizePose(c.z),
      quantizePose(e.x),
      quantizePose(e.y),
      quantizePose(e.z),
      quantizePose(r.x),
      quantizePose(r.y),
      quantizePose(r.z),
      quantizePose(r.w),
    ].join('|');
  }

  /**
   * Applies per-viewport handle filters: bounds CAD ears, and Global-space
   * depth-axis hiding for translate/scale.
   *
   * @param group Viewport gizmo clone.
   * @param viewPlane View plane for this clone.
   */
  private applyViewPlaneFilters(group: THREE.Group, viewPlane: CadViewPlane): void {
    if (this.currentMode === TransformMode.BOUNDS) {
      this.boundsGizmo.styleCloneForViewPlane(group, viewPlane);
      return;
    }
    this.applyAxisVisibilityForViewPlane(group, viewPlane);
  }

  /**
   * Shows or hides translate/scale axis meshes for an orthographic depth axis
   * when Global space is active. Local space and rotate mode leave all
   * visible.
   *
   * @param group Viewport gizmo clone.
   * @param viewPlane View plane for this clone.
   */
  private applyAxisVisibilityForViewPlane(group: THREE.Group, viewPlane: CadViewPlane): void {
    if (this.currentMode !== TransformMode.TRANSLATE && this.currentMode !== TransformMode.SCALE) {
      return;
    }
    const hideOccludedGhosts = viewPlane !== 'xyz';
    const presentedViewPlane = profileViewPlane(viewPlane, this.coordinateAdapter);
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const handleId = child.userData['handleId'];
      if (typeof handleId !== 'number') return;
      const handle = this.findHandleById(handleId);
      if (!handle) return;
      if (isGizmoAxisHiddenInViewPlane(handle.getAxis(), presentedViewPlane, this.hideOrthoDepthAxes)) {
        child.visible = false;
        return;
      }
      if (hideOccludedGhosts && child.userData['isGizmoOccludedGhost'] === true) {
        child.visible = false;
        return;
      }
      child.visible = true;
    });
  }

  /**
   * Finds a master handle by stable handle id.
   *
   * @param handleId Handle id stored on clone meshes.
   * @returns Matching handle, or null.
   */
  private findHandleById(handleId: number): GizmoHandle | null {
    return this.currentHandles.find((handle) => handle.getHandleId() === handleId) ?? null;
  }

  /** Removes the active highlight from any previously active handle. */
  private clearActiveHighlight(): void {
    if (this.activeHandle) {
      this.activeHandle.setHoverColor(false);
    }
  }

  /**
   * Applies the hover/active highlight to a handle.
   *
   * @param handle The handle to highlight.
   */
  private applyActiveHighlight(handle: GizmoHandle): void {
    handle.setHoverColor(true);
  }
}

/**
 * Converts an editor view plane into its profile-axis plane.
 *
 * @param viewPlane Physical editor view plane.
 * @param adapter Active coordinate adapter.
 * @returns Profile-axis plane.
 */
function profileViewPlane(viewPlane: CadViewPlane, adapter: CoordinateSpaceAdapter): CadViewPlane {
  if (viewPlane === 'xyz') return 'xyz';
  const editorAxes = viewPlane.split('') as ['x' | 'y' | 'z', 'x' | 'y' | 'z'];
  const profileAxes = editorAxes.map((axis) => adapter.editorAxisToProfileAxis(axis)).sort();
  return profileAxes.join('') as CadViewPlane;
}
