import * as THREE from 'three';
import { BoundingVolumeComputer } from './bounding_volume_computer.js';
import { CameraFramer } from './camera_framer.js';
import { PerspectiveCameraAnimator } from './perspective_camera_animator.js';
import { OrthographicCameraAnimator } from './orthographic_camera_animator.js';
import { CameraAnimationConfig } from './camera_animation_config.js';
import { isEditorHelperObject } from '../utils/mesh_edge_sync.js';

/**
 * Viewport surface used by the fit controller. Prefer world content collectors
 * so editor overlays (gizmos, grids, solid result helpers) never pull framing
 * toward the world origin.
 */
export interface FitViewport {
  getCamera(): THREE.Camera;
  getScene?: () => THREE.Scene;
  collectSelectableObjects?: () => THREE.Mesh[];
  setNavigationFocus?: (focus: THREE.Vector3) => void;
}

/**
 * Orchestrates camera fit-to-selection across multiple viewports. Computes
 * bounding volumes, frames, and delegates to appropriate animators.
 */
export class CameraFitController {
  private boundingVolumeComputer: BoundingVolumeComputer;
  private cameraFramer: CameraFramer;
  private perspectiveAnimator: PerspectiveCameraAnimator;
  private activeOrthographicAnimations: OrthographicCameraAnimator[];
  private config: CameraAnimationConfig;

  /** Creates a new camera fit controller with default configuration. */
  constructor() {
    this.boundingVolumeComputer = new BoundingVolumeComputer();
    this.cameraFramer = new CameraFramer();
    this.perspectiveAnimator = new PerspectiveCameraAnimator();
    this.activeOrthographicAnimations = [];
    this.config = new CameraAnimationConfig();
  }

  /**
   * Returns the shared animation configuration instance.
   *
   * @returns The CameraAnimationConfig used by this controller.
   */
  getConfig(): CameraAnimationConfig {
    return this.config;
  }

  /**
   * Fits a single viewport camera to frame the given meshes. Falls back to
   * world content (not editor overlays) when the mesh array is empty.
   *
   * @param viewport The viewport whose camera should be fitted.
   * @param meshes The meshes to frame, or empty array for content fallback.
   * @param config The animation configuration to use.
   * @returns The count of objects that were framed.
   */
  fitViewportToSelection(viewport: FitViewport, meshes: THREE.Mesh[], config: CameraAnimationConfig): number {
    this.config = config;
    const targetMeshes = this.resolveTargetMeshes(viewport, meshes);
    const camera = viewport.getCamera();
    if (camera instanceof THREE.PerspectiveCamera) {
      this.fitPerspectiveViewport(viewport, camera, targetMeshes);
    }
    if (camera instanceof THREE.OrthographicCamera) {
      this.fitOrthographicViewport(camera, targetMeshes);
    }
    return targetMeshes.length;
  }

  /**
   * Fits all viewports to frame the same set of meshes.
   *
   * @param viewports The viewports whose cameras should be fitted.
   * @param meshes The meshes to frame, or empty array for content fallback.
   * @param config The animation configuration to use.
   * @returns The total count of objects framed across all viewports.
   */
  fitAllViewportsToSelection(viewports: FitViewport[], meshes: THREE.Mesh[], config: CameraAnimationConfig): number {
    this.config = config;
    let totalCount = 0;
    viewports.forEach((viewport) => {
      const count = this.fitViewportToSelection(viewport, meshes, config);
      totalCount = Math.max(totalCount, count);
    });
    return totalCount;
  }

  /**
   * Advances all active camera animations by one frame. Must be called from the
   * render loop.
   */
  updateAnimations(): void {
    this.perspectiveAnimator.update();
    this.updateOrthographicAnimations();
  }

  /**
   * Resolves the target meshes to frame. Empty selection falls back to world
   * content only — solid model roots, CSG result helpers, gizmos, and grids are
   * excluded so framing is not pulled to the world origin.
   *
   * @param viewport The viewport to query for content objects.
   * @param meshes The provided mesh array.
   * @returns The resolved mesh array to frame.
   */
  private resolveTargetMeshes(viewport: FitViewport, meshes: THREE.Mesh[]): THREE.Mesh[] {
    if (meshes.length > 0) return this.filterFittableContentMeshes(meshes);
    return this.collectContentMeshesForFit(viewport);
  }

  /**
   * Collects world content meshes suitable for empty-selection framing.
   *
   * @param viewport The viewport providing content collectors or a scene.
   * @returns Fittable content meshes.
   */
  private collectContentMeshesForFit(viewport: FitViewport): THREE.Mesh[] {
    if (typeof viewport.collectSelectableObjects === 'function') {
      return this.filterFittableContentMeshes(viewport.collectSelectableObjects());
    }
    return this.collectFittableMeshesFromScene(viewport);
  }

  /**
   * Collects fittable content meshes from the viewport scene, ignoring editor
   * overlays that often sit at the world origin.
   *
   * @param viewport The viewport whose scene to traverse.
   * @returns Content meshes only.
   */
  private collectFittableMeshesFromScene(viewport: FitViewport): THREE.Mesh[] {
    if (typeof viewport.getScene !== 'function') return [];
    const meshes: THREE.Mesh[] = [];
    viewport.getScene().traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!this.isFittableContentMesh(child)) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Drops non-content meshes that must never drive camera framing.
   *
   * @param meshes Candidate meshes.
   * @returns Meshes safe to use for fit bounds.
   */
  private filterFittableContentMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => this.isFittableContentMesh(mesh));
  }

  /**
   * Returns whether a mesh should contribute to fit bounds. Excludes editor
   * helpers, solid CSG result meshes, empty geometry, and gizmo/grid overlays.
   *
   * @param mesh Candidate mesh.
   * @returns True when the mesh is world content with usable geometry.
   */
  private isFittableContentMesh(mesh: THREE.Mesh): boolean {
    if (!mesh.visible) return false;
    if (isEditorHelperObject(mesh)) return false;
    if (this.isUnderEditorOverlayRoot(mesh)) return false;
    return this.hasUsableFitGeometry(mesh);
  }

  /**
   * Returns true when the mesh hangs under a gizmo, bounds, or grid root that
   * must not influence framing (often parked at the world origin).
   *
   * @param mesh Candidate mesh.
   * @returns True when an ancestor is an editor overlay root.
   */
  private isUnderEditorOverlayRoot(mesh: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (this.isEditorOverlayRootName(current.name || '')) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Matches known editor overlay root names used in viewport scenes.
   *
   * @param name Object name.
   * @returns True for gizmo/grid/bounds infrastructure roots.
   */
  private isEditorOverlayRootName(name: string): boolean {
    if (name === 'transform_gizmo' || name === 'transform_gizmo_viewport') return true;
    if (name === 'bounds_gizmo' || name === 'grids_root') return true;
    if (name === 'infinite_grid_2d' || name === 'infinite_grid_3d') return true;
    return name.startsWith('transform_gizmo');
  }

  /**
   * Returns true when the mesh has enough position data to produce a real
   * volume, excluding empty CSG result placeholders at the model origin.
   *
   * @param mesh Candidate mesh.
   * @returns True when geometry can drive fit bounds.
   */
  private hasUsableFitGeometry(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry;
    if (!geometry) return false;
    const position = geometry.getAttribute('position');
    return !!position && position.count >= 3;
  }

  /**
   * Fits a perspective camera to frame the given meshes. Uses AABB frustum fit
   * (not a bounding sphere). Leaves the camera near/far clip planes unchanged.
   *
   * @param viewport Viewport receiving the new navigation focus.
   * @param camera The perspective camera to animate.
   * @param meshes The meshes to frame.
   */
  private fitPerspectiveViewport(viewport: FitViewport, camera: THREE.PerspectiveCamera, meshes: THREE.Mesh[]): void {
    if (meshes.length === 0) return;
    const boundingBox = this.boundingVolumeComputer.computeWorldBoundingBox(meshes);
    if (boundingBox.isEmpty()) return;
    const padding = this.config.getPaddingFactor();
    const target = this.cameraFramer.computePerspectiveTarget(boundingBox, camera, padding);
    viewport.setNavigationFocus?.(target.targetLookAt);
    this.perspectiveAnimator.animateToTarget(camera, target.targetPosition, target.targetLookAt, this.config);
  }

  /**
   * Fits an orthographic camera to frame the given meshes.
   *
   * @param camera The orthographic camera to animate.
   * @param meshes The meshes to frame.
   */
  private fitOrthographicViewport(camera: THREE.OrthographicCamera, meshes: THREE.Mesh[]): void {
    if (meshes.length === 0) return;
    const boundingBox = this.boundingVolumeComputer.computeWorldBoundingBox(meshes);
    const padding = this.config.getPaddingFactor();
    const target = this.cameraFramer.computeOrthographicTarget(boundingBox, camera, padding);
    const animator = this.createOrthographicAnimator();
    animator.animateToFrustum(camera, target, this.config);
    this.activeOrthographicAnimations.push(animator);
  }

  /**
   * Creates a fresh orthographic camera animator instance.
   *
   * @returns A new OrthographicCameraAnimator.
   */
  private createOrthographicAnimator(): OrthographicCameraAnimator {
    return new OrthographicCameraAnimator();
  }

  /** Advances all active orthographic animations and removes completed ones. */
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
