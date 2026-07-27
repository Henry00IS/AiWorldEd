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
   * Stable signature of the last applied bounds pose used to skip redundant
   * rebuilds.
   */
  private lastBoundsPoseSignature: string;

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
    this.lastBoundsPoseSignature = '';
    this.buildHandlesForMode(this.currentMode);
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
    this.applyViewPlaneBoundsFilter(clone, viewPlane);
    return clone;
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
    const cubePickSize = computeBoundsCubeWorldSize(bounds, camera);
    const cubeVisualSize = computeBoundsCubeVisualWorldSize(bounds, camera);
    const earSize = computeBoundsEarWorldSize(bounds);
    const poseSignature = this.buildBoundsPoseSignature(bounds, cubePickSize, earSize, cubeVisualSize);
    if (poseSignature === this.lastBoundsPoseSignature) {
      return;
    }
    this.lastBoundsPoseSignature = poseSignature;
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
   * Scales gizmo groups so handles stay readable at camera distance. No-op in
   * Bounds mode where size comes from the selection OBB.
   *
   * @param camera The active camera used to estimate distance.
   * @param targetScale Multiplier applied after distance compensation.
   */
  updateScaleForCamera(camera: THREE.Camera, targetScale: number = 1): void {
    if (this.currentMode === TransformMode.BOUNDS) return;
    const distance = camera.position.distanceTo(this.handleGroup.position);
    const scale = Math.max(0.5, distance * 0.08) * targetScale;
    this.handleGroup.scale.setScalar(scale);
    this.viewportGroups.forEach((group) => {
      group.scale.setScalar(scale);
    });
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
      this.currentHandles = this.translateGizmo.createHandles();
      this.translateGizmo.getAllSceneObjects().forEach((obj) => {
        this.handleGroup.add(obj);
      });
    }
    if (mode === TransformMode.ROTATE) {
      this.currentHandles = this.rotateGizmo.createHandles();
      this.rotateGizmo.getAllSceneObjects().forEach((obj) => {
        this.handleGroup.add(obj);
      });
    }
    if (mode === TransformMode.SCALE) {
      this.currentHandles = this.scaleGizmo.createHandles();
      this.scaleGizmo.getAllSceneObjects().forEach((obj) => {
        this.handleGroup.add(obj);
      });
    }
    if (mode === TransformMode.BOUNDS) {
      this.currentHandles = this.boundsGizmo.createHandles();
      this.boundsGizmo.getAllSceneObjects().forEach((obj) => {
        this.handleGroup.add(obj);
      });
    }
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
      this.applyViewPlaneBoundsFilter(group, viewPlane);
      this.boundsGizmo.applyHighlightToRoot(group, viewPlane === 'xyz');
    });
  }

  /**
   * Builds a quantized signature for bounds pose so pointer jitter with an
   * unchanged snapped selection does not rebuild the bounds gizmo.
   *
   * @param bounds Oriented bounds, or null when empty.
   * @param cubeSize Perspective cube world edge length.
   * @param earSize Orthographic ear base size.
   * @returns Stable string key for the current pose.
   */
  private buildBoundsPoseSignature(
    bounds: OrientedBoundsData | null,
    cubePickSize: number,
    earSize: number,
    cubeVisualSize: number,
  ): string {
    const guides = this.boundsGizmo.areGuideLinesVisible() ? '1' : '0';
    if (!bounds) return `empty|${guides}`;
    const quantizeHandleSize = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);
    const quantizePose = (value: number): string => (Math.round(value * 10000) / 10000).toFixed(4);
    const c = bounds.center;
    const e = bounds.halfExtents;
    const r = bounds.quaternion;
    return [
      guides,
      quantizeHandleSize(cubePickSize),
      quantizeHandleSize(cubeVisualSize),
      quantizePose(earSize),
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
   * Applies bounds-specific styling per viewport: arrows in 3D, CAD ears in 2D
   * with depth-axis grips hidden.
   *
   * @param group Viewport gizmo clone.
   * @param viewPlane View plane for this clone.
   */
  private applyViewPlaneBoundsFilter(group: THREE.Group, viewPlane: CadViewPlane): void {
    if (this.currentMode !== TransformMode.BOUNDS) return;
    this.boundsGizmo.styleCloneForViewPlane(group, viewPlane);
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
