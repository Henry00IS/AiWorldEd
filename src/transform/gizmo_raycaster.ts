import * as THREE from 'three';
import { GizmoHandle } from './gizmo_handle.js';
import { pointerEventToNdc } from '../utils/pointer_ndc.js';

/**
 * Picks which gizmo handle was clicked using raycasting.
 * Converts mouse events to 3D space for transform operations.
 * Skips picking when the gizmo group is hidden so invisible handles
 * cannot steal object-selection clicks (Three.js ignores Object3D.visible).
 */
export class GizmoRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;

  /**
   * Creates a new gizmo raycaster instance.
   */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Picks the gizmo handle that was clicked by the user.
   * Raycasts against the meshes in the provided gizmo group (which is in the
   * viewport scene graph with correct world matrices), then matches the hit
   * against the master handles by handleId stored in userData.
   * @param handles The master array of gizmo handles for ID matching.
   * @param camera The camera to cast the ray from.
   * @param renderer The renderer for canvas dimensions.
   * @param event The mouse event providing the click position.
   * @param gizmoGroup The viewport gizmo group whose meshes are raycast against.
   * @returns The clicked handle, or null if no handle was hit.
   */
  pickHandle(
    handles: GizmoHandle[],
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    gizmoGroup: THREE.Group
  ): GizmoHandle | null {
    if (!this.isGizmoPickable(gizmoGroup)) return null;
    this.prepareCameraAndGroup(camera, gizmoGroup);
    this.setRayFromEvent(event, camera, renderer);
    const meshes = this.collectHandleMeshes(gizmoGroup);
    if (meshes.length === 0) return null;
    const intersections = this.raycaster.intersectObjects(meshes, false);
    return this.findFirstHandleHit(handles, intersections);
  }

  /**
   * Returns whether the gizmo group should participate in handle picking.
   * Hidden gizmo groups must not intercept object selection.
   * @param gizmoGroup The viewport gizmo group.
   * @returns True when the group is visible and eligible for picking.
   */
  private isGizmoPickable(gizmoGroup: THREE.Group): boolean {
    return gizmoGroup.visible === true;
  }

  /**
   * Ensures camera and gizmo world matrices match the current transforms.
   * @param camera The camera used for the ray.
   * @param gizmoGroup The gizmo group that will be tested.
   */
  private prepareCameraAndGroup(
    camera: THREE.Camera,
    gizmoGroup: THREE.Group
  ): void {
    camera.updateMatrixWorld(true);
    gizmoGroup.updateMatrixWorld(true);
  }

  /**
   * Configures the internal raycaster from a pointer event and camera.
   * @param event The mouse event.
   * @param camera The camera to cast from.
   * @param renderer The renderer providing canvas bounds.
   */
  private setRayFromEvent(
    event: MouseEvent,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ): void {
    pointerEventToNdc(event, renderer.domElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
  }

  /**
   * Collects only real handle meshes for picking.
   * Bounds face-pick planes and other non-handle meshes are excluded so a
   * nearer face plane cannot block a farther resize handle behind the brush.
   * @param group The group to traverse.
   * @returns Visible handle meshes with a handleId.
   */
  private collectHandleMeshes(group: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (child.userData.isBoundsFacePick === true) return;
      if (child.userData.handleId === undefined) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Returns the closest intersection that maps to a known gizmo handle.
   * @param handles Master handles for id matching.
   * @param intersections Ray hits sorted by distance.
   * @returns The matching handle, or null.
   */
  private findFirstHandleHit(
    handles: GizmoHandle[],
    intersections: THREE.Intersection[]
  ): GizmoHandle | null {
    for (const hit of intersections) {
      if (!(hit.object instanceof THREE.Mesh)) continue;
      const handle = this.findHandleForMesh(handles, hit.object);
      if (handle) return handle;
    }
    return null;
  }

  /**
   * Projects a mouse position to a 3D point at a given distance from the camera.
   * @param camera The camera to project from.
   * @param renderer The renderer for canvas dimensions.
   * @param event The mouse event providing the position.
   * @param distance The distance from the camera along the ray.
   * @returns The projected 3D point, or null if projection fails.
   */
  projectMouseTo3D(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    distance: number
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, renderer);
    if (!this.raycaster.ray) return null;
    return this.raycaster.ray.at(distance, new THREE.Vector3());
  }

  /**
   * Finds the handle that contains the given mesh.
   * Matches by handleId stored in userData, which survives viewport cloning.
   * @param handles The array of handles to search.
   * @param mesh The mesh to find a handle for.
   * @returns The matching handle, or null if not found.
   */
  private findHandleForMesh(handles: GizmoHandle[], mesh: THREE.Mesh): GizmoHandle | null {
    const hitHandleId = mesh.userData.handleId;
    if (hitHandleId !== undefined) {
      for (const handle of handles) {
        if (handle.getHandleId() === hitHandleId) return handle;
      }
    }
    for (const handle of handles) {
      if (handle.getVisualMesh() === mesh) return handle;
    }
    for (const handle of handles) {
      const visualMesh = handle.getVisualMesh();
      if (this.isDescendantOf(mesh, visualMesh)) return handle;
    }
    return null;
  }

  /**
   * Projects a mouse position onto a 3D plane by intersecting the camera ray.
   * This provides accurate projection distances based on the pivot point location.
   * @param camera The camera to project from.
   * @param renderer The renderer for canvas dimensions.
   * @param event The mouse event providing the position.
   * @param plane The plane to intersect with.
   * @returns The intersection point on the plane, or null if no intersection.
   */
  projectMouseToPlane(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    plane: THREE.Plane
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, renderer);
    const target = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(plane, target);
    return intersected ? target.clone() : null;
  }

  /**
   * Checks if a mesh is a descendant (child or deeper) of a parent mesh.
   * @param child The potential child mesh.
   * @param parent The potential parent mesh.
   * @returns True if child is a descendant of parent.
   */
  private isDescendantOf(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = child.parent;
    while (current !== null) {
      if (current === parent) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Disposes internal Three.js resources.
   */
  dispose(): void {
    this.ndcVector.set(0, 0);
  }
}
