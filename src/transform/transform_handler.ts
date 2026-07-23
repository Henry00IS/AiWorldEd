import * as THREE from 'three';
import { GizmoAxis, TransformMode } from '../types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { TransformGizmo } from './transform_gizmo.js';
import { GizmoRaycaster } from './gizmo_raycaster.js';
import { TransformExecutor } from './transform_executor.js';
import { TransformConstraint } from './transform_constraint.js';
import { CommandStack } from '../commands/command_stack.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { TransformDragSession } from './transform_drag_session.js';
import { TransformProjectionMath } from './transform_projection_math.js';
import { BoundsDragController } from './bounds_drag_controller.js';
import { TransformCommandPusher } from './transform_command_pusher.js';

/**
 * Handles the drag interaction cycle for transform gizmo operations.
 * Uses absolute transforms from a pre-drag snapshot so results stay stable.
 * Rotation uses axis-plane angle measurement; scale uses distance ratios.
 */
export class TransformHandler {
  private transformGizmo: TransformGizmo;
  private gizmoRaycaster: GizmoRaycaster;
  private transformExecutor: TransformExecutor;
  private session: TransformDragSession;
  private boundsDragController: BoundsDragController;
  private commandPusher: TransformCommandPusher;

  /**
   * Creates a new transform handler.
   * @param transformGizmo The gizmo orchestrator.
   * @param gizmoRaycaster The raycaster for handle picking.
   * @param transformExecutor The executor for applying transforms.
   * @param transformConstraint The constraint math utility (kept for API stability).
   * @param commandStack Optional command stack for undo/redo support.
   */
  constructor(
    transformGizmo: TransformGizmo,
    gizmoRaycaster: GizmoRaycaster,
    transformExecutor: TransformExecutor,
    _transformConstraint: TransformConstraint,
    commandStack: CommandStack | null = null
  ) {
    this.transformGizmo = transformGizmo;
    this.gizmoRaycaster = gizmoRaycaster;
    this.transformExecutor = transformExecutor;
    this.session = new TransformDragSession();
    this.boundsDragController = new BoundsDragController(
      this.session,
      transformGizmo,
      gizmoRaycaster,
      transformExecutor
    );
    this.commandPusher = new TransformCommandPusher(
      this.session,
      transformGizmo,
      transformExecutor,
      commandStack
    );
  }

  /**
   * Sets texture lock settings used when resizing or scaling meshes.
   * @param settings Shared texture lock settings, or null to disable lock rebake.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.boundsDragController.setTextureLockSettings(settings);
  }

  /**
   * Processes a pointer down event on the gizmo.
   * Snapshots the pre-drag state of selected objects for undo support.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param handles The current gizmo handles.
   * @param selectedObjects The selected meshes to snapshot.
   * @param pivot The transform pivot point for accurate projection.
   * @param gizmoGroup The viewport gizmo group for raycasting.
   */
  onPointerDown(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    handles: GizmoHandle[],
    selectedObjects: THREE.Mesh[] = [],
    pivot: THREE.Vector3 = new THREE.Vector3(),
    gizmoGroup: THREE.Group = new THREE.Group()
  ): void {
    if (this.isMultiSelectModifierHeld(event)) return;
    if (this.transformGizmo.getMode() === TransformMode.BOUNDS) {
      this.boundsDragController.beginPointerDown(
        camera, renderer, event, handles, selectedObjects, pivot, gizmoGroup
      );
      return;
    }
    const picked = this.gizmoRaycaster.pickHandle(
      handles, camera, renderer, event, gizmoGroup
    );
    if (!picked) return;
    this.beginStandardHandleDrag(
      picked, camera, renderer, event, selectedObjects, pivot
    );
  }

  /**
   * Returns true when the event is a multi-select click (Shift/Ctrl/Meta).
   * Those clicks must reach object selection rather than gizmo/bounds picks.
   * @param event The pointer event.
   * @returns True when multi-select modifiers are held.
   */
  private isMultiSelectModifierHeld(event: MouseEvent): boolean {
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  /**
   * Starts a standard translate/rotate/scale handle drag.
   * @param picked The picked gizmo handle.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param selectedObjects Selected meshes.
   * @param pivot Transform pivot.
   */
  private beginStandardHandleDrag(
    picked: GizmoHandle,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    selectedObjects: THREE.Mesh[],
    pivot: THREE.Vector3
  ): void {
    this.session.snapshotPreDragState(selectedObjects);
    this.session.resetDragAccumulator();
    this.session.dragPivot.copy(pivot);
    this.session.dragActive = true;
    this.session.activeHandle = picked;
    this.session.activeAxis = picked.getAxis();
    this.session.dragCamera = camera;
    this.session.dragRenderer = renderer;
    this.transformGizmo.setActiveHandle(picked);
    this.captureDragStartSample(camera, renderer, event, pivot);
  }

  /**
   * Processes a pointer move event during drag.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param pivot The transform pivot point.
   * @param selectedObjects The selected meshes to transform.
   */
  onPointerMove(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    pivot: THREE.Vector3,
    selectedObjects: THREE.Mesh[]
  ): void {
    if (!this.session.dragActive) return;
    this.session.dragCamera = camera;
    this.session.dragRenderer = renderer;
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.BOUNDS) {
      this.boundsDragController.handleMove(camera, renderer, event, selectedObjects);
      return;
    }
    if (!this.session.activeHandle || !this.session.activeAxis) return;
    if (mode === TransformMode.TRANSLATE) {
      this.handleTranslateMove(camera, renderer, event, selectedObjects);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.handleRotateMove(camera, renderer, event, selectedObjects);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.handleScaleMove(camera, renderer, event, selectedObjects);
    }
  }

  /**
   * Processes a pointer up event to end the drag.
   * Pushes the accumulated transform command to the undo/redo stack.
   * @param pivot The transform pivot point used during the drag.
   * @param selectedObjects The selected meshes that were transformed.
   */
  onPointerUp(
    pivot: THREE.Vector3 = new THREE.Vector3(),
    selectedObjects: THREE.Mesh[] = []
  ): void {
    if (this.session.dragActive) {
      this.commandPusher.pushUndoCommand(pivot, selectedObjects);
    }
    this.transformGizmo.setActiveHandle(null);
    this.transformGizmo.setBoundsGuideLinesVisible(false);
    this.session.clearInteractionTargets();
  }

  /**
   * Returns whether a drag operation is currently in progress.
   * @returns True if dragging is active.
   */
  isDragging(): boolean {
    return this.session.dragActive;
  }

  /**
   * Returns the currently active gizmo axis.
   * @returns The active GizmoAxis, or null if not dragging.
   */
  getActiveAxis(): GizmoAxis | null {
    return this.session.activeAxis;
  }

  /**
   * Checks if the handler is currently busy with a drag.
   * @returns True if the handler should consume events.
   */
  isBusy(): boolean {
    return this.session.dragActive;
  }

  /**
   * Captures the mode-specific start sample used during drag.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureDragStartSample(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    pivot: THREE.Vector3
  ): void {
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      this.captureTranslateStart(camera, renderer, event, pivot);
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.captureRotateStart(camera, renderer, event, pivot);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.captureScaleStart(camera, renderer, event, pivot);
    }
  }

  /**
   * Stores the initial plane intersection for translation.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureTranslateStart(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    pivot: THREE.Vector3
  ): void {
    const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
    this.session.initialMousePosition = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
  }

  /**
   * Stores the initial direction or screen position for rotation.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureRotateStart(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    pivot: THREE.Vector3
  ): void {
    const axis = TransformProjectionMath.axisToWorldVector(
      this.session.activeAxis!,
      this.transformGizmo.getOrientation()
    );
    this.session.initialScreenPosition = TransformProjectionMath.getScreenPosition(
      renderer, event
    );
    this.session.useScreenSpaceRotation = TransformProjectionMath.isAxisEdgeOn(
      camera, axis
    );
    if (this.session.useScreenSpaceRotation) {
      this.session.initialRotationDirection = null;
      return;
    }
    this.session.rotationPlane.setFromNormalAndCoplanarPoint(axis, pivot);
    const hit = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, this.session.rotationPlane
    );
    if (!hit) {
      this.session.useScreenSpaceRotation = true;
      return;
    }
    const direction = hit.clone().sub(pivot);
    if (direction.lengthSq() < 1e-8) {
      this.session.useScreenSpaceRotation = true;
      return;
    }
    this.session.initialRotationDirection = direction.normalize();
  }

  /**
   * Stores the initial axis distance for scale ratio calculation.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param pivot The transform pivot.
   */
  private captureScaleStart(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    pivot: THREE.Vector3
  ): void {
    const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
    const hit = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
    this.session.initialMousePosition = hit;
    if (!hit || !this.session.activeAxis) {
      this.session.initialDistanceAlongAxis = 1;
      return;
    }
    const axis = TransformProjectionMath.axisToWorldVector(
      this.session.activeAxis,
      this.transformGizmo.getOrientation()
    );
    const signedDistance = hit.clone().sub(pivot).dot(axis);
    this.session.initialDistanceAlongAxis =
      Math.abs(signedDistance) < 0.05 ? 1 : signedDistance;
  }

  /**
   * Applies translation from drag start using camera-plane mouse delta.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects The meshes to translate.
   */
  private handleTranslateMove(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (!this.session.initialMousePosition || !this.session.activeAxis) return;
    const plane = TransformProjectionMath.buildCameraPlane(
      camera, this.session.dragPivot
    );
    const currentMouse = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
    if (!currentMouse) return;
    const totalDelta = currentMouse.clone().sub(this.session.initialMousePosition);
    const constrainedDelta = this.constrainDeltaToOrientedAxis(
      totalDelta,
      this.session.activeAxis
    );
    this.session.dragDeltaAccumulator.copy(constrainedDelta);
    this.transformExecutor.applyAbsoluteTranslation(
      objects,
      this.session.initialPositions,
      constrainedDelta
    );
  }

  /**
   * Projects a world delta onto oriented gizmo axes (object-local when rotated).
   * @param delta Full camera-plane mouse delta.
   * @param axis Active gizmo axis.
   * @returns Constrained world-space delta.
   */
  private constrainDeltaToOrientedAxis(
    delta: THREE.Vector3,
    axis: GizmoAxis
  ): THREE.Vector3 {
    const orientation = this.transformGizmo.getOrientation();
    if (
      axis === GizmoAxis.X ||
      axis === GizmoAxis.Y ||
      axis === GizmoAxis.Z
    ) {
      const worldAxis = TransformProjectionMath.axisToWorldVector(
        axis,
        orientation
      );
      return worldAxis.multiplyScalar(delta.dot(worldAxis));
    }
    return TransformProjectionMath.constrainDelta(delta, axis);
  }

  /**
   * Applies rotation from drag start using axis-plane angle or screen space.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects The meshes to rotate.
   */
  private handleRotateMove(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (!this.session.activeAxis) return;
    const axis = TransformProjectionMath.axisToWorldVector(
      this.session.activeAxis,
      this.transformGizmo.getOrientation()
    );
    const angle = this.computeRotationAngle(camera, renderer, event, axis);
    this.session.dragRotationAngle = angle;
    this.transformExecutor.applyAbsoluteRotation(
      objects,
      this.session.initialPositions,
      this.session.initialQuaternions,
      this.session.dragPivot,
      axis,
      angle
    );
  }

  /**
   * Computes the signed rotation angle for the current pointer sample.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param axis The rotation axis.
   * @returns Signed rotation angle in radians (pre-snap).
   */
  private computeRotationAngle(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    axis: THREE.Vector3
  ): number {
    if (
      this.session.useScreenSpaceRotation
      || !this.session.initialRotationDirection
    ) {
      return this.computeScreenSpaceRotationAngle(renderer, event);
    }
    const hit = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, this.session.rotationPlane
    );
    if (!hit) {
      return this.computeScreenSpaceRotationAngle(renderer, event);
    }
    const currentDirection = hit.clone().sub(this.session.dragPivot);
    if (currentDirection.lengthSq() < 1e-8) {
      return this.session.dragRotationAngle;
    }
    return TransformConstraint.computeRotationAngle(
      this.session.initialRotationDirection,
      currentDirection,
      axis
    );
  }

  /**
   * Computes rotation from horizontal/vertical screen mouse movement.
   * Used when the rotation plane is edge-on to the camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @returns Signed rotation angle in radians.
   */
  private computeScreenSpaceRotationAngle(
    renderer: THREE.WebGLRenderer,
    event: MouseEvent
  ): number {
    if (!this.session.initialScreenPosition) return 0;
    const current = TransformProjectionMath.getScreenPosition(renderer, event);
    const deltaX = current.x - this.session.initialScreenPosition.x;
    const deltaY = current.y - this.session.initialScreenPosition.y;
    return (deltaX + deltaY) * Math.PI * 2;
  }

  /**
   * Applies scale from drag start using signed distance ratio along the axis.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @param objects The meshes to scale.
   */
  private handleScaleMove(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    event: MouseEvent,
    objects: THREE.Mesh[]
  ): void {
    if (!this.session.activeAxis) return;
    const plane = TransformProjectionMath.buildCameraPlane(
      camera, this.session.dragPivot
    );
    const hit = this.gizmoRaycaster.projectMouseToPlane(
      camera, renderer, event, plane
    );
    if (!hit) return;
    const axis = TransformProjectionMath.axisToWorldVector(
      this.session.activeAxis,
      this.transformGizmo.getOrientation()
    );
    const currentDistance = hit.clone().sub(this.session.dragPivot).dot(axis);
    const factor = TransformConstraint.computeScaleFactor(
      this.session.initialDistanceAlongAxis,
      currentDistance
    );
    this.session.dragScaleFactor = factor;
    this.transformExecutor.applyAbsoluteScale(
      objects,
      this.session.initialPositions,
      this.session.initialScales,
      this.session.dragPivot,
      axis,
      factor,
      this.session.activeAxis
    );
    this.boundsDragController.rebakeLockedTextures(objects);
  }
}
