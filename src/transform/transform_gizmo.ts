import * as THREE from 'three';
import { Theme } from '../theme.js';
import { TransformMode } from '../types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { TranslateGizmo } from './translate_gizmo.js';
import { RotateGizmo } from './rotate_gizmo.js';
import { ScaleGizmo } from './scale_gizmo.js';
import { BoundsGizmo } from './bounds_gizmo.js';
import { OrientedBoundsBuilder, OrientedBoundsData } from './oriented_bounds.js';

/**
 * Main orchestrator for the transform gizmo.
 * Manages mode switching, handle creation, and active state.
 * Builds handles once on the master group, then clones into each viewport group
 * so handleIds stay consistent across all viewports.
 */
export class TransformGizmo {
  private theme: typeof Theme;
  private currentMode: TransformMode;
  private handleGroup: THREE.Group;
  private viewportGroups: THREE.Group[];
  private currentHandles: GizmoHandle[];
  private activeHandle: GizmoHandle | null;
  private translateGizmo: TranslateGizmo;
  private rotateGizmo: RotateGizmo;
  private scaleGizmo: ScaleGizmo;
  private boundsGizmo: BoundsGizmo;
  private boundsBuilder: OrientedBoundsBuilder;
  private gizmoVisible: boolean;

  /**
   * Creates a new transform gizmo.
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    this.theme = theme;
    this.currentMode = TransformMode.BOUNDS;
    this.handleGroup = new THREE.Group();
    this.handleGroup.name = 'transform_gizmo';
    this.viewportGroups = [];
    this.currentHandles = [];
    this.activeHandle = null;
    this.translateGizmo = new TranslateGizmo(theme);
    this.rotateGizmo = new RotateGizmo(theme);
    this.scaleGizmo = new ScaleGizmo(theme);
    this.boundsGizmo = new BoundsGizmo(theme);
    this.boundsBuilder = new OrientedBoundsBuilder();
    this.gizmoVisible = false;
    this.handleGroup.visible = false;
    this.buildHandlesForMode(this.currentMode);
  }

  /**
   * Sets the transform mode and rebuilds handles.
   * @param mode The new transform mode.
   */
  setMode(mode: TransformMode): void {
    this.currentMode = mode;
    this.activeHandle = null;
    this.resetHandleGroupTransform();
    this.buildHandlesForMode(mode);
  }

  /**
   * Resets master and viewport gizmo group transforms to identity.
   * Prevents leftover pivot scale from other modes from skewing Bounds.
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
   * @returns The active TransformMode enum value.
   */
  getMode(): TransformMode {
    return this.currentMode;
  }

  /**
   * Returns the Three.js group containing all gizmo handles.
   * @returns The handle group to add to a viewport scene.
   */
  getHandleGroup(): THREE.Group {
    return this.handleGroup;
  }

  /**
   * Creates a fresh clone of the handle group for a specific viewport.
   * Each viewport must have its own group to avoid Three.js parent conflicts.
   * @returns A new Three.js group with cloned gizmo children.
   */
  getHandleGroupClone(): THREE.Group {
    const clone = this.cloneHandleGroupContents();
    this.viewportGroups.push(clone);
    clone.visible = this.gizmoVisible;
    return clone;
  }

  /**
   * Returns the current array of gizmo handles.
   * @returns All active GizmoHandle instances.
   */
  getHandles(): GizmoHandle[] {
    return this.currentHandles;
  }

  /**
   * Sets which handle is currently active (being dragged).
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
   * @param handle The handle to check.
   * @returns True if the handle is active.
   */
  isHandleActive(handle: GizmoHandle): boolean {
    return this.activeHandle === handle;
  }

  /**
   * Returns the currently active handle.
   * @returns The active handle, or null.
   */
  getActiveHandle(): GizmoHandle | null {
    return this.activeHandle;
  }

  /**
   * Updates the gizmo pivot position on the master group and all clones.
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
   * Rebuilds Bounds gizmo pose from the current selection.
   * @param meshes Selected meshes defining the OBB.
   * @param camera Optional camera used to size resize handles.
   */
  updateBoundsFromMeshes(
    meshes: THREE.Mesh[],
    camera: THREE.Camera | null = null
  ): void {
    if (this.currentMode !== TransformMode.BOUNDS) return;
    this.resetHandleGroupTransform();
    const bounds = this.boundsBuilder.buildFromMeshes(meshes);
    const handleSize = this.computeBoundsHandleSize(bounds, camera);
    this.boundsGizmo.updateFromBounds(bounds, handleSize);
    this.syncMasterTransformToClones();
  }

  /**
   * Returns the current oriented bounds shown by the Bounds gizmo.
   * @returns Bounds data, or null.
   */
  getCurrentBounds(): OrientedBoundsData | null {
    return this.boundsGizmo.getCurrentBounds();
  }

  /**
   * Shows or hides bounds corner guide lines in all viewports.
   * @param visible Whether the guide lines should be drawn.
   */
  setBoundsGuideLinesVisible(visible: boolean): void {
    this.boundsGizmo.setGuideLinesVisible(visible);
    this.syncMasterTransformToClones();
  }

  /**
   * Shows or hides the gizmo in all viewports.
   * @param visible Whether the gizmo should be visible.
   */
  setVisible(visible: boolean): void {
    this.gizmoVisible = visible;
    this.handleGroup.visible = visible;
    this.viewportGroups.forEach((group) => {
      group.visible = visible;
    });
  }

  /**
   * Scales gizmo groups so handles stay readable at camera distance.
   * No-op in Bounds mode where size comes from the selection OBB.
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

  /**
   * Disposes all gizmo resources including viewport group clones.
   */
  dispose(): void {
    this.translateGizmo.dispose();
    this.rotateGizmo.dispose();
    this.scaleGizmo.dispose();
    this.boundsGizmo.dispose();
    this.disposeGroup(this.handleGroup);
    this.viewportGroups.forEach((group) => this.disposeGroup(group));
    this.viewportGroups = [];
    this.currentHandles = [];
    this.activeHandle = null;
  }

  /**
   * Disposes the geometry and materials of all meshes in a group.
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
   * Clears the master group and rebuilds handles once, then mirrors into clones.
   * @param mode The mode to build handles for.
   */
  private buildHandlesForMode(mode: TransformMode): void {
    this.clearGroup();
    this.populateMasterGroup(mode);
    this.viewportGroups.forEach((group) => {
      this.clearViewportGroup(group);
      this.copyMasterIntoGroup(group);
    });
  }

  /**
   * Removes all children from the handle group.
   */
  private clearGroup(): void {
    while (this.handleGroup.children.length > 0) {
      const child = this.handleGroup.children[0];
      this.handleGroup.remove(child);
    }
    this.currentHandles = [];
  }

  /**
   * Removes all children from a viewport-specific group clone.
   * @param group The viewport group to clear.
   */
  private clearViewportGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
  }

  /**
   * Creates handles once and populates the master group.
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
    group.visible = this.gizmoVisible;
  }

  /**
   * Builds a new viewport group by cloning the current master contents.
   * @returns A new group ready for a viewport scene.
   */
  private cloneHandleGroupContents(): THREE.Group {
    const clone = new THREE.Group();
    clone.name = 'transform_gizmo_viewport';
    this.copyMasterIntoGroup(clone);
    return clone;
  }

  /**
   * Copies master world pose into all viewport clones after bounds update.
   */
  private syncMasterTransformToClones(): void {
    this.viewportGroups.forEach((group) => {
      this.clearViewportGroup(group);
      this.copyMasterIntoGroup(group);
    });
  }

  /**
   * Chooses a handle cube size from the selection OBB only.
   * Camera distance is intentionally ignored: one shared bounds gizmo is
   * mirrored into every viewport, so 3D-camera scaling would inflate handles
   * in orthographic 2D views when the perspective camera is far away.
   * @param bounds Current OBB, or null.
   * @param _camera Unused; kept for call-site compatibility.
   * @returns World-space handle size.
   */
  private computeBoundsHandleSize(
    bounds: OrientedBoundsData | null,
    _camera: THREE.Camera | null
  ): number {
    const minHalf = bounds
      ? Math.min(bounds.halfExtents.x, bounds.halfExtents.y, bounds.halfExtents.z)
      : 0.5;
    const size = Math.max(0.08, minHalf * 0.18);
    return Math.min(size, 0.45);
  }

  /**
   * Removes the active highlight from any previously active handle.
   */
  private clearActiveHighlight(): void {
    if (this.activeHandle) {
      this.activeHandle.setHoverColor(false);
    }
  }

  /**
   * Applies the hover/active highlight to a handle.
   * @param handle The handle to highlight.
   */
  private applyActiveHighlight(handle: GizmoHandle): void {
    handle.setHoverColor(true);
  }
}
