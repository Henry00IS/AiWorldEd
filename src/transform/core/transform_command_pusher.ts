import * as THREE from 'three';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { TransformExecutor } from './transform_executor.js';
import { CommandStack } from '@/commands/command_stack.js';
import { UndoCommand } from '@/commands/command_undo.js';
import {
  CommandTransformTranslate,
  ObjectTransformSnapshot,
} from '@/transform/commands/command_transform_translate.js';
import { CommandTransformRotate, ObjectRotationSnapshot } from '@/transform/commands/command_transform_rotate.js';
import { CommandTransformScale, ObjectScaleSnapshot } from '@/transform/commands/command_transform_scale.js';
import {
  CommandTransformBoundsResize,
  BoundsResizeSnapshot,
} from '@/transform/commands/command_transform_bounds_resize.js';
import { CommandTransformTextureLocked } from '@/transform/commands/command_transform_texture_locked.js';
import { captureTransformTextureState } from '@/transform/commands/state_transform_texture.js';
import { TransformDragSession } from './session_transform_drag.js';
import { TransformProjectionMath } from './transform_projection_math.js';

/** Builds and pushes undo/redo commands after a completed transform drag. */
export class TransformCommandPusher {
  private session: TransformDragSession;
  private transformGizmo: GizmoTransform;
  private transformExecutor: TransformExecutor;
  private commandStack: CommandStack | null;

  /**
   * Creates a command pusher for transform undo support.
   *
   * @param session Shared drag session with pre-drag snapshots.
   * @param transformGizmo Gizmo used to read the active mode.
   * @param transformExecutor Executor used for snap queries.
   * @param commandStack Optional command stack; null disables undo pushes.
   */
  constructor(
    session: TransformDragSession,
    transformGizmo: GizmoTransform,
    transformExecutor: TransformExecutor,
    commandStack: CommandStack | null,
  ) {
    this.session = session;
    this.transformGizmo = transformGizmo;
    this.transformExecutor = transformExecutor;
    this.commandStack = commandStack;
  }

  /**
   * Pushes an appropriate undo command based on the current transform mode.
   *
   * @param pivot The transform pivot point.
   * @param selectedObjects The objects that were transformed.
   */
  pushUndoCommand(pivot: THREE.Vector3, selectedObjects: THREE.Object3D[]): void {
    if (!this.commandStack) return;
    const mode = this.transformGizmo.getMode();
    if (mode === TransformMode.TRANSLATE) {
      this.pushTranslateCommand(selectedObjects);
    }
    if (mode === TransformMode.ROTATE) {
      this.pushRotateCommand(selectedObjects);
    }
    if (mode === TransformMode.SCALE) {
      this.pushScaleCommand(pivot, selectedObjects);
    }
    if (mode === TransformMode.BOUNDS) {
      this.pushBoundsUndoCommand(selectedObjects);
    }
  }

  /**
   * Pushes translate or bounds-resize undo depending on the active bounds drag.
   *
   * @param selectedObjects Objects that were transformed.
   */
  private pushBoundsUndoCommand(selectedObjects: THREE.Object3D[]): void {
    if (this.session.isBoundsFaceMove) {
      this.pushTranslateCommand(selectedObjects);
      return;
    }
    if (this.session.isBoundsResize) {
      this.pushBoundsResizeCommand(selectedObjects);
    }
  }

  /**
   * Creates and pushes a bounds resize command from final object state.
   *
   * @param selectedObjects Objects that were resized.
   */
  private pushBoundsResizeCommand(selectedObjects: THREE.Object3D[]): void {
    const snapshots = this.buildBoundsResizeSnapshots(selectedObjects);
    const changed = snapshots.some((snapshot) => {
      const posChanged = snapshot.originalPosition.distanceToSquared(snapshot.finalPosition) > 1e-12;
      const scaleChanged = snapshot.originalScale.distanceToSquared(snapshot.finalScale) > 1e-12;
      return posChanged || scaleChanged;
    });
    if (!changed) return;
    this.pushTextureAwareCommand(new CommandTransformBoundsResize(snapshots), selectedObjects);
  }

  /**
   * Builds bounds resize snapshots with original and final transforms.
   *
   * @param selectedObjects Objects to snapshot.
   * @returns Snapshot array for CommandTransformBoundsResize.
   */
  private buildBoundsResizeSnapshots(selectedObjects: THREE.Object3D[]): BoundsResizeSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalScale = this.session.initialScales.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalScale: originalScale ? originalScale.clone() : object.scale.clone(),
        finalPosition: object.position.clone(),
        finalScale: object.scale.clone(),
      };
    });
  }

  /**
   * Creates and pushes a translate command using actual final positions.
   *
   * @param selectedObjects The objects that were translated.
   */
  private pushTranslateCommand(selectedObjects: THREE.Object3D[]): void {
    const snapshots = this.buildPositionSnapshotsWithFinals(selectedObjects);
    const moved = snapshots.some((snapshot) => {
      if (!snapshot.finalPosition) return false;
      return snapshot.position.distanceToSquared(snapshot.finalPosition) > 1e-12;
    });
    if (!moved) return;
    const fallbackDelta = this.computeAverageDelta(snapshots);
    this.pushTextureAwareCommand(new CommandTransformTranslate(snapshots, fallbackDelta), selectedObjects);
  }

  /**
   * Creates and pushes a rotate command that commits the live final pose. Pose
   * change is the gate so exact typed angles still get undo when angle snap
   * would round the stored metadata angle to zero.
   *
   * @param selectedObjects The objects that were rotated.
   */
  private pushRotateCommand(selectedObjects: THREE.Object3D[]): void {
    const snapshots = this.buildRotationSnapshots(selectedObjects);
    if (!this.rotationSnapshotsHaveChange(snapshots)) {
      return;
    }
    const axisVector = this.resolveRotateCommandAxisVector();
    const commandAngle = this.resolveRotateCommandAngleRadians();
    this.pushTextureAwareCommand(
      new CommandTransformRotate(snapshots, this.session.dragPivot, axisVector, commandAngle),
      selectedObjects,
    );
  }

  /**
   * Returns whether any rotation snapshot differs from its pre-drag pose.
   *
   * @param snapshots Rotation snapshots with original and final poses.
   * @returns True when at least one object rotated or orbited.
   */
  private rotationSnapshotsHaveChange(snapshots: ObjectRotationSnapshot[]): boolean {
    return snapshots.some((snapshot) => this.rotationSnapshotHasChange(snapshot));
  }

  /**
   * Returns whether one rotation snapshot differs from its pre-drag pose.
   *
   * @param snapshot Rotation snapshot with original and final poses.
   * @returns True when position or orientation changed.
   */
  private rotationSnapshotHasChange(snapshot: ObjectRotationSnapshot): boolean {
    const finalPosition = snapshot.finalPosition;
    const finalQuaternion = snapshot.finalQuaternion;
    if (!finalPosition || !finalQuaternion) {
      return Math.abs(this.session.dragRotationAngle) > 1e-8;
    }
    if (snapshot.originalPosition.distanceToSquared(finalPosition) > 1e-12) {
      return true;
    }
    return this.quaternionDistanceSquared(snapshot.originalQuaternion, finalQuaternion) > 1e-12;
  }

  /**
   * Measures squared distance between two unit quaternions (shortest arc).
   *
   * @param a First quaternion.
   * @param b Second quaternion.
   * @returns Squared chord length between a and b on the unit sphere.
   */
  private quaternionDistanceSquared(a: THREE.Quaternion, b: THREE.Quaternion): number {
    const dot = Math.abs(a.dot(b));
    const clamped = Math.min(1, Math.max(0, dot));
    const oneMinus = 1 - clamped;
    return oneMinus * oneMinus;
  }

  /**
   * Resolves the angle stored on the rotate undo command. Prefers grid-snapped
   * angle for mouse drags; falls back to the live drag angle when snap would
   * discard a real pose change (exact numeric entry with snap enabled).
   *
   * @returns Angle in radians for command metadata and axis-angle fallback.
   */
  private resolveRotateCommandAngleRadians(): number {
    const liveAngle = this.session.dragRotationAngle;
    const snappedAngle = this.transformExecutor.getGridSnap().snapAngleRadians(liveAngle);
    if (Math.abs(snappedAngle) > 1e-8) {
      return snappedAngle;
    }
    return liveAngle;
  }

  /**
   * Resolves the world axis recorded for undo metadata and axis-angle fallback.
   *
   * @returns Unit world rotation axis from the active drag.
   */
  private resolveRotateCommandAxisVector(): THREE.Vector3 {
    if (this.session.frozenRotationAxisWorld) {
      return this.session.frozenRotationAxisWorld.clone().normalize();
    }
    if (!this.session.activeAxis) {
      return new THREE.Vector3(0, 1, 0);
    }
    return TransformProjectionMath.axisToWorldVector(this.session.activeAxis, this.transformGizmo.getOrientation());
  }

  /**
   * Creates and pushes a scale command that commits the live final pose. Pose
   * change is the gate so exact typed factors still get undo when scale snap
   * would round the stored metadata factor to one.
   *
   * @param pivot The scale pivot point (unused; drag pivot is committed).
   * @param selectedObjects The objects that were scaled.
   */
  private pushScaleCommand(pivot: THREE.Vector3, selectedObjects: THREE.Object3D[]): void {
    void pivot;
    const snapshots = this.buildScaleSnapshots(selectedObjects);
    if (!this.scaleSnapshotsHaveChange(snapshots)) {
      return;
    }
    const axisVector = this.resolveScaleCommandAxisVector();
    const commandFactor = this.resolveScaleCommandFactor();
    const gizmoAxis =
      this.session.activeAxis === GizmoAxis.X ||
      this.session.activeAxis === GizmoAxis.Y ||
      this.session.activeAxis === GizmoAxis.Z
        ? this.session.activeAxis
        : GizmoAxis.X;
    this.pushTextureAwareCommand(
      new CommandTransformScale(snapshots, this.session.dragPivot, axisVector, commandFactor, gizmoAxis),
      selectedObjects,
    );
  }

  /**
   * Returns whether any scale snapshot differs from its pre-drag pose.
   *
   * @param snapshots Scale snapshots with original and final poses.
   * @returns True when at least one object scaled or moved from the pivot.
   */
  private scaleSnapshotsHaveChange(snapshots: ObjectScaleSnapshot[]): boolean {
    return snapshots.some((snapshot) => this.scaleSnapshotHasChange(snapshot));
  }

  /**
   * Returns whether one scale snapshot differs from its pre-drag pose.
   *
   * @param snapshot Scale snapshot with original and final poses.
   * @returns True when position or scale changed.
   */
  private scaleSnapshotHasChange(snapshot: ObjectScaleSnapshot): boolean {
    const finalPosition = snapshot.finalPosition;
    const finalScale = snapshot.finalScale;
    if (!finalPosition || !finalScale) {
      return Math.abs(this.session.dragScaleFactor - 1) > 1e-8;
    }
    if (snapshot.originalPosition.distanceToSquared(finalPosition) > 1e-12) {
      return true;
    }
    return snapshot.originalScale.distanceToSquared(finalScale) > 1e-12;
  }

  /**
   * Resolves the scale factor stored on the scale undo command. Prefers
   * grid-snapped factor for mouse drags; falls back to the live drag factor
   * when snap would discard a real pose change (exact numeric entry).
   *
   * @returns Scale factor for command metadata and axis-factor fallback.
   */
  private resolveScaleCommandFactor(): number {
    const liveFactor = this.session.dragScaleFactor;
    const snappedFactor = this.transformExecutor.getGridSnap().snapScaleFactor(liveFactor);
    if (Math.abs(snappedFactor - 1) > 1e-8) {
      return snappedFactor;
    }
    return liveFactor;
  }

  /**
   * Resolves the world axis recorded for scale undo metadata and fallback.
   *
   * @returns Unit world scale axis from the active drag.
   */
  private resolveScaleCommandAxisVector(): THREE.Vector3 {
    if (!this.session.activeAxis || this.session.activeAxis === GizmoAxis.VIEW) {
      return new THREE.Vector3(1, 0, 0);
    }
    return TransformProjectionMath.axisToWorldVector(this.session.activeAxis, this.transformGizmo.getOrientation());
  }

  /**
   * Pushes a pose command wrapped with before/after texture lock UV state.
   *
   * @param poseCommand Pose-only undo command.
   * @param selectedObjects Objects transformed in this drag.
   */
  private pushTextureAwareCommand(poseCommand: UndoCommand, selectedObjects: THREE.Object3D[]): void {
    const beforeTexture = this.session.initialTextureState;
    const afterTexture = captureTransformTextureState(selectedObjects);
    const command = new CommandTransformTextureLocked(poseCommand, beforeTexture, afterTexture);
    this.commandStack?.push(command);
  }

  /**
   * Builds position snapshots including final positions after the drag.
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns Snapshots with original and final positions.
   */
  private buildPositionSnapshotsWithFinals(selectedObjects: THREE.Object3D[]): ObjectTransformSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      return {
        object,
        position: originalPos ? originalPos.clone() : object.position.clone(),
        finalPosition: object.position.clone(),
      };
    });
  }

  /**
   * Computes an average delta for fallback CommandTransformTranslate consumers.
   *
   * @param snapshots The position snapshots with finals.
   * @returns Average translation delta.
   */
  private computeAverageDelta(snapshots: ObjectTransformSnapshot[]): THREE.Vector3 {
    const delta = new THREE.Vector3();
    let count = 0;
    snapshots.forEach((snapshot) => {
      if (!snapshot.finalPosition) return;
      delta.add(snapshot.finalPosition.clone().sub(snapshot.position));
      count += 1;
    });
    if (count > 0) delta.multiplyScalar(1 / count);
    return delta;
  }

  /**
   * Builds rotation snapshots with original and live final poses.
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns An array of rotation snapshots including committed finals.
   */
  private buildRotationSnapshots(selectedObjects: THREE.Object3D[]): ObjectRotationSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalQuat = this.session.initialQuaternions.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalQuaternion: originalQuat ? originalQuat.clone() : object.quaternion.clone(),
        finalPosition: object.position.clone(),
        finalQuaternion: object.quaternion.clone(),
      };
    });
  }

  /**
   * Builds scale snapshots with original and live final poses.
   *
   * @param selectedObjects The objects to build snapshots for.
   * @returns An array of scale snapshots including committed finals.
   */
  private buildScaleSnapshots(selectedObjects: THREE.Object3D[]): ObjectScaleSnapshot[] {
    return selectedObjects.map((object) => {
      const originalPos = this.session.initialPositions.get(object);
      const originalScale = this.session.initialScales.get(object);
      return {
        object,
        originalPosition: originalPos ? originalPos.clone() : object.position.clone(),
        originalScale: originalScale ? originalScale.clone() : object.scale.clone(),
        finalPosition: object.position.clone(),
        finalScale: object.scale.clone(),
      };
    });
  }
}
