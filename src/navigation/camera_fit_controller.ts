import * as THREE from 'three';
import { BoundingVolumeComputer } from './bounding_volume_computer.js';
import { CameraFramer } from './camera_framer.js';
import { PerspectiveCameraAnimator } from './perspective_camera_animator.js';
import { OrthographicCameraAnimator } from './orthographic_camera_animator.js';
import { CameraAnimationConfig } from './camera_animation_config.js';

/**
 * Base class for both 3D and 2D viewport types used by the fit controller.
 * Provides access to the camera for fit operations.
 */
export interface FitViewport {
  getCamera(): THREE.Camera;
}

/**
 * Orchestrates camera fit-to-selection across multiple viewports.
 * Computes bounding volumes, frames, and delegates to appropriate animators.
 */
export class CameraFitController {
  private boundingVolumeComputer: BoundingVolumeComputer;
  private cameraFramer: CameraFramer;
  private perspectiveAnimator: PerspectiveCameraAnimator;
  private activeOrthographicAnimations: OrthographicCameraAnimator[];
  private config: CameraAnimationConfig;

  /**
   * Creates a new camera fit controller with default configuration.
   */
  constructor() {
    this.boundingVolumeComputer = new BoundingVolumeComputer();
    this.cameraFramer = new CameraFramer();
    this.perspectiveAnimator = new PerspectiveCameraAnimator();
    this.activeOrthographicAnimations = [];
    this.config = new CameraAnimationConfig();
  }

  /**
   * Returns the shared animation configuration instance.
   * @returns The CameraAnimationConfig used by this controller.
   */
  getConfig(): CameraAnimationConfig {
    return this.config;
  }

  /**
   * Fits a single viewport camera to frame the given meshes.
   * Falls back to all objects in the scene if the mesh array is empty.
   * @param viewport The viewport whose camera should be fitted.
   * @param meshes The meshes to frame, or empty array for scene fallback.
   * @param config The animation configuration to use.
   * @returns The count of objects that were framed.
   */
  fitViewportToSelection(
    viewport: FitViewport,
    meshes: THREE.Mesh[],
    config: CameraAnimationConfig
  ): number {
    this.config = config;
    const targetMeshes = this.resolveTargetMeshes(viewport, meshes);
    const camera = viewport.getCamera();
    if (camera instanceof THREE.PerspectiveCamera) {
      this.fitPerspectiveViewport(camera, targetMeshes);
    }
    if (camera instanceof THREE.OrthographicCamera) {
      this.fitOrthographicViewport(camera, targetMeshes);
    }
    return targetMeshes.length;
  }

  /**
   * Fits all viewports to frame the same set of meshes.
   * @param viewports The viewports whose cameras should be fitted.
   * @param meshes The meshes to frame, or empty array for scene fallback.
   * @param config The animation configuration to use.
   * @returns The total count of objects framed across all viewports.
   */
  fitAllViewportsToSelection(
    viewports: FitViewport[],
    meshes: THREE.Mesh[],
    config: CameraAnimationConfig
  ): number {
    this.config = config;
    let totalCount = 0;
    viewports.forEach((viewport) => {
      const count = this.fitViewportToSelection(viewport, meshes, config);
      totalCount = Math.max(totalCount, count);
    });
    return totalCount;
  }

  /**
   * Advances all active camera animations by one frame.
   * Must be called from the render loop.
   */
  updateAnimations(): void {
    this.perspectiveAnimator.update();
    this.updateOrthographicAnimations();
  }

  /**
   * Resolves the target meshes to frame. Falls back to all objects
   * in the viewport's scene when no meshes are provided.
   * @param viewport The viewport to query for scene objects.
   * @param meshes The provided mesh array.
   * @returns The resolved mesh array to frame.
   */
  private resolveTargetMeshes(
    viewport: FitViewport,
    meshes: THREE.Mesh[]
  ): THREE.Mesh[] {
    if (meshes.length > 0) return meshes;
    return this.collectAllMeshesFromScene(viewport);
  }

  /**
   * Collects all mesh objects from the viewport's scene.
   * @param viewport The viewport whose scene to traverse.
   * @returns An array of all meshes found in the scene.
   */
  private collectAllMeshesFromScene(viewport: FitViewport): THREE.Mesh[] {
    const baseViewport = viewport as unknown as { getScene(): THREE.Scene };
    if (typeof baseViewport.getScene !== 'function') return [];
    const scene = baseViewport.getScene();
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Fits a perspective camera to frame the given meshes.
   * @param camera The perspective camera to animate.
   * @param meshes The meshes to frame.
   */
  private fitPerspectiveViewport(
    camera: THREE.PerspectiveCamera,
    meshes: THREE.Mesh[]
  ): void {
    if (meshes.length === 0) return;
    const boundingBox = this.boundingVolumeComputer.computeWorldBoundingBox(meshes);
    const boundingSphere = this.boundingVolumeComputer.computeBoundingSphere(boundingBox);
    const padding = this.config.getPaddingFactor();
    const target = this.cameraFramer.computePerspectiveTarget(
      boundingSphere, camera, padding
    );
    this.perspectiveAnimator.animateToTarget(
      camera,
      target.targetPosition,
      target.targetLookAt,
      this.config
    );
  }

  /**
   * Fits an orthographic camera to frame the given meshes.
   * @param camera The orthographic camera to animate.
   * @param meshes The meshes to frame.
   */
  private fitOrthographicViewport(
    camera: THREE.OrthographicCamera,
    meshes: THREE.Mesh[]
  ): void {
    if (meshes.length === 0) return;
    const boundingBox = this.boundingVolumeComputer.computeWorldBoundingBox(meshes);
    const padding = this.config.getPaddingFactor();
    const target = this.cameraFramer.computeOrthographicTarget(
      boundingBox, camera, padding
    );
    const animator = this.createOrthographicAnimator();
    animator.animateToFrustum(camera, target, this.config);
    this.activeOrthographicAnimations.push(animator);
  }

  /**
   * Creates a fresh orthographic camera animator instance.
   * @returns A new OrthographicCameraAnimator.
   */
  private createOrthographicAnimator(): OrthographicCameraAnimator {
    return new OrthographicCameraAnimator();
  }

  /**
   * Advances all active orthographic animations and removes completed ones.
   */
  private updateOrthographicAnimations(): void {
    const completed: OrthographicCameraAnimator[] = [];
    this.activeOrthographicAnimations.forEach((animator) => {
      const stillRunning = animator.update();
      if (!stillRunning) {
        completed.push(animator);
      }
    });
    completed.forEach((animator) => {
      const index = this.activeOrthographicAnimations.indexOf(animator);
      if (index !== -1) {
        this.activeOrthographicAnimations.splice(index, 1);
      }
    });
  }
}
