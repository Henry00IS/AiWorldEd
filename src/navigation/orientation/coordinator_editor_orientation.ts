import * as THREE from 'three';
import { CameraAnimationConfig } from '@/navigation/camera/camera_animation_config.js';
import { EditorOrientation } from './editor_orientation.js';
import { EditorOrientationAnimator } from './editor_orientation_animator.js';
import type { EditorOrientationAxisId } from './editor_orientation_axis.js';
import {
  buildEdgeAlignedOrientation,
  type EditorOrientationEdgeAlignOutcome,
} from './editor_orientation_edge_align.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import type { Viewport2D } from '@/viewports/core/viewport_2d.js';

/** Dependencies for coordinating grid and camera orientations. */
export interface CoordinatorEditorOrientationDependencies {
  getViewports: () => readonly ViewportEditor[];
  showStatusMessage: (message: string) => void;
}

/**
 * Owns independent grid and camera working orientations. Grid changes update
 * the visual/snap plane only. Camera changes reorient perspective cameras and
 * the flying frame without moving the grid.
 */
export class CoordinatorEditorOrientation {
  private readonly gridOrientation: EditorOrientation;
  private readonly cameraOrientation: EditorOrientation;
  private readonly cameraAnimator: EditorOrientationAnimator;
  private readonly animationConfig: CameraAnimationConfig;
  private readonly deps: CoordinatorEditorOrientationDependencies;
  private readonly unsubscribeGrid: () => void;

  /**
   * Creates an orientation coordinator with identity grid and camera frames.
   *
   * @param deps Viewport and status callbacks.
   */
  constructor(deps: CoordinatorEditorOrientationDependencies) {
    this.deps = deps;
    this.gridOrientation = new EditorOrientation();
    this.cameraOrientation = new EditorOrientation();
    this.cameraAnimator = new EditorOrientationAnimator(this.cameraOrientation);
    this.animationConfig = new CameraAnimationConfig();
    this.unsubscribeGrid = this.gridOrientation.subscribe(() => {
      this.applyGridOrientationToViewports();
    });
  }

  /**
   * Returns the grid orientation store.
   *
   * @returns Grid orientation instance.
   */
  getGridOrientation(): EditorOrientation {
    return this.gridOrientation;
  }

  /**
   * Returns the camera orientation store.
   *
   * @returns Camera orientation instance.
   */
  getCameraOrientation(): EditorOrientation {
    return this.cameraOrientation;
  }

  /**
   * Returns the camera orientation store.
   *
   * @returns Camera orientation instance.
   */
  getEditorOrientation(): EditorOrientation {
    return this.cameraOrientation;
  }

  /** Binds camera orientation and current grid plane to live perspective panes. */
  bindViewports(): void {
    this.forEachPerspectiveViewport((viewport) => {
      viewport.setEditorOrientation(this.cameraOrientation);
      viewport.setGridOrientationStore?.(this.gridOrientation);
    });
    this.applyGridOrientationToViewports();
  }

  /**
   * Aligns only the grid so a face normal becomes working up / floor.
   *
   * @param faceNormal Outward face normal in world space.
   * @param pivotPoint Hit point used as plane origin.
   */
  alignGridToFace(faceNormal: THREE.Vector3, pivotPoint: THREE.Vector3): void {
    this.bindViewports();
    this.gridOrientation.setFromFaceNormal(faceNormal, pivotPoint);
    this.deps.showStatusMessage('Grid aligned to face');
  }

  /** Resets only the grid orientation and visual floor to world defaults. */
  resetGridToDefault(): void {
    this.bindViewports();
    this.gridOrientation.resetToDefault();
    this.deps.showStatusMessage('Grid orientation reset');
  }

  /**
   * Sets the grid snap/visual lattice origin without changing axes.
   *
   * @param worldOrigin World position that becomes lattice (0, 0, 0).
   */
  setGridOrigin(worldOrigin: THREE.Vector3): void {
    this.bindViewports();
    this.gridOrientation.setPlaneOrigin(worldOrigin);
    this.deps.showStatusMessage('Grid origin set to vertex');
  }

  /**
   * Aligns one grid working axis to an edge without changing the camera.
   *
   * @param axis Working-frame axis to assign from the edge.
   * @param edgeDirection Edge direction in world space.
   * @param planeOrigin Lattice origin (typically the edge endpoint nearest the
   *   pointer — implicit Zero Origin).
   * @param cameraLookDirection Active camera look direction for sign choice.
   * @returns True when the grid orientation was updated.
   */
  alignGridAxisToEdge(
    axis: EditorOrientationAxisId,
    edgeDirection: THREE.Vector3,
    planeOrigin: THREE.Vector3,
    cameraLookDirection: THREE.Vector3,
  ): boolean {
    const outcome = this.computeEdgeAlign(axis, edgeDirection, planeOrigin, cameraLookDirection);
    if (!outcome.ok) {
      this.reportEdgeAlignFailure(outcome.reason);
      return false;
    }
    this.bindViewports();
    this.gridOrientation.setOrientationAndFrame(outcome.quaternion, outcome.planeFrame);
    this.deps.showStatusMessage(this.gridEdgeAlignStatusMessage(axis));
    return true;
  }

  /**
   * Previews a grid edge-align without committing.
   *
   * @param axis Working-frame axis to assign from the edge.
   * @param edgeDirection Edge direction in world space.
   * @param planeOrigin Lattice origin for the preview frame.
   * @param cameraLookDirection Active camera look direction for sign choice.
   * @returns Align outcome for preview rendering.
   */
  previewGridAxisToEdge(
    axis: EditorOrientationAxisId,
    edgeDirection: THREE.Vector3,
    planeOrigin: THREE.Vector3,
    cameraLookDirection: THREE.Vector3,
  ): EditorOrientationEdgeAlignOutcome {
    return this.computeEdgeAlign(axis, edgeDirection, planeOrigin, cameraLookDirection);
  }

  /**
   * Aligns only the camera so a face normal becomes camera working up.
   *
   * @param faceNormal Outward face normal in world space.
   * @param pivotPoint World point used as the plane origin for the target
   *   frame.
   */
  alignCameraToFace(faceNormal: THREE.Vector3, pivotPoint: THREE.Vector3): void {
    this.bindViewports();
    const cameras = this.collectPerspectiveCameras();
    this.cameraAnimator.animateAlignToFace(faceNormal, pivotPoint, cameras, this.animationConfig, () =>
      this.onCameraAnimationComplete('Camera aligned to face'),
    );
  }

  /** Resets only camera orientation and reorients perspective cameras. */
  resetCameraToDefault(): void {
    this.bindViewports();
    const cameras = this.collectPerspectiveCameras();
    this.cameraAnimator.animateResetToDefault(cameras, this.animationConfig, () =>
      this.onCameraAnimationComplete('Camera orientation reset'),
    );
  }

  /**
   * Aligns the grid so a face normal becomes working up / floor.
   *
   * @param faceNormal Outward face normal in world space.
   * @param pivotPoint Hit point used as plane origin.
   */
  alignToFace(faceNormal: THREE.Vector3, pivotPoint: THREE.Vector3): void {
    this.alignGridToFace(faceNormal, pivotPoint);
  }

  /** Resets the grid orientation and visual floor to world defaults. */
  resetToDefault(): void {
    this.resetGridToDefault();
  }

  /** Advances active camera reorientation animations by one frame. */
  updateAnimations(): void {
    this.cameraAnimator.update();
  }

  /**
   * Returns whether a camera reorientation animation is running.
   *
   * @returns True while animating.
   */
  isAnimating(): boolean {
    return this.cameraAnimator.isAnimating();
  }

  /** Releases orientation listeners. */
  dispose(): void {
    this.unsubscribeGrid();
    if (this.cameraAnimator.isAnimating()) {
      this.cameraAnimator.cancel();
    }
  }

  /**
   * Computes edge-align from the current grid basis.
   *
   * @param axis Axis to assign.
   * @param edgeDirection Edge direction.
   * @param planeOrigin Plane origin.
   * @param cameraLookDirection Camera look.
   * @returns Align outcome.
   */
  private computeEdgeAlign(
    axis: EditorOrientationAxisId,
    edgeDirection: THREE.Vector3,
    planeOrigin: THREE.Vector3,
    cameraLookDirection: THREE.Vector3,
  ): EditorOrientationEdgeAlignOutcome {
    return buildEdgeAlignedOrientation(
      axis,
      edgeDirection,
      this.gridOrientation.getWorldBasis(),
      cameraLookDirection,
      planeOrigin,
    );
  }

  /**
   * Reports why an edge align was rejected.
   *
   * @param reason Failure reason.
   */
  private reportEdgeAlignFailure(reason: 'degenerate_edge'): void {
    void reason;
    this.deps.showStatusMessage('Edge too short to align');
  }

  /**
   * Builds a status message for a successful grid edge align.
   *
   * @param axis Aligned axis.
   * @returns Status text.
   */
  private gridEdgeAlignStatusMessage(axis: EditorOrientationAxisId): string {
    if (axis === 'x') {
      return 'Grid X aligned to edge';
    }
    if (axis === 'y') {
      return 'Grid Y aligned to edge';
    }
    return 'Grid Z aligned to edge';
  }

  /**
   * Syncs flying camera orientations and shows a status message.
   *
   * @param message Status bar message.
   */
  private onCameraAnimationComplete(message: string): void {
    this.syncFlyingCameras();
    this.deps.showStatusMessage(message);
  }

  /**
   * Pushes grid orientation onto perspective floors and reorients Top / Front /
   * Side orthographic cameras and lattices.
   */
  private applyGridOrientationToViewports(): void {
    this.applyPlaneFrameToPerspectiveGrids();
    this.applyOrientationToOrthographicViewports();
  }

  /** Pushes the current grid plane frame onto every perspective grid. */
  private applyPlaneFrameToPerspectiveGrids(): void {
    const frame = this.gridOrientation.getPlaneFrame();
    this.forEachPerspectiveViewport((viewport) => {
      viewport.setGridPlaneFrame(frame);
    });
  }

  /** Reorients every live orthographic viewport to the working grid frame. */
  private applyOrientationToOrthographicViewports(): void {
    this.deps.getViewports().forEach((viewport) => {
      if (isPerspectiveViewport(viewport)) {
        return;
      }
      if (!this.viewportHasGridOrientationApply(viewport)) {
        return;
      }
      viewport.applyGridOrientation(this.gridOrientation);
    });
  }

  /**
   * Returns whether a viewport can reorient to the working grid frame.
   *
   * @param viewport Live viewport candidate.
   * @returns True for orthographic panes with applyGridOrientation.
   */
  private viewportHasGridOrientationApply(viewport: ViewportEditor): viewport is Viewport2D {
    return typeof (viewport as Viewport2D).applyGridOrientation === 'function' && !isPerspectiveViewport(viewport);
  }

  /** Syncs flying yaw/pitch on each live perspective viewport. */
  private syncFlyingCameras(): void {
    this.forEachPerspectiveViewport((viewport) => {
      viewport.syncFlyingCameraOrientation();
    });
  }

  /**
   * Collects perspective cameras from live viewports.
   *
   * @returns Perspective cameras.
   */
  private collectPerspectiveCameras(): THREE.PerspectiveCamera[] {
    const cameras: THREE.PerspectiveCamera[] = [];
    this.forEachPerspectiveViewport((viewport) => {
      cameras.push(viewport.getCamera());
    });
    return cameras;
  }

  /**
   * Invokes a callback for each live perspective viewport.
   *
   * @param callback Viewport consumer.
   */
  private forEachPerspectiveViewport(
    callback: (viewport: import('@/viewports/core/viewport_3d.js').Viewport3D) => void,
  ): void {
    this.deps.getViewports().forEach((viewport) => {
      if (!isPerspectiveViewport(viewport)) {
        return;
      }
      callback(viewport);
    });
  }
}
