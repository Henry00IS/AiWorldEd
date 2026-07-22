import * as THREE from 'three';
import { BoundsFace, BOUNDS_FACE_USERDATA_KEY } from '../types/bounds_face.js';
import { GizmoHandle } from './gizmo_handle.js';
import { TransformGizmo } from './transform_gizmo.js';
import { GizmoRaycaster } from './gizmo_raycaster.js';
import { TransformExecutor } from './transform_executor.js';
import { BoundsFacePicker } from './bounds_face_picker.js';
import {
  computeOneSidedMeshResize,
  computeOneSidedMultiMeshResize,
  snapBoundsFaceDelta
} from './bounds_resize_math.js';
import { OrientedBoundsData } from './oriented_bounds.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { TransformDragSession } from './transform_drag_session.js';
import { TransformProjectionMath } from './transform_projection_math.js';

/**
 * Handles Bounds mode face-move and one-sided resize drag interactions.
 */
export class BoundsDragController {
  private session: TransformDragSession;
  private transformGizmo: TransformGizmo;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private boundsFacePicker: BoundsFacePicker;
  private textureLock: TextureLockSettings | null;

  /**
   * Creates a bounds drag controller bound to a shared drag session.
   * @param session Shared drag session state.
   * @param transformGizmo The gizmo orchestrator.
   * @param gizmoRaycaster Raycaster for handle and plane projection.
   * @param transformExecutor Executor for absolute translation.
   */
  constructor(
    session: TransformDragSession,
    transformGizmo: TransformGizmo,
    gizmoRaycaster: GizmoRaycaster,
    transformExecutor: TransformExecutor
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.gizmoRaycaster = gizmoRaycaster;
    this.transformExecutor = transformExecutor;
    this.boundsFacePicker = new BoundsFacePicker();
    this.textureLock = null;
  }

  /**
   * Sets texture lock settings used when resizing meshes.
   * @param settings Shared texture lock settings, or null to disable rebake.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Starts Bounds interaction: resize handle first, then face-plane move.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param handles Current gizmo handles.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   */
  beginPointerDown(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group
  ): void {
    if (this.tryBeginResizeDrag(
      camera, renderer, event, handles, selectedObjects, pivot, gizmoGroup
    )) {
      return;
    }
    this.beginFaceMoveDrag(
      camera, renderer, event, selectedObjects, pivot, gizmoGroup
    );
  }

  /**
   * Dispatches Bounds sub-mode drag updates.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  handleMove(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (this.session.isBoundsFaceMove) {
      this.handleFaceTranslate(camera, renderer, event, objects);
      return;
    }
    if (this.session.isBoundsResize) {
      this.handleResize(camera, renderer, event, objects);
    }
  }

  /**
   * Starts a one-sided bounds resize when a face handle is hit.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param handles Current handles.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   * @returns True when a resize drag was started.
   */
  private tryBeginResizeDrag(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group
  ): boolean {
    const picked = this.gizmoRaycaster.pickHandle(
      handles, camera, renderer, event, gizmoGroup
    );
    if (!picked) return false;
    const face = this.readBoundsFaceFromHandle(picked);
    if (!face) return false;
    const bounds = this.transformGizmo.getCurrentBounds();
    if (!bounds) return false;
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.isBoundsResize = true;
    this.session.activeHandle = picked;
    this.session.activeBoundsFace = face;
    this.session.startBounds = this.cloneBounds(bounds);
    this.session.dragCamera = camera;
    this.session.dragRenderer = renderer;
    this.transformGizmo.setActiveHandle(picked);
    this.captureResizeStart(camera, renderer, event, bounds, face);
    this.transformGizmo.setBoundsGuideLinesVisible(true);
    return true;
  }

  /**
   * Starts a face-plane translation when a bounds face is hit.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   * @param gizmoGroup Viewport gizmo group.
   */
  private beginFaceMoveDrag(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3,
    gizmoGroup: THREE.Group
  ): void {
    const pick = this.boundsFacePicker.pickFace(
      event, camera, renderer, gizmoGroup
    );
    if (!pick) return;
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.isBoundsFaceMove = true;
    this.session.activeBoundsFace = pick.face;
    this.session.boundsMovePlane.setFromNormalAndCoplanarPoint(
      pick.normal, pick.point
    );
    this.session.dragCamera = camera;
    this.session.dragRenderer = renderer;
    this.session.initialMousePosition = pick.point.clone();
    this.transformGizmo.setBoundsGuideLinesVisible(true);
  }

  /**
   * Translates selection on the picked bounds face plane.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  private handleFaceTranslate(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (!this.session.initialMousePosition) return;
    const current = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, this.session.boundsMovePlane
    );
    if (!current) return;
    const totalDelta = current.clone().sub(this.session.initialMousePosition);
    this.session.dragDeltaAccumulator.copy(totalDelta);
    this.transformExecutor.applyAbsoluteTranslation(
      objects,
      this.session.initialPositions,
      totalDelta
    );
  }

  /**
   * Applies one-sided resize along the active bounds face normal.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects Selected meshes.
   */
  private handleResize(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (
      !this.session.initialMousePosition
      || !this.session.activeBoundsFace
      || !this.session.startBounds
    ) {
      return;
    }
    const plane = TransformProjectionMath.buildCameraPlane(
      camera, this.session.initialMousePosition
    );
    const current = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
    if (!current) return;
    const outward = this.getActiveFaceWorldNormal();
    const rawDelta = current.clone().sub(this.session.initialMousePosition).dot(outward);
    const gridSnap = this.transformExecutor.getGridSnap();
    const startFaceCoordinate = this.getActiveFaceStartCoordinate(outward);
    const snappedDelta = snapBoundsFaceDelta(
      rawDelta,
      gridSnap.isEnabled(),
      gridSnap.getInterval(),
      startFaceCoordinate
    );
    this.session.boundsDeltaAlongNormal = snappedDelta;
    this.applyResizeToObjects(objects, snappedDelta);
  }

  /**
   * Projects the active face center at drag start onto its outward normal.
   * @param outward Unit outward normal for the active face.
   * @returns Scalar face coordinate along the normal, or 0 when unavailable.
   */
  private getActiveFaceStartCoordinate(outward: THREE.Vector3): number {
    if (!this.session.startBounds || !this.session.activeBoundsFace) return 0;
    const half = this.getFaceHalfExtent(
      this.session.startBounds, this.session.activeBoundsFace
    );
    const faceCenter = this.session.startBounds.center
      .clone()
      .addScaledVector(outward, half);
    return faceCenter.dot(outward);
  }

  /**
   * Returns the half-extent along the axis of a bounds face.
   * @param bounds Oriented bounds at drag start.
   * @param face The face being resized.
   * @returns Half-extent along that face's axis.
   */
  private getFaceHalfExtent(
    bounds: OrientedBoundsData,
    face: BoundsFace
  ): number {
    if (face === BoundsFace.POS_X || face === BoundsFace.NEG_X) {
      return bounds.halfExtents.x;
    }
    if (face === BoundsFace.POS_Y || face === BoundsFace.NEG_Y) {
      return bounds.halfExtents.y;
    }
    return bounds.halfExtents.z;
  }

  /**
   * Writes absolute one-sided resize results onto all selected objects.
   * @param objects Selected meshes.
   * @param deltaAlongNormal Snapped face displacement.
   */
  private applyResizeToObjects(
    objects: THREE.Mesh[],
    deltaAlongNormal: number
  ): void {
    if (!this.session.activeBoundsFace || !this.session.startBounds) return;
    const multi = objects.length > 1;
    objects.forEach((mesh) => {
      const startPos = this.session.initialPositions.get(mesh);
      const startScale = this.session.initialScales.get(mesh);
      if (!startPos || !startScale) return;
      const result = multi
        ? computeOneSidedMultiMeshResize(
          startPos,
          startScale,
          this.session.startBounds!,
          this.session.activeBoundsFace!,
          deltaAlongNormal
        )
        : computeOneSidedMeshResize(
          startPos,
          startScale,
          this.session.startBounds!,
          this.session.activeBoundsFace!,
          deltaAlongNormal
        );
      mesh.position.copy(result.position);
      mesh.scale.copy(result.scale);
    });
    this.rebakeLockedTextures(objects);
  }

  /**
   * Re-bakes world planar UVs when texture lock is enabled.
   * @param objects Meshes whose scale or bounds just changed.
   */
  rebakeLockedTextures(objects: THREE.Mesh[]): void {
    this.textureLock?.rebakeMeshesIfLocked(objects);
  }

  /**
   * Reads the bounds face id stored on a handle mesh.
   * @param handle The gizmo handle.
   * @returns Bounds face, or null.
   */
  private readBoundsFaceFromHandle(handle: GizmoHandle): BoundsFace | null {
    const face = handle.getVisualMesh().userData[BOUNDS_FACE_USERDATA_KEY];
    if (typeof face !== 'string') return null;
    return face as BoundsFace;
  }

  /**
   * Stores the initial mouse sample for a bounds resize drag.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param bounds Bounds at drag start.
   * @param face The face being resized.
   */
  private captureResizeStart(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    bounds: OrientedBoundsData,
    face: BoundsFace
  ): void {
    const outward = this.computeFaceWorldNormal(bounds, face);
    const half = this.getFaceHalfExtent(bounds, face);
    const faceCenter = bounds.center.clone().addScaledVector(outward, half);
    const plane = TransformProjectionMath.buildCameraPlane(camera, faceCenter);
    this.session.initialMousePosition = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
  }

  /**
   * Returns the outward world normal for the active bounds face.
   * @returns Normalized world normal.
   */
  private getActiveFaceWorldNormal(): THREE.Vector3 {
    if (!this.session.startBounds || !this.session.activeBoundsFace) {
      return new THREE.Vector3(1, 0, 0);
    }
    return this.computeFaceWorldNormal(
      this.session.startBounds, this.session.activeBoundsFace
    );
  }

  /**
   * Computes a face outward normal in world space.
   * @param bounds Oriented bounds.
   * @param face Face identifier.
   * @returns Normalized world normal.
   */
  private computeFaceWorldNormal(
    bounds: OrientedBoundsData,
    face: BoundsFace
  ): THREE.Vector3 {
    const local = new THREE.Vector3();
    if (face === BoundsFace.POS_X) local.set(1, 0, 0);
    else if (face === BoundsFace.NEG_X) local.set(-1, 0, 0);
    else if (face === BoundsFace.POS_Y) local.set(0, 1, 0);
    else if (face === BoundsFace.NEG_Y) local.set(0, -1, 0);
    else if (face === BoundsFace.POS_Z) local.set(0, 0, 1);
    else local.set(0, 0, -1);
    return local.applyQuaternion(bounds.quaternion).normalize();
  }

  /**
   * Clones oriented bounds data.
   * @param bounds Source bounds.
   * @returns Independent copy.
   */
  private cloneBounds(bounds: OrientedBoundsData): OrientedBoundsData {
    return {
      center: bounds.center.clone(),
      quaternion: bounds.quaternion.clone(),
      halfExtents: bounds.halfExtents.clone()
    };
  }
}
