import * as THREE from 'three';
import { GizmoHandle } from './gizmo_handle.js';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';
import { isGizmoWantedVisible } from './gizmo_viewport_visibility.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GIZMO_FREE_ROTATE_DISC_PICK_USERDATA, GIZMO_FREE_SCALE_DISC_PICK_USERDATA } from './gizmo_visual_style.js';
import { applyGizmoScaleFreeBillboards } from './gizmo_scale_free_billboard.js';

/**
 * Picks which gizmo handle was clicked using raycasting. Converts mouse events
 * to 3D space for transform operations. Skips picking when the gizmo group is
 * hidden so invisible handles cannot steal object-selection clicks (Three.js
 * ignores Object3D.visible).
 */
export class GizmoRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;

  /** Creates a new gizmo raycaster instance. */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Picks the gizmo handle that was clicked by the user. Raycasts against the
   * meshes in the provided gizmo group (which is in the viewport scene graph
   * with correct world matrices), then matches the hit against the master
   * handles by handleId stored in userData.
   *
   * @param handles The master array of gizmo handles for ID matching.
   * @param camera The camera to cast the ray from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param gizmoGroup The viewport gizmo group whose meshes are raycast
   *   against.
   * @returns The clicked handle, or null if no handle was hit.
   */
  pickHandle(
    handles: GizmoHandle[],
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    gizmoGroup: THREE.Group,
  ): GizmoHandle | null {
    if (!this.isGizmoPickable(gizmoGroup)) return null;
    this.prepareCameraAndGroup(camera, gizmoGroup);
    this.setRayFromEvent(event, camera, pickElement);
    const meshes = this.collectHandleMeshes(gizmoGroup);
    if (meshes.length === 0) return null;
    const intersections = this.raycaster.intersectObjects(meshes, false);
    return this.findPreferredHandleHit(handles, intersections);
  }

  /**
   * Returns whether the gizmo group is eligible for handle picking based on its
   * wanted-visible flag.
   *
   * @param gizmoGroup The gizmo group to evaluate.
   * @returns True when the group is eligible for picking.
   */
  private isGizmoPickable(gizmoGroup: THREE.Group): boolean {
    return isGizmoWantedVisible(gizmoGroup);
  }

  /**
   * Updates the camera and gizmo world matrices and applies free-scale
   * billboards so pick geometry matches the current view.
   *
   * @param camera The camera used for the ray and billboard orientation.
   * @param gizmoGroup The gizmo group whose matrices and billboards are
   *   updated.
   */
  private prepareCameraAndGroup(camera: THREE.Camera, gizmoGroup: THREE.Group): void {
    camera.updateMatrixWorld(true);
    applyGizmoScaleFreeBillboards(gizmoGroup, camera);
    gizmoGroup.updateMatrixWorld(true);
  }

  /**
   * Configures the internal raycaster from a pointer event and camera.
   *
   * @param event The mouse event providing client coordinates.
   * @param camera The camera to cast from.
   * @param pickElement The DOM element whose bounds define NDC for the event.
   */
  private setRayFromEvent(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): void {
    pointerEventToNdc(event, pickElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
  }

  /**
   * Collects only real handle meshes for picking. Bounds face-pick planes and
   * other non-handle meshes are excluded so a nearer face plane cannot block a
   * farther resize handle behind the brush.
   *
   * @param group The group to traverse.
   * @returns Visible handle meshes with a handleId.
   */
  private collectHandleMeshes(group: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (child.userData['isBoundsFacePick'] === true) return;
      if (child.userData['handleId'] === undefined) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Chooses a handle from ray hits with Blender-style free-control priority:
   * center cube beats axis stems at the origin; axis rings/arrows beat free-
   * scale disc and free-rotate billboard disc volumes.
   *
   * @param handles Master handles for id matching.
   * @param intersections Ray hits sorted by distance.
   * @returns The preferred matching handle, or null.
   */
  private findPreferredHandleHit(handles: GizmoHandle[], intersections: THREE.Intersection[]): GizmoHandle | null {
    let closestAxis: GizmoHandle | null = null;
    let closestViewCube: GizmoHandle | null = null;
    let closestFreeViewVolume: GizmoHandle | null = null;
    for (const hit of intersections) {
      if (!(hit.object instanceof THREE.Mesh)) continue;
      const handle = this.findHandleForMesh(handles, hit.object);
      if (!handle) continue;
      if (handle.getAxis() !== GizmoAxis.VIEW) {
        if (!closestAxis) {
          closestAxis = handle;
        }
        continue;
      }
      if (this.isLowPriorityFreeViewPickMesh(hit.object)) {
        if (!closestFreeViewVolume) {
          closestFreeViewVolume = handle;
        }
        continue;
      }
      if (!closestViewCube) {
        closestViewCube = handle;
      }
    }
    return closestViewCube ?? closestAxis ?? closestFreeViewVolume;
  }

  /**
   * Returns whether a mesh is a free-scale or free-rotate disc pick (lower
   * priority than axis handles).
   *
   * @param mesh Intersected mesh.
   * @returns True for free VIEW volume picks.
   */
  private isLowPriorityFreeViewPickMesh(mesh: THREE.Mesh): boolean {
    return (
      mesh.userData[GIZMO_FREE_SCALE_DISC_PICK_USERDATA] === true ||
      mesh.userData[GIZMO_FREE_ROTATE_DISC_PICK_USERDATA] === true
    );
  }

  /**
   * Projects a mouse position to a 3D point at a given distance from the camera
   * along the pick ray.
   *
   * @param camera The camera to project from.
   * @param pickElement The DOM element whose bounds define NDC for the event.
   * @param event The mouse event providing the position.
   * @param distance The distance from the camera along the ray.
   * @returns The projected 3D point, or null if the ray is unavailable.
   */
  projectMouseTo3D(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    distance: number,
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, pickElement);
    if (!this.raycaster.ray) return null;
    return this.raycaster.ray.at(distance, new THREE.Vector3());
  }

  /**
   * Finds the handle for a mesh by handleId in userData, then by visual mesh
   * identity, then by ancestry under a handle visual mesh.
   *
   * @param handles The array of handles to search.
   * @param mesh The mesh to find a handle for.
   * @returns The matching handle, or null if not found.
   */
  private findHandleForMesh(handles: GizmoHandle[], mesh: THREE.Mesh): GizmoHandle | null {
    const hitHandleId = mesh.userData['handleId'];
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
   * Projects a mouse position onto a 3D plane by intersecting the camera ray
   * with that plane.
   *
   * @param camera The camera to project from.
   * @param pickElement The DOM element whose bounds define NDC for the event.
   * @param event The mouse event providing the position.
   * @param plane The plane to intersect with.
   * @returns The intersection point on the plane, or null if no intersection.
   */
  projectMouseToPlane(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    plane: THREE.Plane,
  ): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    this.setRayFromEvent(event, camera, pickElement);
    const target = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(plane, target);
    return intersected ? target.clone() : null;
  }

  /**
   * Checks if a mesh is a descendant (child or deeper) of a parent mesh.
   *
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

  /** Disposes internal Three.js resources. */
  dispose(): void {
    this.ndcVector.set(0, 0);
  }
}
